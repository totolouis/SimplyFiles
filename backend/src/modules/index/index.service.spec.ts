import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { Test, TestingModule } from "@nestjs/testing";
import { getRepositoryToken } from "@nestjs/typeorm";
import { IndexService, probeEntry } from "./index.service";
import { File } from "../files/file.entity";
import { SyncReport } from "./sync-report.entity";
import { StaleCleaner } from "./stale-cleaner";
import { DiskImporter } from "./disk-importer";
import { Reindexer, ReindexResult } from "./reindexer";
import { SyncOperationDetail } from "./index.service";

// ─── Helpers ───

function mockRepo() {
  const repo: any = {
    find: jest.fn().mockResolvedValue([]),
    findOne: jest.fn().mockResolvedValue(null),
    findOneBy: jest.fn().mockResolvedValue(null),
    count: jest.fn().mockResolvedValue(0),
    query: jest.fn().mockResolvedValue([]),
    create: jest.fn((data: any) => ({
      id: "generated-id",
      createdAt: new Date(),
      ...data,
    })),
    save: jest.fn((entity: any) => Promise.resolve(entity)),
    remove: jest.fn().mockResolvedValue(undefined),
  };
  return repo;
}

function mockStaleCleaner() {
  return {
    removeStaleFiles: jest
      .fn()
      .mockResolvedValue({ label: "Stale files removed", items: [] }),
    removeStaleFolders: jest
      .fn()
      .mockResolvedValue({ label: "Stale folders removed", items: [] }),
    fixBrokenSymlinks: jest
      .fn()
      .mockResolvedValue({ label: "Broken symlinks fixed", items: [] }),
  };
}

function mockDiskImporter() {
  return {
    importFromDisk: jest.fn().mockResolvedValue([
      { label: "Files imported", items: [] },
      { label: "Folders imported", items: [] },
    ] as SyncOperationDetail[]),
  };
}

function mockReindexer() {
  return {
    reindex: jest
      .fn()
      .mockResolvedValue({ indexed: [], queued: 0, failed: 0 } as ReindexResult),
  };
}

// ─────────────────────────────────────────
// IndexService tests
// ─────────────────────────────────────────
describe("IndexService", () => {
  let service: IndexService;
  let filesRepo: ReturnType<typeof mockRepo>;
  let syncReportsRepo: ReturnType<typeof mockRepo>;
  let staleCleaner: ReturnType<typeof mockStaleCleaner>;
  let diskImporter: ReturnType<typeof mockDiskImporter>;
  let reindexer: ReturnType<typeof mockReindexer>;

  beforeEach(async () => {
    filesRepo = mockRepo();
    syncReportsRepo = mockRepo();
    staleCleaner = mockStaleCleaner();
    diskImporter = mockDiskImporter();
    reindexer = mockReindexer();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        IndexService,
        { provide: getRepositoryToken(File), useValue: filesRepo },
        { provide: getRepositoryToken(SyncReport), useValue: syncReportsRepo },
        { provide: StaleCleaner, useValue: staleCleaner },
        { provide: DiskImporter, useValue: diskImporter },
        { provide: Reindexer, useValue: reindexer },
      ],
    }).compile();

    service = module.get<IndexService>(IndexService);
  });

  // ── getStats ──

  describe("getStats", () => {
    it("should return total, indexed, unindexed counts and byType breakdown", async () => {
      filesRepo.count.mockResolvedValue(10);
      filesRepo.query
        .mockResolvedValueOnce([{ indexed: 7 }])
        .mockResolvedValueOnce([
          { id: "1", filename: "a.pdf", mimeType: "application/pdf", storagePath: "/x" },
          { id: "2", filename: "b.txt", mimeType: "text/plain", storagePath: "/y" },
          { id: "3", filename: "c.bin", mimeType: "application/octet-stream", storagePath: "/z" },
        ]);

      const stats = await service.getStats();

      expect(stats.total).toBe(10);
      expect(stats.indexed).toBe(7);
      expect(stats.unindexed).toBe(3);
      expect(stats.byType).toEqual({ pdf: 1, text: 1, other: 1 });
    });

    it("should handle zero files", async () => {
      filesRepo.count.mockResolvedValue(0);
      filesRepo.query
        .mockResolvedValueOnce([{ indexed: 0 }])
        .mockResolvedValueOnce([]);

      const stats = await service.getStats();

      expect(stats).toEqual({ total: 0, indexed: 0, unindexed: 0, byType: {} });
    });
  });

  // ── sync ──

  describe("sync", () => {
    it("should orchestrate all sync steps and save a report", async () => {
      const result = await service.sync(null);

      expect(result.id).toBeDefined();
      expect(result.createdAt).toBeInstanceOf(Date);
      const labels = result.operations.map((o) => o.label);
      expect(labels).toContain("Stale files removed");
      expect(labels).toContain("Stale folders removed");
      expect(labels).toContain("Broken symlinks fixed");
      expect(labels).toContain("Files imported");
      expect(labels).toContain("Folders imported");
      expect(labels).toContain("Files reindexed");
      expect(syncReportsRepo.save).toHaveBeenCalled();
    });

    it("should delegate stale cleaning to StaleCleaner", async () => {
      staleCleaner.removeStaleFiles.mockResolvedValue({
        label: "Stale files removed",
        items: ["gone.txt"],
      });
      staleCleaner.removeStaleFolders.mockResolvedValue({
        label: "Stale folders removed",
        items: ["old-folder"],
      });

      const result = await service.sync(null);

      expect(staleCleaner.removeStaleFiles).toHaveBeenCalledWith(null);
      expect(staleCleaner.removeStaleFolders).toHaveBeenCalledWith(null);
      expect(staleCleaner.fixBrokenSymlinks).toHaveBeenCalled();

      const staleFilesOp = result.operations.find((o) => o.label === "Stale files removed");
      expect(staleFilesOp!.items).toEqual(["gone.txt"]);
      const staleFoldersOp = result.operations.find((o) => o.label === "Stale folders removed");
      expect(staleFoldersOp!.items).toEqual(["old-folder"]);
    });

    it("should delegate disk import to DiskImporter", async () => {
      diskImporter.importFromDisk.mockResolvedValue([
        { label: "Files imported", items: ["newfile.txt"] },
        { label: "Folders imported", items: ["linked-dir"] },
      ]);

      const result = await service.sync("folder-123");

      expect(diskImporter.importFromDisk).toHaveBeenCalledWith("folder-123");
      const filesOp = result.operations.find((o) => o.label === "Files imported");
      expect(filesOp!.items).toEqual(["newfile.txt"]);
      const foldersOp = result.operations.find((o) => o.label === "Folders imported");
      expect(foldersOp!.items).toEqual(["linked-dir"]);
    });

    it("should delegate reindexing to Reindexer", async () => {
      reindexer.reindex.mockResolvedValue({
        indexed: ["unindexed.txt"],
        queued: 1,
        failed: 0,
      });

      const result = await service.sync(null);

      expect(reindexer.reindex).toHaveBeenCalled();
      const reindexOp = result.operations.find((o) => o.label === "Files reindexed");
      expect(reindexOp!.items).toEqual(["unindexed.txt"]);
    });

    it("should include failed imports in report", async () => {
      diskImporter.importFromDisk.mockResolvedValue([
        { label: "Files imported", items: [] },
        { label: "Folders imported", items: [] },
        { label: "Failed to import", items: ["bad-file.txt"] },
      ]);

      const result = await service.sync(null);

      const failedOp = result.operations.find((o) => o.label === "Failed to import");
      expect(failedOp!.items).toEqual(["bad-file.txt"]);
    });
  });

  // ── listReports ──

  describe("listReports", () => {
    it("should return reports ordered by createdAt DESC with limit 50", async () => {
      const reports = [{ id: "1", createdAt: new Date(), operations: [] }];
      syncReportsRepo.find.mockResolvedValue(reports);

      const result = await service.listReports();

      expect(result).toBe(reports);
      expect(syncReportsRepo.find).toHaveBeenCalledWith({
        order: { createdAt: "DESC" },
        take: 50,
      });
    });
  });

  // ── reindexMissing ──

  describe("reindexMissing", () => {
    it("should delegate to Reindexer and return counts", async () => {
      reindexer.reindex.mockResolvedValue({
        indexed: ["file1.txt", "file2.txt"],
        queued: 3,
        failed: 1,
      });

      const result = await service.reindexMissing();

      expect(result).toEqual({ queued: 3, indexed: 2, failed: 1 });
    });

    it("should return zeros when nothing to reindex", async () => {
      const result = await service.reindexMissing();

      expect(result).toEqual({ queued: 0, indexed: 0, failed: 0 });
    });
  });

  // ── importFolder ──

  describe("importFolder", () => {
    it("should delegate to sync and convert result", async () => {
      const result = await service.importFolder(null);

      expect(result).toHaveProperty("imported");
      expect(result).toHaveProperty("importedFolders");
      expect(result).toHaveProperty("skipped");
      expect(result).toHaveProperty("failed");
      expect(result).toHaveProperty("removedFiles");
      expect(result).toHaveProperty("removedFolders");
      expect(result).toHaveProperty("files");
    });

    it("should map sync operations to legacy format", async () => {
      staleCleaner.removeStaleFiles.mockResolvedValue({
        label: "Stale files removed",
        items: ["stale.txt"],
      });
      diskImporter.importFromDisk.mockResolvedValue([
        { label: "Files imported", items: ["new.txt", "another.txt"] },
        { label: "Folders imported", items: ["dir"] },
        { label: "Failed to import", items: ["bad.txt"] },
      ]);

      const result = await service.importFolder("folder-1");

      expect(result.imported).toBe(2);
      expect(result.importedFolders).toBe(1);
      expect(result.failed).toBe(1);
      expect(result.removedFiles).toBe(1);
      expect(result.files).toEqual(["new.txt", "another.txt"]);
    });
  });
});

// ─────────────────────────────────────────
// probeEntry tests
// ─────────────────────────────────────────
describe("probeEntry", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "probe-test-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("should detect a regular file", async () => {
    const filePath = path.join(tmpDir, "hello.txt");
    fs.writeFileSync(filePath, "hello world");

    const info = await probeEntry(filePath, "hello.txt");

    expect(info.isSymlink).toBe(false);
    expect(info.isBroken).toBe(false);
    expect(info.targetIsDirectory).toBe(false);
    expect(info.targetSize).toBe(11);
    expect(info.targetMimeType).toBe("text/plain");
  });

  it("should detect a regular directory", async () => {
    const dirPath = path.join(tmpDir, "subdir");
    fs.mkdirSync(dirPath);

    const info = await probeEntry(dirPath, "subdir");

    expect(info.isSymlink).toBe(false);
    expect(info.isBroken).toBe(false);
    expect(info.targetIsDirectory).toBe(true);
  });

  it("should detect a symlink to a file", async () => {
    const targetPath = path.join(tmpDir, "target.txt");
    fs.writeFileSync(targetPath, "symlink target");
    const linkPath = path.join(tmpDir, "link.txt");
    fs.symlinkSync(targetPath, linkPath);

    const info = await probeEntry(linkPath, "link.txt");

    expect(info.isSymlink).toBe(true);
    expect(info.isBroken).toBe(false);
    expect(info.targetIsDirectory).toBe(false);
    expect(info.targetSize).toBe(14);
    expect(info.targetMimeType).toBe("text/plain");
  });

  it("should detect a symlink to a directory", async () => {
    const targetDir = path.join(tmpDir, "target-dir");
    fs.mkdirSync(targetDir);
    const linkPath = path.join(tmpDir, "link-dir");
    fs.symlinkSync(targetDir, linkPath);

    const info = await probeEntry(linkPath, "link-dir");

    expect(info.isSymlink).toBe(true);
    expect(info.isBroken).toBe(false);
    expect(info.targetIsDirectory).toBe(true);
  });

  it("should detect a broken symlink (ENOENT)", async () => {
    const linkPath = path.join(tmpDir, "broken-link");
    fs.symlinkSync("/nonexistent/path/that/does/not/exist", linkPath);

    const info = await probeEntry(linkPath, "broken-link");

    expect(info.isSymlink).toBe(true);
    expect(info.isBroken).toBe(true);
    expect(info.targetIsDirectory).toBe(false);
    expect(info.targetSize).toBe(0);
    expect(info.targetMimeType).toBe("application/octet-stream");
  });

  it("should detect a broken symlink when target is deleted after creation", async () => {
    const targetPath = path.join(tmpDir, "will-be-deleted.txt");
    fs.writeFileSync(targetPath, "temporary");
    const linkPath = path.join(tmpDir, "link-to-deleted");
    fs.symlinkSync(targetPath, linkPath);
    fs.unlinkSync(targetPath);

    const info = await probeEntry(linkPath, "link-to-deleted");

    expect(info.isSymlink).toBe(true);
    expect(info.isBroken).toBe(true);
    expect(info.targetSize).toBe(0);
  });

  it("should use mime-types lookup based on entry name", async () => {
    const filePath = path.join(tmpDir, "document.pdf");
    fs.writeFileSync(filePath, "fake pdf");

    const info = await probeEntry(filePath, "document.pdf");

    expect(info.targetMimeType).toBe("application/pdf");
  });

  it("should fall back to application/octet-stream for unknown extensions", async () => {
    const filePath = path.join(tmpDir, "data.xyz123");
    fs.writeFileSync(filePath, "unknown");

    const info = await probeEntry(filePath, "data.xyz123");

    expect(info.targetMimeType).toBe("application/octet-stream");
  });

  it("should reject for non-existent path (not a symlink)", async () => {
    await expect(probeEntry(path.join(tmpDir, "nope"), "nope")).rejects.toThrow();
  });
});
