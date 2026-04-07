import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { Test, TestingModule } from "@nestjs/testing";
import { getRepositoryToken } from "@nestjs/typeorm";
import { StaleCleaner } from "./stale-cleaner";
import { File } from "../files/file.entity";
import { Folder } from "../folders/folder.entity";
import { PathService } from "../../common/path.service";

function mockRepo() {
  return {
    find: jest.fn().mockResolvedValue([]),
    remove: jest.fn().mockResolvedValue(undefined),
    query: jest.fn().mockResolvedValue(undefined),
  };
}

describe("StaleCleaner", () => {
  let cleaner: StaleCleaner;
  let filesRepo: ReturnType<typeof mockRepo>;
  let foldersRepo: ReturnType<typeof mockRepo>;
  let pathService: { folderFsPath: jest.Mock };
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "stale-cleaner-test-"));
    filesRepo = mockRepo();
    foldersRepo = mockRepo();
    pathService = { folderFsPath: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StaleCleaner,
        { provide: getRepositoryToken(File), useValue: filesRepo },
        { provide: getRepositoryToken(Folder), useValue: foldersRepo },
        { provide: PathService, useValue: pathService },
      ],
    }).compile();

    cleaner = module.get(StaleCleaner);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  // ── removeStaleFiles ──

  describe("removeStaleFiles", () => {
    it("should remove files whose storagePath no longer exists on disk", async () => {
      const staleFile = {
        id: "f1",
        filename: "gone.txt",
        storagePath: "/nonexistent/gone.txt",
        isSymlink: false,
      };
      filesRepo.find.mockResolvedValue([staleFile]);

      const result = await cleaner.removeStaleFiles(null);

      expect(result.label).toBe("Stale files removed");
      expect(result.items).toContain("gone.txt");
      expect(filesRepo.query).toHaveBeenCalledWith(
        "DELETE FROM file_index_chunks WHERE file_id = $1",
        ["f1"],
      );
      expect(filesRepo.remove).toHaveBeenCalledWith(staleFile);
    });

    it("should keep files that exist on disk", async () => {
      const filePath = path.join(tmpDir, "exists.txt");
      fs.writeFileSync(filePath, "data");

      filesRepo.find.mockResolvedValue([
        { id: "f2", filename: "exists.txt", storagePath: filePath, isSymlink: false },
      ]);

      const result = await cleaner.removeStaleFiles(null);

      expect(result.items).toHaveLength(0);
      expect(filesRepo.remove).not.toHaveBeenCalled();
    });

    it("should use lstat for symlink files", async () => {
      const target = path.join(tmpDir, "target.txt");
      fs.writeFileSync(target, "data");
      const link = path.join(tmpDir, "link.txt");
      fs.symlinkSync(target, link);

      filesRepo.find.mockResolvedValue([
        { id: "f3", filename: "link.txt", storagePath: link, isSymlink: true },
      ]);

      const result = await cleaner.removeStaleFiles(null);

      expect(result.items).toHaveLength(0);
    });

    it("should remove symlink files when symlink itself is gone", async () => {
      filesRepo.find.mockResolvedValue([
        { id: "f4", filename: "dead-link.txt", storagePath: "/nonexistent/link", isSymlink: true },
      ]);

      const result = await cleaner.removeStaleFiles(null);

      expect(result.items).toContain("dead-link.txt");
      expect(filesRepo.remove).toHaveBeenCalled();
    });

    it("should return empty items when no files in DB", async () => {
      const result = await cleaner.removeStaleFiles(null);

      expect(result.items).toHaveLength(0);
    });
  });

  // ── removeStaleFolders ──

  describe("removeStaleFolders", () => {
    it("should remove folders whose directory no longer exists on disk", async () => {
      const staleFolder = {
        id: "d1",
        name: "old-folder",
        isSymlink: false,
      };
      foldersRepo.find.mockResolvedValue([staleFolder]);
      pathService.folderFsPath.mockResolvedValue("/nonexistent/old-folder");

      const result = await cleaner.removeStaleFolders(null);

      expect(result.label).toBe("Stale folders removed");
      expect(result.items).toContain("old-folder");
      expect(foldersRepo.remove).toHaveBeenCalledWith(staleFolder);
    });

    it("should keep folders that exist on disk", async () => {
      const folderDir = path.join(tmpDir, "real-folder");
      fs.mkdirSync(folderDir);

      foldersRepo.find.mockResolvedValue([
        { id: "d2", name: "real-folder", isSymlink: false },
      ]);
      pathService.folderFsPath.mockResolvedValue(folderDir);

      const result = await cleaner.removeStaleFolders(null);

      expect(result.items).toHaveLength(0);
      expect(foldersRepo.remove).not.toHaveBeenCalled();
    });

    it("should use lstat for symlink folders", async () => {
      const target = path.join(tmpDir, "real-dir");
      fs.mkdirSync(target);
      const link = path.join(tmpDir, "link-dir");
      fs.symlinkSync(target, link);

      foldersRepo.find.mockResolvedValue([
        { id: "d3", name: "link-dir", isSymlink: true },
      ]);
      pathService.folderFsPath.mockResolvedValue(link);

      const result = await cleaner.removeStaleFolders(null);

      expect(result.items).toHaveLength(0);
    });
  });

  // ── fixBrokenSymlinks ──

  describe("fixBrokenSymlinks", () => {
    it("should remove broken file symlinks from DB and disk", async () => {
      const linkPath = path.join(tmpDir, "broken-file");
      fs.symlinkSync("/nonexistent/target", linkPath);

      filesRepo.find.mockResolvedValue([
        { id: "bf1", filename: "broken-file", storagePath: linkPath, isSymlink: true },
      ]);
      foldersRepo.find.mockResolvedValue([]);

      const result = await cleaner.fixBrokenSymlinks();

      expect(result.label).toBe("Broken symlinks fixed");
      expect(result.items).toContain("File: broken-file");
      expect(filesRepo.remove).toHaveBeenCalled();
      expect(() => fs.lstatSync(linkPath)).toThrow();
    });

    it("should remove broken folder symlinks from DB and disk", async () => {
      const linkPath = path.join(tmpDir, "broken-folder");
      fs.symlinkSync("/nonexistent/folder", linkPath);

      filesRepo.find.mockResolvedValue([]);
      foldersRepo.find.mockResolvedValue([
        { id: "bf2", name: "broken-folder", isSymlink: true },
      ]);
      pathService.folderFsPath.mockResolvedValue(linkPath);

      const result = await cleaner.fixBrokenSymlinks();

      expect(result.items).toContain("Folder: broken-folder");
      expect(foldersRepo.remove).toHaveBeenCalled();
      expect(() => fs.lstatSync(linkPath)).toThrow();
    });

    it("should not remove valid symlinks", async () => {
      const target = path.join(tmpDir, "real.txt");
      fs.writeFileSync(target, "data");
      const link = path.join(tmpDir, "valid-link.txt");
      fs.symlinkSync(target, link);

      filesRepo.find.mockResolvedValue([
        { id: "vf1", filename: "valid-link.txt", storagePath: link, isSymlink: true },
      ]);
      foldersRepo.find.mockResolvedValue([]);

      const result = await cleaner.fixBrokenSymlinks();

      expect(result.items).toHaveLength(0);
      expect(filesRepo.remove).not.toHaveBeenCalled();
    });

    it("should return empty items when no symlinks exist", async () => {
      filesRepo.find.mockResolvedValue([]);
      foldersRepo.find.mockResolvedValue([]);

      const result = await cleaner.fixBrokenSymlinks();

      expect(result.items).toHaveLength(0);
    });
  });
});
