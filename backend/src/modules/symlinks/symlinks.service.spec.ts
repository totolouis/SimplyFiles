import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException, UnprocessableEntityException, InternalServerErrorException } from '@nestjs/common';
import { SymlinksService } from './symlinks.service';
import { Folder } from '../folders/folder.entity';
import { PathService } from '../../common/path.service';
import { FileSymlinkCreator } from './file-symlink-creator';
import { FolderSymlinkCreator } from './folder-symlink-creator';
import { ItemType } from '../../common/item-type.enum';
import { DataSource } from 'typeorm';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

describe('SymlinksService', () => {
  let service: SymlinksService;
  let foldersRepo: any;
  let dataSource: any;
  let pathService: any;
  let fileCreator: any;
  let folderCreator: any;
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'symlinks-svc-test-'));

    foldersRepo = {
      findOne: jest.fn(),
    };

    dataSource = {
      query: jest.fn().mockResolvedValue([]),
    };

    pathService = {
      folderFsPath: jest.fn().mockResolvedValue(tmpDir),
      ensureDir: jest.fn(),
      ensureDirAsync: jest.fn().mockResolvedValue(undefined),
    };

    fileCreator = {
      resolveTarget: jest.fn(),
      uniqueSymlinkPath: jest.fn(),
      createRecord: jest.fn(),
      fixBroken: jest.fn().mockResolvedValue(0),
    };

    folderCreator = {
      resolveTarget: jest.fn(),
      uniqueSymlinkPath: jest.fn(),
      createRecord: jest.fn(),
      fixBroken: jest.fn().mockResolvedValue(0),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SymlinksService,
        { provide: getRepositoryToken(Folder), useValue: foldersRepo },
        { provide: DataSource, useValue: dataSource },
        { provide: PathService, useValue: pathService },
        { provide: FileSymlinkCreator, useValue: fileCreator },
        { provide: FolderSymlinkCreator, useValue: folderCreator },
      ],
    }).compile();

    service = module.get<SymlinksService>(SymlinksService);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('search', () => {
    it('should return empty array for empty query', async () => {
      const result = await service.search('');
      expect(result).toEqual([]);
      expect(dataSource.query).not.toHaveBeenCalled();
    });

    it('should return empty array for single-char query', async () => {
      const result = await service.search('a');
      expect(result).toEqual([]);
    });

    it('should return empty array for undefined query', async () => {
      const result = await service.search(undefined);
      expect(result).toEqual([]);
    });

    it('should execute SQL search for valid query', async () => {
      const mockResults = [
        { id: 'id-1', name: 'report.pdf', type: 'file', path: 'Documents', mimeType: 'application/pdf' },
        { id: 'id-2', name: 'reports', type: 'folder', path: 'Root', mimeType: null },
      ];
      dataSource.query.mockResolvedValue(mockResults);

      const result = await service.search('report');

      expect(result).toEqual(mockResults);
      expect(dataSource.query).toHaveBeenCalledTimes(1);
      const callArgs = dataSource.query.mock.calls[0];
      expect(callArgs[1]).toEqual(['report']);
    });

    it('should return empty array on SQL error', async () => {
      dataSource.query.mockRejectedValue(new Error('DB error'));

      const result = await service.search('test');
      expect(result).toEqual([]);
    });
  });

  describe('create', () => {
    it('should create a file symlink', async () => {
      const srcDir = path.join(tmpDir, 'source');
      fs.mkdirSync(srcDir);
      const targetPath = path.join(srcDir, 'original.txt');
      fs.writeFileSync(targetPath, 'original content');

      const symlinkPath = path.join(tmpDir, 'original.txt');

      fileCreator.resolveTarget.mockResolvedValue({
        fsPath: targetPath,
        name: 'original.txt',
      });
      fileCreator.uniqueSymlinkPath.mockResolvedValue(symlinkPath);
      fileCreator.createRecord.mockResolvedValue({
        id: 'new-id',
        type: ItemType.File,
        name: 'original.txt',
        isSymlink: true,
      });

      const result = await service.create({
        targetId: 'target-file-id',
        targetType: ItemType.File,
        destinationFolderId: null,
      });

      expect(result.type).toBe(ItemType.File);
      expect(result.isSymlink).toBe(true);
      expect(result.name).toBe('original.txt');
      expect(fileCreator.resolveTarget).toHaveBeenCalledWith('target-file-id');
      expect(fileCreator.createRecord).toHaveBeenCalled();
      // Verify symlink was created on disk
      expect(fs.lstatSync(symlinkPath).isSymbolicLink()).toBe(true);
    });

    it('should create a folder symlink', async () => {
      const srcDir = path.join(tmpDir, 'source');
      fs.mkdirSync(srcDir);
      const targetDir = path.join(srcDir, 'target-folder');
      fs.mkdirSync(targetDir);

      const symlinkPath = path.join(tmpDir, 'target-folder');

      folderCreator.resolveTarget.mockResolvedValue({
        fsPath: targetDir,
        name: 'target-folder',
      });
      folderCreator.uniqueSymlinkPath.mockResolvedValue(symlinkPath);
      folderCreator.createRecord.mockResolvedValue({
        id: 'new-folder-id',
        type: ItemType.Folder,
        name: 'target-folder',
        isSymlink: true,
      });

      const result = await service.create({
        targetId: 'target-folder-id',
        targetType: ItemType.Folder,
        destinationFolderId: null,
      });

      expect(result.type).toBe(ItemType.Folder);
      expect(result.isSymlink).toBe(true);
      expect(result.name).toBe('target-folder');
      expect(folderCreator.resolveTarget).toHaveBeenCalledWith('target-folder-id');
    });

    it('should throw NotFoundException if target file does not exist in DB', async () => {
      fileCreator.resolveTarget.mockRejectedValue(new NotFoundException('Target file not found'));

      await expect(service.create({
        targetId: 'nonexistent',
        targetType: ItemType.File,
        destinationFolderId: null,
      })).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException if target folder does not exist in DB', async () => {
      folderCreator.resolveTarget.mockRejectedValue(new NotFoundException('Target folder not found'));

      await expect(service.create({
        targetId: 'nonexistent',
        targetType: ItemType.Folder,
        destinationFolderId: null,
      })).rejects.toThrow(NotFoundException);
    });

    it('should throw 422 if target file does not exist on disk', async () => {
      fileCreator.resolveTarget.mockResolvedValue({
        fsPath: '/nonexistent/gone.txt',
        name: 'gone.txt',
      });

      await expect(service.create({
        targetId: 'target-id',
        targetType: ItemType.File,
        destinationFolderId: null,
      })).rejects.toThrow(UnprocessableEntityException);
    });

    it('should handle name collisions with suffix', async () => {
      // Create existing file at the destination with same name
      const existingPath = path.join(tmpDir, 'collision.txt');
      fs.writeFileSync(existingPath, 'existing');

      const targetDir = path.join(tmpDir, 'sub');
      fs.mkdirSync(targetDir);
      const targetPath = path.join(targetDir, 'collision.txt');
      fs.writeFileSync(targetPath, 'target content');

      const symlinkPath = path.join(tmpDir, 'collision (1).txt');

      fileCreator.resolveTarget.mockResolvedValue({
        fsPath: targetPath,
        name: 'collision.txt',
      });
      fileCreator.uniqueSymlinkPath.mockResolvedValue(symlinkPath);
      fileCreator.createRecord.mockResolvedValue({
        id: 'new-id',
        type: ItemType.File,
        name: 'collision (1).txt',
        isSymlink: true,
      });

      const result = await service.create({
        targetId: 'target-id',
        targetType: ItemType.File,
        destinationFolderId: null,
      });

      expect(result.name).toBe('collision (1).txt');
      expect(fs.lstatSync(symlinkPath).isSymbolicLink()).toBe(true);
    });

    it('should throw NotFoundException if destination folder does not exist', async () => {
      fileCreator.resolveTarget.mockResolvedValue({
        fsPath: path.join(tmpDir, 'file.txt'),
        name: 'file.txt',
      });
      foldersRepo.findOne.mockResolvedValue(null);

      await expect(service.create({
        targetId: 'target-id',
        targetType: ItemType.File,
        destinationFolderId: 'nonexistent-folder',
      })).rejects.toThrow(NotFoundException);
    });

    it('should rollback filesystem symlink if DB save fails', async () => {
      const srcDir = path.join(tmpDir, 'source');
      fs.mkdirSync(srcDir);
      const targetPath = path.join(srcDir, 'target-for-rollback.txt');
      fs.writeFileSync(targetPath, 'data');

      const symlinkPath = path.join(tmpDir, 'target-for-rollback.txt');

      fileCreator.resolveTarget.mockResolvedValue({
        fsPath: targetPath,
        name: 'target-for-rollback.txt',
      });
      fileCreator.uniqueSymlinkPath.mockResolvedValue(symlinkPath);
      fileCreator.createRecord.mockRejectedValue(new Error('DB save failed'));

      await expect(service.create({
        targetId: 'target-id',
        targetType: ItemType.File,
        destinationFolderId: null,
      })).rejects.toThrow(InternalServerErrorException);

      // Symlink should have been cleaned up
      expect(() => fs.lstatSync(symlinkPath)).toThrow();
    });
  });

  describe('fixBroken', () => {
    it('should delegate to both creators and sum results', async () => {
      fileCreator.fixBroken.mockResolvedValue(2);
      folderCreator.fixBroken.mockResolvedValue(1);

      const result = await service.fixBroken();

      expect(result).toEqual({ deletedFiles: 2, deletedFolders: 1 });
    });

    it('should return zero counts when no broken symlinks', async () => {
      const result = await service.fixBroken();
      expect(result).toEqual({ deletedFiles: 0, deletedFolders: 0 });
    });
  });
});
