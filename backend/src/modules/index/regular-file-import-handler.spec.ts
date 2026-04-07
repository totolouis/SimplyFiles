import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { Test, TestingModule } from "@nestjs/testing";
import { getRepositoryToken } from "@nestjs/typeorm";
import { RegularFileImportHandler } from "./regular-file-import-handler";
import { File } from "../files/file.entity";
import { FileIndexService } from "../search/file-index.service";
import { SymlinkInfo } from "./probe-entry";

function mockRepo() {
  return {
    create: jest.fn((data: any) => ({ ...data })),
    save: jest.fn((entity: any) => Promise.resolve(entity)),
  };
}

describe("RegularFileImportHandler", () => {
  let handler: RegularFileImportHandler;
  let filesRepo: ReturnType<typeof mockRepo>;
  let fileIndexService: { indexFile: jest.Mock };
  let tmpDir: string;

  const regularFileInfo: SymlinkInfo = {
    isSymlink: false,
    isBroken: false,
    targetIsDirectory: false,
    targetSize: 42,
    targetMimeType: "text/plain",
  };

  const symlinkFileInfo: SymlinkInfo = {
    isSymlink: true,
    isBroken: false,
    targetIsDirectory: false,
    targetSize: 42,
    targetMimeType: "text/plain",
  };

  beforeEach(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "reg-handler-test-"));
    filesRepo = mockRepo();
    fileIndexService = { indexFile: jest.fn().mockResolvedValue(true) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RegularFileImportHandler,
        { provide: getRepositoryToken(File), useValue: filesRepo },
        { provide: FileIndexService, useValue: fileIndexService },
      ],
    }).compile();

    handler = module.get(RegularFileImportHandler);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe("canHandle", () => {
    it("should return true for any info (fallback handler)", () => {
      expect(handler.canHandle(regularFileInfo)).toBe(true);
      expect(handler.canHandle(symlinkFileInfo)).toBe(true);
      expect(
        handler.canHandle({
          isSymlink: true,
          isBroken: true,
          targetIsDirectory: true,
          targetSize: 0,
          targetMimeType: "",
        }),
      ).toBe(true);
    });
  });

  describe("handle", () => {
    it("should read file, create entity, save, and index", async () => {
      const filePath = path.join(tmpDir, "hello.txt");
      fs.writeFileSync(filePath, "hello world");

      const result = await handler.handle(filePath, "folder-1", regularFileInfo, new Set());

      expect(result).toEqual({ type: "file", name: "hello.txt" });
      expect(filesRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          filename: "hello.txt",
          folderId: "folder-1",
          mimeType: "text/plain",
          size: 42,
          storagePath: filePath,
          isSymlink: false,
        }),
      );
      expect(filesRepo.save).toHaveBeenCalled();
      expect(fileIndexService.indexFile).toHaveBeenCalledWith(
        expect.objectContaining({ filename: "hello.txt" }),
        expect.any(Buffer),
      );
    });

    it("should return null when path exists in existingPaths", async () => {
      const filePath = path.join(tmpDir, "existing.txt");
      fs.writeFileSync(filePath, "data");

      const result = await handler.handle(
        filePath,
        null,
        regularFileInfo,
        new Set([filePath]),
      );

      expect(result).toBeNull();
      expect(filesRepo.create).not.toHaveBeenCalled();
      expect(fileIndexService.indexFile).not.toHaveBeenCalled();
    });

    it("should detect MIME type from file extension", async () => {
      const pdfPath = path.join(tmpDir, "doc.pdf");
      fs.writeFileSync(pdfPath, "fake pdf");

      await handler.handle(pdfPath, null, regularFileInfo, new Set());

      expect(filesRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ mimeType: "application/pdf" }),
      );
    });

    it("should fall back to application/octet-stream for unknown extensions", async () => {
      const unknownPath = path.join(tmpDir, "data.xyz999");
      fs.writeFileSync(unknownPath, "unknown");

      await handler.handle(unknownPath, null, regularFileInfo, new Set());

      expect(filesRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ mimeType: "application/octet-stream" }),
      );
    });

    it("should mark symlink files with isSymlink true", async () => {
      const filePath = path.join(tmpDir, "link-target.txt");
      fs.writeFileSync(filePath, "data");

      await handler.handle(filePath, null, symlinkFileInfo, new Set());

      expect(filesRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ isSymlink: true }),
      );
    });

    it("should generate a UUID for the file id", async () => {
      const filePath = path.join(tmpDir, "uuid-test.txt");
      fs.writeFileSync(filePath, "data");

      await handler.handle(filePath, null, regularFileInfo, new Set());

      const createdEntity = filesRepo.create.mock.calls[0][0];
      expect(createdEntity.id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
      );
    });

    it("should handle null folderId", async () => {
      const filePath = path.join(tmpDir, "root.txt");
      fs.writeFileSync(filePath, "root file");

      const result = await handler.handle(filePath, null, regularFileInfo, new Set());

      expect(result).toEqual({ type: "file", name: "root.txt" });
      expect(filesRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ folderId: null }),
      );
    });
  });
});
