import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { Test, TestingModule } from "@nestjs/testing";
import { getRepositoryToken } from "@nestjs/typeorm";
import { Reindexer } from "./reindexer";
import { File } from "../files/file.entity";
import { FileIndexService } from "../search/file-index.service";

function mockRepo() {
  return {
    query: jest.fn().mockResolvedValue([]),
    findOneBy: jest.fn().mockResolvedValue(null),
  };
}

describe("Reindexer", () => {
  let reindexer: Reindexer;
  let filesRepo: ReturnType<typeof mockRepo>;
  let fileIndexService: { indexFile: jest.Mock };
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "reindexer-test-"));
    filesRepo = mockRepo();
    fileIndexService = { indexFile: jest.fn().mockResolvedValue(true) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        Reindexer,
        { provide: getRepositoryToken(File), useValue: filesRepo },
        { provide: FileIndexService, useValue: fileIndexService },
      ],
    }).compile();

    reindexer = module.get(Reindexer);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("should index files that have no chunks", async () => {
    const filePath = path.join(tmpDir, "unindexed.txt");
    fs.writeFileSync(filePath, "needs indexing");

    const fileEntity = { id: "u1", filename: "unindexed.txt", storagePath: filePath };
    filesRepo.query
      .mockResolvedValueOnce([
        { id: "u1", filename: "unindexed.txt", mimeType: "text/plain", storagePath: filePath },
      ])
      .mockResolvedValueOnce([]);
    filesRepo.findOneBy.mockResolvedValue(fileEntity);

    const result = await reindexer.reindex();

    expect(result.indexed).toEqual(["unindexed.txt"]);
    expect(result.queued).toBe(1);
    expect(result.failed).toBe(0);
    expect(fileIndexService.indexFile).toHaveBeenCalledWith(fileEntity, expect.any(Buffer));
  });

  it("should count failed when file not on disk", async () => {
    filesRepo.query
      .mockResolvedValueOnce([
        { id: "m1", filename: "missing.txt", mimeType: "text/plain", storagePath: "/nonexistent" },
      ])
      .mockResolvedValueOnce([]);

    const result = await reindexer.reindex();

    expect(result.indexed).toHaveLength(0);
    expect(result.queued).toBe(1);
    expect(result.failed).toBe(1);
    expect(fileIndexService.indexFile).not.toHaveBeenCalled();
  });

  it("should count failed when file not found in DB after read", async () => {
    const filePath = path.join(tmpDir, "exists.txt");
    fs.writeFileSync(filePath, "data");

    filesRepo.query
      .mockResolvedValueOnce([
        { id: "n1", filename: "exists.txt", mimeType: "text/plain", storagePath: filePath },
      ])
      .mockResolvedValueOnce([]);
    filesRepo.findOneBy.mockResolvedValue(null);

    const result = await reindexer.reindex();

    expect(result.indexed).toHaveLength(0);
    expect(result.failed).toBe(1);
  });

  it("should count failed when indexFile throws", async () => {
    const filePath = path.join(tmpDir, "error.txt");
    fs.writeFileSync(filePath, "data");

    const fileEntity = { id: "e1", filename: "error.txt", storagePath: filePath };
    filesRepo.query
      .mockResolvedValueOnce([
        { id: "e1", filename: "error.txt", mimeType: "text/plain", storagePath: filePath },
      ])
      .mockResolvedValueOnce([]);
    filesRepo.findOneBy.mockResolvedValue(fileEntity);
    fileIndexService.indexFile.mockRejectedValue(new Error("index error"));

    const result = await reindexer.reindex();

    expect(result.indexed).toHaveLength(0);
    expect(result.failed).toBe(1);
  });

  it("should return empty result when nothing to reindex", async () => {
    const result = await reindexer.reindex();

    expect(result).toEqual({ indexed: [], queued: 0, failed: 0 });
  });

  it("should process multiple batches", async () => {
    const rows = Array.from({ length: 100 }, (_, i) => ({
      id: `b-${i}`,
      filename: `f${i}.txt`,
      mimeType: "text/plain",
      storagePath: "/nonexistent",
    }));
    filesRepo.query
      .mockResolvedValueOnce(rows) // full batch → triggers another iteration
      .mockResolvedValueOnce([]); // empty → stops

    const result = await reindexer.reindex();

    expect(result.queued).toBe(100);
    expect(result.failed).toBe(100);
  });

  it("should index multiple files in a single batch", async () => {
    const file1 = path.join(tmpDir, "a.txt");
    const file2 = path.join(tmpDir, "b.txt");
    fs.writeFileSync(file1, "aaa");
    fs.writeFileSync(file2, "bbb");

    filesRepo.query
      .mockResolvedValueOnce([
        { id: "a1", filename: "a.txt", mimeType: "text/plain", storagePath: file1 },
        { id: "b1", filename: "b.txt", mimeType: "text/plain", storagePath: file2 },
      ])
      .mockResolvedValueOnce([]);
    filesRepo.findOneBy
      .mockResolvedValueOnce({ id: "a1", filename: "a.txt", storagePath: file1 })
      .mockResolvedValueOnce({ id: "b1", filename: "b.txt", storagePath: file2 });

    const result = await reindexer.reindex();

    expect(result.indexed).toEqual(["a.txt", "b.txt"]);
    expect(result.queued).toBe(2);
    expect(result.failed).toBe(0);
    expect(fileIndexService.indexFile).toHaveBeenCalledTimes(2);
  });
});
