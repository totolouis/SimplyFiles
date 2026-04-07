import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException } from '@nestjs/common';
import { FoldersService } from './folders.service';
import { Folder } from './folder.entity';
import { PathService } from '../../common/path.service';
import { DataSource } from 'typeorm';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

describe('FoldersService (symlink behavior)', () => {
  let service: FoldersService;
  let foldersRepo: any;
  let pathService: any;
  let dataSource: any;
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'folders-svc-test-'));

    foldersRepo = {
      findOne: jest.fn(),
      find: jest.fn().mockResolvedValue([]),
      create: jest.fn((data) => ({ ...data })),
      save: jest.fn((entity) => Promise.resolve(entity)),
      remove: jest.fn(),
    };

    dataSource = {
      query: jest.fn().mockResolvedValue([]),
    };

    pathService = {
      folderFsPath: jest.fn(),
      ensureDir: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FoldersService,
        { provide: getRepositoryToken(Folder), useValue: foldersRepo },
        { provide: PathService, useValue: pathService },
        { provide: DataSource, useValue: dataSource },
      ],
    }).compile();

    service = module.get<FoldersService>(FoldersService);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('delete (soft-delete)', () => {
    it('should soft-delete folder and its files via SQL', async () => {
      const folder = { id: 'folder-1', name: 'regular-folder', isSymlink: false };
      foldersRepo.findOne.mockResolvedValue(folder);

      await service.delete('folder-1');

      // Should run two SQL queries: one for folders, one for files
      expect(dataSource.query).toHaveBeenCalledTimes(2);
      // First call: soft-delete descendant folders
      expect(dataSource.query.mock.calls[0][1][0]).toBe('folder-1');
      // Second call: soft-delete files under folder tree
      expect(dataSource.query.mock.calls[1][1][0]).toBe('folder-1');
    });

    it('should throw NotFoundException if folder not in DB', async () => {
      foldersRepo.findOne.mockResolvedValue(null);

      await expect(service.delete('nonexistent')).rejects.toThrow(NotFoundException);
    });
  });

  describe('permanentDelete', () => {
    it('should permanently delete a regular folder with rmSync', async () => {
      const dirPath = path.join(tmpDir, 'regular-folder');
      fs.mkdirSync(dirPath);
      fs.writeFileSync(path.join(dirPath, 'file.txt'), 'data');

      const folder = { id: 'folder-1', name: 'regular-folder', isSymlink: false };
      foldersRepo.findOne.mockResolvedValue(folder);
      pathService.folderFsPath.mockResolvedValue(dirPath);

      await service.permanentDelete('folder-1');

      expect(foldersRepo.remove).toHaveBeenCalledWith(folder);
      expect(fs.existsSync(dirPath)).toBe(false);
    });

    it('should permanently delete a symlink folder with unlinkSync (not rmSync)', async () => {
      const targetDir = path.join(tmpDir, 'target-dir');
      fs.mkdirSync(targetDir);
      fs.writeFileSync(path.join(targetDir, 'inside.txt'), 'keep me');

      const linkPath = path.join(tmpDir, 'symlink-folder');
      fs.symlinkSync(targetDir, linkPath);

      const folder = { id: 'folder-2', name: 'symlink-folder', isSymlink: true };
      foldersRepo.findOne.mockResolvedValue(folder);
      pathService.folderFsPath.mockResolvedValue(linkPath);

      await service.permanentDelete('folder-2');

      expect(() => fs.lstatSync(linkPath)).toThrow();
      expect(fs.existsSync(targetDir)).toBe(true);
      expect(fs.readFileSync(path.join(targetDir, 'inside.txt'), 'utf-8')).toBe('keep me');
      expect(foldersRepo.remove).toHaveBeenCalledWith(folder);
    });

    it('should permanently delete a broken symlink folder', async () => {
      const linkPath = path.join(tmpDir, 'broken-folder-link');
      fs.symlinkSync('/nonexistent/dir', linkPath);

      const folder = { id: 'folder-3', name: 'broken-folder-link', isSymlink: true };
      foldersRepo.findOne.mockResolvedValue(folder);
      pathService.folderFsPath.mockResolvedValue(linkPath);

      await service.permanentDelete('folder-3');

      expect(() => fs.lstatSync(linkPath)).toThrow();
      expect(foldersRepo.remove).toHaveBeenCalledWith(folder);
    });

    it('should handle permanent deletion when folder does not exist on disk', async () => {
      const folder = { id: 'folder-4', name: 'gone', isSymlink: false };
      foldersRepo.findOne.mockResolvedValue(folder);
      pathService.folderFsPath.mockResolvedValue(path.join(tmpDir, 'gone'));

      await service.permanentDelete('folder-4');

      expect(foldersRepo.remove).toHaveBeenCalledWith(folder);
    });

    it('should silently return if folder not in DB', async () => {
      foldersRepo.findOne.mockResolvedValue(null);

      await expect(service.permanentDelete('nonexistent')).resolves.toBeUndefined();
    });
  });

  describe('rename', () => {
    it('should rename a regular folder and update storage paths', async () => {
      const oldDir = path.join(tmpDir, 'old-name');
      const newDir = path.join(tmpDir, 'new-name');
      fs.mkdirSync(oldDir);

      const folder = { id: 'folder-5', name: 'old-name', isSymlink: false };
      foldersRepo.findOne.mockResolvedValue(folder);
      // First call returns old path, second returns new path
      pathService.folderFsPath
        .mockResolvedValueOnce(oldDir)
        .mockResolvedValueOnce(newDir);

      await service.rename('folder-5', 'new-name');

      expect(folder.name).toBe('new-name');
      expect(foldersRepo.save).toHaveBeenCalled();
      expect(fs.existsSync(newDir)).toBe(true);
      expect(fs.existsSync(oldDir)).toBe(false);
      // Should update storage paths for regular folders
      expect(dataSource.query).toHaveBeenCalled();
    });

    it('should rename a symlink folder without updating storage paths', async () => {
      const targetDir = path.join(tmpDir, 'real-target');
      fs.mkdirSync(targetDir);

      const oldDir = path.join(tmpDir, 'old-link-name');
      const newDir = path.join(tmpDir, 'new-link-name');
      fs.symlinkSync(targetDir, oldDir);

      const folder = { id: 'folder-6', name: 'old-link-name', isSymlink: true };
      foldersRepo.findOne.mockResolvedValue(folder);
      pathService.folderFsPath
        .mockResolvedValueOnce(oldDir)
        .mockResolvedValueOnce(newDir);

      await service.rename('folder-6', 'new-link-name');

      expect(folder.name).toBe('new-link-name');
      expect(foldersRepo.save).toHaveBeenCalled();
      // Symlink node should be renamed
      expect(fs.lstatSync(newDir).isSymbolicLink()).toBe(true);
      expect(() => fs.lstatSync(oldDir)).toThrow();
      // Target unchanged
      expect(fs.existsSync(targetDir)).toBe(true);
      // Should NOT update storage paths for symlink folders
      expect(dataSource.query).not.toHaveBeenCalled();
    });

    it('should throw NotFoundException if folder not in DB', async () => {
      foldersRepo.findOne.mockResolvedValue(null);

      await expect(service.rename('nonexistent', 'whatever')).rejects.toThrow(NotFoundException);
    });
  });

  describe('findById', () => {
    it('should include isSymlink in file results', async () => {
      const folder = { id: 'folder-7', name: 'test', parentId: null };
      foldersRepo.findOne.mockResolvedValue(folder);
      foldersRepo.find.mockResolvedValue([]);
      dataSource.query.mockResolvedValue([
        { id: 'file-1', filename: 'test.txt', isSymlink: true },
      ]);

      const result = await service.findById('folder-7');

      expect(result.files[0]).toHaveProperty('isSymlink', true);
    });

    it('should query for indexStatus in file results', async () => {
      const folder = { id: 'folder-8', name: 'indexed-folder', parentId: null };
      foldersRepo.findOne.mockResolvedValue(folder);
      foldersRepo.find.mockResolvedValue([]);
      dataSource.query.mockResolvedValue([
        { id: 'file-1', filename: 'doc.pdf', indexStatus: 'indexed' },
        { id: 'file-2', filename: 'photo.jpg', indexStatus: 'no_content' },
        { id: 'file-3', filename: 'new.txt', indexStatus: 'pending' },
      ]);

      const result = await service.findById('folder-8');

      // Verify the SQL includes indexStatus
      const sql = dataSource.query.mock.calls[0][0];
      expect(sql).toContain('indexStatus');
      expect(sql).toContain('file_index_chunks');

      expect(result.files).toHaveLength(3);
      expect(result.files[0]).toHaveProperty('indexStatus', 'indexed');
      expect(result.files[1]).toHaveProperty('indexStatus', 'no_content');
      expect(result.files[2]).toHaveProperty('indexStatus', 'pending');
    });
  });

  describe('getRootContents', () => {
    it('should query for indexStatus in root file results', async () => {
      foldersRepo.find.mockResolvedValue([]);
      dataSource.query.mockResolvedValue([
        { id: 'file-1', filename: 'root.txt', indexStatus: 'indexed' },
      ]);

      const result = await service.getRootContents();

      const sql = dataSource.query.mock.calls[0][0];
      expect(sql).toContain('indexStatus');
      expect(sql).toContain('file_index_chunks');
      expect(result.files[0]).toHaveProperty('indexStatus', 'indexed');
    });
  });
});
