import { Test, TestingModule } from "@nestjs/testing";
import { getRepositoryToken } from "@nestjs/typeorm";
import { SymlinkFolderImportHandler } from "./symlink-folder-import-handler";
import { Folder } from "../folders/folder.entity";
import { SymlinkInfo } from "./probe-entry";

function mockRepo() {
  return {
    findOne: jest.fn().mockResolvedValue(null),
    create: jest.fn((data: any) => ({ id: "new-folder-id", ...data })),
    save: jest.fn((entity: any) => Promise.resolve(entity)),
  };
}

describe("SymlinkFolderImportHandler", () => {
  let handler: SymlinkFolderImportHandler;
  let foldersRepo: ReturnType<typeof mockRepo>;

  const symlinkDirInfo: SymlinkInfo = {
    isSymlink: true,
    isBroken: false,
    targetIsDirectory: true,
    targetSize: 0,
    targetMimeType: "application/octet-stream",
  };

  const regularFileInfo: SymlinkInfo = {
    isSymlink: false,
    isBroken: false,
    targetIsDirectory: false,
    targetSize: 100,
    targetMimeType: "text/plain",
  };

  beforeEach(async () => {
    foldersRepo = mockRepo();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SymlinkFolderImportHandler,
        { provide: getRepositoryToken(Folder), useValue: foldersRepo },
      ],
    }).compile();

    handler = module.get(SymlinkFolderImportHandler);
  });

  describe("canHandle", () => {
    it("should return true for symlinked directories", () => {
      expect(handler.canHandle(symlinkDirInfo)).toBe(true);
    });

    it("should return false for regular files", () => {
      expect(handler.canHandle(regularFileInfo)).toBe(false);
    });

    it("should return false for regular directories", () => {
      expect(handler.canHandle({ ...symlinkDirInfo, isSymlink: false })).toBe(false);
    });

    it("should return false for symlinked files", () => {
      expect(handler.canHandle({ ...symlinkDirInfo, targetIsDirectory: false })).toBe(false);
    });
  });

  describe("handle", () => {
    it("should create a folder entity with isSymlink=true", async () => {
      const result = await handler.handle(
        "/storage/linked-dir",
        "parent-1",
        symlinkDirInfo,
        new Set(),
      );

      expect(result).toEqual({ type: "folder", name: "linked-dir" });
      expect(foldersRepo.create).toHaveBeenCalledWith({
        name: "linked-dir",
        parentId: "parent-1",
        isSymlink: true,
      });
      expect(foldersRepo.save).toHaveBeenCalled();
    });

    it("should return null when folder already exists by name and parentId", async () => {
      foldersRepo.findOne.mockResolvedValue({ id: "existing", name: "linked-dir" });

      const result = await handler.handle(
        "/storage/linked-dir",
        "parent-1",
        symlinkDirInfo,
        new Set(),
      );

      expect(result).toBeNull();
      expect(foldersRepo.create).not.toHaveBeenCalled();
    });

    it("should handle null parentId (root level)", async () => {
      const result = await handler.handle(
        "/storage/root-link",
        null,
        symlinkDirInfo,
        new Set(),
      );

      expect(result).toEqual({ type: "folder", name: "root-link" });
      expect(foldersRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ parentId: null }),
      );
    });

    it("should ignore existingPaths (dedup by name, not path)", async () => {
      const result = await handler.handle(
        "/storage/linked-dir",
        null,
        symlinkDirInfo,
        new Set(["/storage/linked-dir"]),
      );

      // existingPaths contains the path, but handler doesn't use it
      expect(result).toEqual({ type: "folder", name: "linked-dir" });
    });
  });
});
