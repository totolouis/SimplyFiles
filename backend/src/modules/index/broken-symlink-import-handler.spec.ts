import { Test, TestingModule } from "@nestjs/testing";
import { getRepositoryToken } from "@nestjs/typeorm";
import { BrokenSymlinkImportHandler } from "./broken-symlink-import-handler";
import { File } from "../files/file.entity";
import { SymlinkInfo } from "./probe-entry";

function mockRepo() {
  return {
    create: jest.fn((data: any) => ({ ...data })),
    save: jest.fn((entity: any) => Promise.resolve(entity)),
  };
}

describe("BrokenSymlinkImportHandler", () => {
  let handler: BrokenSymlinkImportHandler;
  let filesRepo: ReturnType<typeof mockRepo>;

  const brokenInfo: SymlinkInfo = {
    isSymlink: true,
    isBroken: true,
    targetIsDirectory: false,
    targetSize: 0,
    targetMimeType: "application/octet-stream",
  };

  const regularInfo: SymlinkInfo = {
    isSymlink: false,
    isBroken: false,
    targetIsDirectory: false,
    targetSize: 100,
    targetMimeType: "text/plain",
  };

  beforeEach(async () => {
    filesRepo = mockRepo();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BrokenSymlinkImportHandler,
        { provide: getRepositoryToken(File), useValue: filesRepo },
      ],
    }).compile();

    handler = module.get(BrokenSymlinkImportHandler);
  });

  describe("canHandle", () => {
    it("should return true for broken symlinks", () => {
      expect(handler.canHandle(brokenInfo)).toBe(true);
    });

    it("should return false for regular files", () => {
      expect(handler.canHandle(regularInfo)).toBe(false);
    });

    it("should return false for valid symlinks", () => {
      expect(handler.canHandle({ ...brokenInfo, isBroken: false })).toBe(false);
    });
  });

  describe("handle", () => {
    it("should create a file entity with size 0 and isSymlink true", async () => {
      const result = await handler.handle(
        "/storage/broken.txt",
        "folder-1",
        brokenInfo,
        new Set(),
      );

      expect(result).toEqual({ type: "file", name: "broken.txt (broken symlink)" });
      expect(filesRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          filename: "broken.txt",
          folderId: "folder-1",
          mimeType: "application/octet-stream",
          size: 0,
          storagePath: "/storage/broken.txt",
          isSymlink: true,
        }),
      );
      expect(filesRepo.save).toHaveBeenCalled();
    });

    it("should return null when path already exists in DB", async () => {
      const result = await handler.handle(
        "/storage/broken.txt",
        null,
        brokenInfo,
        new Set(["/storage/broken.txt"]),
      );

      expect(result).toBeNull();
      expect(filesRepo.create).not.toHaveBeenCalled();
    });

    it("should handle null folderId", async () => {
      const result = await handler.handle(
        "/storage/root-broken.txt",
        null,
        brokenInfo,
        new Set(),
      );

      expect(result).toEqual({ type: "file", name: "root-broken.txt (broken symlink)" });
      expect(filesRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ folderId: null }),
      );
    });

    it("should generate a UUID for the file id", async () => {
      await handler.handle("/storage/broken.txt", null, brokenInfo, new Set());

      const createdEntity = filesRepo.create.mock.calls[0][0];
      expect(createdEntity.id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
      );
    });
  });
});
