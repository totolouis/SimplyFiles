import { Test, TestingModule } from "@nestjs/testing";
import { getRepositoryToken } from "@nestjs/typeorm";
import { DiskImporter } from "./disk-importer";
import { File } from "../files/file.entity";
import { DiskScanner, ScannedItem } from "./disk-scanner";
import { PathService } from "../../common/path.service";
import { IMPORT_ITEM_HANDLERS, ImportItemHandler } from "./import-item-handler.interface";

function mockRepo() {
  const repo: any = {
    _qbResult: [] as any[],
    createQueryBuilder: jest.fn(),
  };
  repo.createQueryBuilder.mockImplementation(() => ({
    withDeleted: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    getMany: jest.fn().mockResolvedValue(repo._qbResult),
  }));
  return repo;
}

describe("DiskImporter", () => {
  let importer: DiskImporter;
  let filesRepo: ReturnType<typeof mockRepo>;
  let diskScanner: { scan: jest.Mock };
  let pathService: { folderFsPath: jest.Mock };
  let handlers: ImportItemHandler[];
  let folderHandler: ImportItemHandler;
  let fileHandler: ImportItemHandler;

  beforeEach(async () => {
    filesRepo = mockRepo();
    diskScanner = { scan: jest.fn().mockResolvedValue([]) };
    pathService = { folderFsPath: jest.fn().mockResolvedValue("/tmp/test-dir") };

    folderHandler = {
      canHandle: jest.fn((info) => info.targetIsDirectory && info.isSymlink),
      handle: jest.fn().mockResolvedValue(null),
    };
    fileHandler = {
      canHandle: jest.fn(() => true),
      handle: jest.fn().mockResolvedValue(null),
    };
    handlers = [folderHandler, fileHandler];

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DiskImporter,
        { provide: getRepositoryToken(File), useValue: filesRepo },
        { provide: DiskScanner, useValue: diskScanner },
        { provide: PathService, useValue: pathService },
        { provide: IMPORT_ITEM_HANDLERS, useValue: handlers },
      ],
    }).compile();

    importer = module.get(DiskImporter);
  });

  it("should return empty ops when target directory does not exist", async () => {
    pathService.folderFsPath.mockResolvedValue("/nonexistent/dir");

    const ops = await importer.importFromDisk(null);

    expect(ops).toEqual([
      { label: "Files imported", items: [] },
      { label: "Folders imported", items: [] },
    ]);
    expect(diskScanner.scan).not.toHaveBeenCalled();
  });

  it("should dispatch scanned items to matching handlers", async () => {
    // Use a real temp dir so fsp.access succeeds
    const tmpDir = require("fs").mkdtempSync(require("path").join(require("os").tmpdir(), "di-"));
    pathService.folderFsPath.mockResolvedValue(tmpDir);

    const fileItem: ScannedItem = {
      path: "/some/file.txt",
      info: { isSymlink: false, isBroken: false, targetIsDirectory: false, targetSize: 10, targetMimeType: "text/plain" },
    };
    diskScanner.scan.mockResolvedValue([fileItem]);
    (fileHandler.handle as jest.Mock).mockResolvedValue({ type: "file", name: "file.txt" });

    const ops = await importer.importFromDisk(null);

    expect(fileHandler.canHandle).toHaveBeenCalledWith(fileItem.info);
    expect(fileHandler.handle).toHaveBeenCalledWith(
      "/some/file.txt",
      null,
      fileItem.info,
      expect.any(Set),
    );
    const filesOp = ops.find((o) => o.label === "Files imported");
    expect(filesOp!.items).toEqual(["file.txt"]);

    require("fs").rmSync(tmpDir, { recursive: true, force: true });
  });

  it("should dispatch folder items to folder handler", async () => {
    const tmpDir = require("fs").mkdtempSync(require("path").join(require("os").tmpdir(), "di-"));
    pathService.folderFsPath.mockResolvedValue(tmpDir);

    const folderItem: ScannedItem = {
      path: "/some/linked-dir",
      info: { isSymlink: true, isBroken: false, targetIsDirectory: true, targetSize: 0, targetMimeType: "application/octet-stream" },
    };
    diskScanner.scan.mockResolvedValue([folderItem]);
    (folderHandler.handle as jest.Mock).mockResolvedValue({ type: "folder", name: "linked-dir" });

    const ops = await importer.importFromDisk(null);

    expect(folderHandler.canHandle).toHaveBeenCalledWith(folderItem.info);
    const foldersOp = ops.find((o) => o.label === "Folders imported");
    expect(foldersOp!.items).toEqual(["linked-dir"]);

    require("fs").rmSync(tmpDir, { recursive: true, force: true });
  });

  it("should skip items when handler returns null", async () => {
    const tmpDir = require("fs").mkdtempSync(require("path").join(require("os").tmpdir(), "di-"));
    pathService.folderFsPath.mockResolvedValue(tmpDir);

    diskScanner.scan.mockResolvedValue([{
      path: "/some/existing.txt",
      info: { isSymlink: false, isBroken: false, targetIsDirectory: false, targetSize: 5, targetMimeType: "text/plain" },
    }]);
    (fileHandler.handle as jest.Mock).mockResolvedValue(null);

    const ops = await importer.importFromDisk(null);

    const filesOp = ops.find((o) => o.label === "Files imported");
    expect(filesOp!.items).toHaveLength(0);

    require("fs").rmSync(tmpDir, { recursive: true, force: true });
  });

  it("should catch handler errors and add to failed items", async () => {
    const tmpDir = require("fs").mkdtempSync(require("path").join(require("os").tmpdir(), "di-"));
    pathService.folderFsPath.mockResolvedValue(tmpDir);

    diskScanner.scan.mockResolvedValue([{
      path: "/some/bad-file.txt",
      info: { isSymlink: false, isBroken: false, targetIsDirectory: false, targetSize: 5, targetMimeType: "text/plain" },
    }]);
    (fileHandler.handle as jest.Mock).mockRejectedValue(new Error("disk error"));

    const ops = await importer.importFromDisk(null);

    const failedOp = ops.find((o) => o.label === "Failed to import");
    expect(failedOp).toBeDefined();
    expect(failedOp!.items).toEqual(["bad-file.txt"]);

    require("fs").rmSync(tmpDir, { recursive: true, force: true });
  });

  it("should load existing paths including soft-deleted files", async () => {
    const tmpDir = require("fs").mkdtempSync(require("path").join(require("os").tmpdir(), "di-"));
    pathService.folderFsPath.mockResolvedValue(tmpDir);

    filesRepo._qbResult = [{ storagePath: "/existing/path.txt" }];
    diskScanner.scan.mockResolvedValue([{
      path: "/some/new.txt",
      info: { isSymlink: false, isBroken: false, targetIsDirectory: false, targetSize: 5, targetMimeType: "text/plain" },
    }]);
    (fileHandler.handle as jest.Mock).mockResolvedValue({ type: "file", name: "new.txt" });

    await importer.importFromDisk(null);

    // Verify the handler was called with existingPaths containing the DB path
    expect(fileHandler.handle).toHaveBeenCalledWith(
      expect.anything(),
      null,
      expect.anything(),
      new Set(["/existing/path.txt"]),
    );

    require("fs").rmSync(tmpDir, { recursive: true, force: true });
  });

  it("should pass folderId through to handlers", async () => {
    const tmpDir = require("fs").mkdtempSync(require("path").join(require("os").tmpdir(), "di-"));
    pathService.folderFsPath.mockResolvedValue(tmpDir);

    diskScanner.scan.mockResolvedValue([{
      path: "/some/file.txt",
      info: { isSymlink: false, isBroken: false, targetIsDirectory: false, targetSize: 5, targetMimeType: "text/plain" },
    }]);
    (fileHandler.handle as jest.Mock).mockResolvedValue({ type: "file", name: "file.txt" });

    await importer.importFromDisk("folder-abc");

    expect(pathService.folderFsPath).toHaveBeenCalledWith("folder-abc");
    expect(fileHandler.handle).toHaveBeenCalledWith(
      expect.anything(),
      "folder-abc",
      expect.anything(),
      expect.any(Set),
    );

    require("fs").rmSync(tmpDir, { recursive: true, force: true });
  });
});
