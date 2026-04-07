import { Test, TestingModule } from "@nestjs/testing";
import { getRepositoryToken } from "@nestjs/typeorm";
import { ConfigService } from "@nestjs/config";
import {
  NotFoundException,
  UnprocessableEntityException,
} from "@nestjs/common";
import { FilesService } from "./files.service";
import { File } from "./file.entity";
import { FileIndexChunk } from "../search/file-index-chunk.entity";
import { FileIndexService } from "../search/file-index.service";
import { PathService } from "../../common/path.service";
import { DataSource } from "typeorm";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

describe("FilesService (symlink behavior)", () => {
  let service: FilesService;
  let filesRepo: any;
  let fileIndexRepo: any;
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "files-svc-test-"));

    filesRepo = {
      findOne: jest.fn(),
      find: jest.fn(),
      create: jest.fn((data) => ({ ...data })),
      save: jest.fn((entity) => Promise.resolve(entity)),
      remove: jest.fn(),
      count: jest.fn(),
      query: jest.fn(),
    };

    fileIndexRepo = {
      delete: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FilesService,
        { provide: getRepositoryToken(File), useValue: filesRepo },
        {
          provide: getRepositoryToken(FileIndexChunk),
          useValue: fileIndexRepo,
        },
        { provide: DataSource, useValue: { query: jest.fn() } },
        {
          provide: PathService,
          useValue: {
            folderFsPath: jest.fn().mockResolvedValue(tmpDir),
            ensureDir: jest.fn(),
            ensureDirAsync: jest.fn().mockResolvedValue(undefined),
          },
        },
        {
          provide: FileIndexService,
          useValue: { indexFile: jest.fn().mockResolvedValue(true) },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              if (key === "app.dataPath") return tmpDir;
              if (key === "app.maxUploadSize") return 524288000;
              return undefined;
            }),
          },
        },
      ],
    }).compile();

    service = module.get<FilesService>(FilesService);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe("stream", () => {
    it("should stream a regular file that exists", async () => {
      const filePath = path.join(tmpDir, "test.txt");
      fs.writeFileSync(filePath, "content");

      const file = {
        id: "uuid-1",
        storagePath: filePath,
        isSymlink: false,
        mimeType: "text/plain",
      };
      filesRepo.findOne.mockResolvedValue(file);

      const result = await service.stream("uuid-1");
      expect(result.file).toBe(file);
      expect(result.stream).toBeDefined();
      await new Promise<void>((resolve) => {
        result.stream.on("close", resolve);
        result.stream.destroy();
      });
    });

    it("should throw 422 for a broken symlink file", async () => {
      const linkPath = path.join(tmpDir, "broken-link");
      fs.symlinkSync("/nonexistent/target", linkPath);

      const file = {
        id: "uuid-2",
        storagePath: linkPath,
        isSymlink: true,
        mimeType: "text/plain",
      };
      filesRepo.findOne.mockResolvedValue(file);

      await expect(service.stream("uuid-2")).rejects.toThrow(
        UnprocessableEntityException,
      );
    });

    it("should throw 404 for a regular file not on disk", async () => {
      const file = {
        id: "uuid-3",
        storagePath: "/nonexistent/file.txt",
        isSymlink: false,
      };
      filesRepo.findOne.mockResolvedValue(file);

      await expect(service.stream("uuid-3")).rejects.toThrow(NotFoundException);
    });

    it("should stream a valid symlink file", async () => {
      const targetPath = path.join(tmpDir, "target.txt");
      fs.writeFileSync(targetPath, "hello");
      const linkPath = path.join(tmpDir, "valid-link");
      fs.symlinkSync(targetPath, linkPath);

      const file = {
        id: "uuid-4",
        storagePath: linkPath,
        isSymlink: true,
        mimeType: "text/plain",
      };
      filesRepo.findOne.mockResolvedValue(file);

      const result = await service.stream("uuid-4");
      expect(result.file).toBe(file);
      await new Promise<void>((resolve) => {
        result.stream.on("close", resolve);
        result.stream.destroy();
      });
    });
  });

  describe("delete (soft-delete)", () => {
    it("should soft-delete a file via softRemove", async () => {
      const file = { id: "uuid-5", storagePath: path.join(tmpDir, "to-delete.txt"), isSymlink: false };
      filesRepo.findOne.mockResolvedValue(file);
      filesRepo.softRemove = jest.fn().mockResolvedValue(file);

      await service.delete("uuid-5");

      expect(filesRepo.softRemove).toHaveBeenCalledWith(file);
    });

    it("should throw NotFoundException if file not in DB", async () => {
      filesRepo.findOne.mockResolvedValue(null);

      await expect(service.delete("nonexistent")).rejects.toThrow(NotFoundException);
    });
  });

  describe("rename", () => {
    it("should rename a file on disk and update DB", async () => {
      const filePath = path.join(tmpDir, "old-name.txt");
      fs.writeFileSync(filePath, "content");

      const file = {
        id: "uuid-9",
        filename: "old-name.txt",
        storagePath: filePath,
        isSymlink: false,
      };
      filesRepo.findOne.mockResolvedValue(file);

      const result = await service.rename("uuid-9", "new-name.txt");

      expect(result.filename).toBe("new-name.txt");
      expect(fs.existsSync(filePath)).toBe(false);
      expect(fs.existsSync(path.join(tmpDir, "new-name.txt"))).toBe(true);
    });

    it("should rename a symlink (renames symlink node, not target)", async () => {
      const targetPath = path.join(tmpDir, "target-file.txt");
      fs.writeFileSync(targetPath, "target data");
      const linkPath = path.join(tmpDir, "old-link.txt");
      fs.symlinkSync(targetPath, linkPath);

      const file = {
        id: "uuid-10",
        filename: "old-link.txt",
        storagePath: linkPath,
        isSymlink: true,
      };
      filesRepo.findOne.mockResolvedValue(file);

      const result = await service.rename("uuid-10", "new-link.txt");

      expect(result.filename).toBe("new-link.txt");
      // Old symlink gone
      expect(() => fs.lstatSync(linkPath)).toThrow();
      // New symlink exists and still points to target
      const newLinkPath = path.join(tmpDir, "new-link.txt");
      expect(fs.lstatSync(newLinkPath).isSymbolicLink()).toBe(true);
      expect(fs.readlinkSync(newLinkPath)).toBe(targetPath);
      // Target unchanged
      expect(fs.readFileSync(targetPath, "utf-8")).toBe("target data");
    });

    it("should handle collision when renaming to same name (uniquePath adds suffix)", async () => {
      const filePath = path.join(tmpDir, "same.txt");
      fs.writeFileSync(filePath, "data");

      const file = {
        id: "uuid-11",
        filename: "same.txt",
        storagePath: filePath,
        isSymlink: false,
      };
      filesRepo.findOne.mockResolvedValue(file);

      const result = await service.rename("uuid-11", "same.txt");

      // uniquePath sees the file exists and generates a new path with suffix
      // but renameSync is called so the original is moved
      expect(result.filename).toBe("same.txt");
      expect(filesRepo.save).toHaveBeenCalled();
    });
  });

  describe("reindex", () => {
    it("should throw 422 when reindexing a broken symlink", async () => {
      const linkPath = path.join(tmpDir, "broken-for-reindex");
      fs.symlinkSync("/no/such/target", linkPath);

      const file = {
        id: "uuid-12",
        storagePath: linkPath,
        isSymlink: true,
        filename: "broken",
      };
      filesRepo.findOne.mockResolvedValue(file);

      await expect(service.reindex("uuid-12")).rejects.toThrow(
        UnprocessableEntityException,
      );
    });

    it("should throw 404 when reindexing a regular file not on disk", async () => {
      const file = {
        id: "uuid-13",
        storagePath: "/gone/file.txt",
        isSymlink: false,
        filename: "gone",
      };
      filesRepo.findOne.mockResolvedValue(file);

      await expect(service.reindex("uuid-13")).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
