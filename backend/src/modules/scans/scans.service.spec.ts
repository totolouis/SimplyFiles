import { Test, TestingModule } from "@nestjs/testing";
import { getRepositoryToken } from "@nestjs/typeorm";
import { Repository, IsNull } from "typeorm";
import { take } from "rxjs/operators";
import { ScansService } from "./scans.service";
import { FilesService } from "../files/files.service";
import { File } from "../files/file.entity";
import { Folder } from "../folders/folder.entity";

describe("ScansService", () => {
  let service: ScansService;
  let foldersRepo: jest.Mocked<Repository<Folder>>;
  let filesService: jest.Mocked<FilesService>;

  const mockFile = {
    id: "file-1",
    filename: "2024-03-17_test-document.pdf",
    mimeType: "application/pdf",
    size: 1024,
    folderId: "scans-folder-id",
    storagePath: "/data/files/Scans/2024-03-17_test-document.pdf",
    createdAt: new Date(),
  } as File;

  const mockFolder = {
    id: "scans-folder-id",
    name: "Scans",
    parentId: null,
    createdAt: new Date(),
  } as Folder;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ScansService,
        {
          provide: getRepositoryToken(File),
          useValue: {
            create: jest.fn().mockReturnValue(mockFile),
            save: jest.fn().mockResolvedValue(mockFile),
            findOne: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(Folder),
          useValue: {
            create: jest.fn().mockReturnValue(mockFolder),
            save: jest.fn().mockResolvedValue(mockFolder),
            findOne: jest.fn(),
          },
        },
        {
          provide: FilesService,
          useValue: {
            upload: jest.fn().mockResolvedValue(mockFile),
          },
        },
      ],
    }).compile();

    service = module.get<ScansService>(ScansService);
    foldersRepo = module.get(getRepositoryToken(Folder));
    filesService = module.get(FilesService);
  });

  describe("getOrCreateScansFolder", () => {
    it("should find existing Scans folder at root level", async () => {
      foldersRepo.findOne.mockResolvedValue(mockFolder);

      const result = await service.getOrCreateScansFolder();

      expect(result).toBe("scans-folder-id");
      expect(foldersRepo.findOne).toHaveBeenCalledWith({
        where: { name: "Scans", parentId: IsNull() },
      });
    });

    it("should create new Scans folder if not exists", async () => {
      foldersRepo.findOne.mockResolvedValue(null);
      foldersRepo.create.mockReturnValue(mockFolder);
      foldersRepo.save.mockResolvedValue(mockFolder);

      const result = await service.getOrCreateScansFolder();

      expect(result).toBe("scans-folder-id");
      expect(foldersRepo.create).toHaveBeenCalledWith({
        name: "Scans",
        parentId: null,
      });
      expect(foldersRepo.save).toHaveBeenCalledWith(mockFolder);
    });

    it("should handle missing cached folder by searching again", async () => {
      // First call sets cache
      foldersRepo.findOne
        .mockResolvedValueOnce(mockFolder)
        .mockResolvedValueOnce(mockFolder);
      await service.getOrCreateScansFolder();

      // Simulate folder deletion
      foldersRepo.findOne
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(mockFolder);

      const result = await service.getOrCreateScansFolder();

      expect(result).toBe("scans-folder-id");
    });
  });

  describe("uploadScan", () => {
    beforeEach(() => {
      foldersRepo.findOne.mockResolvedValue(mockFolder);
      jest.clearAllMocks();
    });

    it("should upload file and return task_id", async () => {
      const buffer = Buffer.from("test content");

      const result = await service.uploadScan(
        buffer,
        "test-document.pdf",
        "application/pdf",
      );

      expect(result).toHaveProperty("task_id");
      expect(result).toHaveProperty(
        "message",
        "Document uploaded successfully",
      );
      expect(result.task_id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
      );
    });

    it("should upload with metadata", async () => {
      const buffer = Buffer.from("test content");
      const metadata = {
        title: "My Document",
        created: "2024-01-15",
        correspondent: "12",
        document_type: "3",
        tags: ["3", "7"],
        archive_serial_number: "SN12345",
      };

      const result = await service.uploadScan(
        buffer,
        "document.pdf",
        "application/pdf",
        metadata,
      );

      expect(result).toHaveProperty("task_id");
      expect(result).toHaveProperty(
        "message",
        "Document uploaded successfully",
      );
    });

    it("should handle image/jpeg uploads", async () => {
      const buffer = Buffer.from("JPEG content");

      const result = await service.uploadScan(buffer, "scan.jpg", "image/jpeg");

      expect(result).toHaveProperty("task_id");
      expect(result).toHaveProperty(
        "message",
        "Document uploaded successfully",
      );
    });

    it("should handle image/png uploads", async () => {
      const buffer = Buffer.from("PNG content");

      const result = await service.uploadScan(buffer, "scan.png", "image/png");

      expect(result).toHaveProperty("task_id");
      expect(result).toHaveProperty(
        "message",
        "Document uploaded successfully",
      );
    });

    it("should process upload asynchronously", async () => {
      const buffer = Buffer.from("test content");

      await service.uploadScan(buffer, "test.pdf", "application/pdf");

      // Wait a bit for async processing
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Verify file was uploaded
      expect(filesService.upload).toHaveBeenCalled();
    });

    it("should handle upload errors gracefully", async () => {
      filesService.upload.mockRejectedValue(new Error("Disk full"));
      const buffer = Buffer.from("test content");

      // Should not throw - error is handled in async processing
      const result = await service.uploadScan(
        buffer,
        "test.pdf",
        "application/pdf",
      );

      expect(result).toHaveProperty("task_id");

      // Wait for async processing to complete
      await new Promise((resolve) => setTimeout(resolve, 100));
    });
  });

  describe("getTaskStatus", () => {
    it("should return task status", async () => {
      const buffer = Buffer.from("test content");
      const uploadResult = await service.uploadScan(
        buffer,
        "test.pdf",
        "application/pdf",
      );

      // Wait for processing
      await new Promise((resolve) => setTimeout(resolve, 100));

      const status = await service.getTaskStatus(uploadResult.task_id);

      expect(Array.isArray(status)).toBe(true);
      expect(status.length).toBeGreaterThan(0);
      expect(status[0]).toHaveProperty("task_id", uploadResult.task_id);
      expect(status[0]).toHaveProperty("status");
    });

    it("should return empty array for unknown task", async () => {
      const status = await service.getTaskStatus("unknown-task-id");

      expect(Array.isArray(status)).toBe(true);
      expect(status.length).toBe(0);
    });
  });

  describe("getAllTasks", () => {
    it("should return empty array when no tasks exist", () => {
      const tasks = service.getAllTasks();
      expect(tasks).toEqual([]);
    });

    it("should return all tasks", async () => {
      const buffer = Buffer.from("test content");
      await service.uploadScan(buffer, "file1.pdf", "application/pdf");
      await service.uploadScan(buffer, "file2.pdf", "application/pdf");

      const tasks = service.getAllTasks();
      expect(tasks).toHaveLength(2);
    });

    it("should sort tasks by created date descending (newest first)", async () => {
      const buffer = Buffer.from("test content");
      const result1 = await service.uploadScan(
        buffer,
        "first.pdf",
        "application/pdf",
      );
      // Small delay to ensure different timestamps
      await new Promise((resolve) => setTimeout(resolve, 10));
      const result2 = await service.uploadScan(
        buffer,
        "second.pdf",
        "application/pdf",
      );

      const tasks = service.getAllTasks();
      expect(tasks[0].task_id).toBe(result2.task_id);
      expect(tasks[1].task_id).toBe(result1.task_id);
    });
  });

  describe("getTaskStream", () => {
    it("should immediately emit current tasks", (done) => {
      const stream = service.getTaskStream();

      stream.pipe(take(1)).subscribe({
        next: (event) => {
          const data = JSON.parse(event.data as string);
          expect(Array.isArray(data)).toBe(true);
          done();
        },
        error: done,
      });
    });

    it("should emit updates when a task is created", (done) => {
      const stream = service.getTaskStream();
      const emissions: any[] = [];

      stream.pipe(take(2)).subscribe({
        next: (event) => {
          emissions.push(JSON.parse(event.data as string));
        },
        complete: () => {
          // First emission: initial state (empty)
          expect(emissions[0]).toEqual([]);
          // Second emission: after upload created a PENDING task
          expect(emissions[1]).toHaveLength(1);
          expect(emissions[1][0].status).toBe("PENDING");
          done();
        },
        error: done,
      });

      // Trigger an upload to cause an emission
      service.uploadScan(Buffer.from("test"), "test.pdf", "application/pdf");
    });

    it("should emit updates on task state transitions", (done) => {
      const stream = service.getTaskStream();
      const statuses: string[] = [];

      // Expect: initial([]) -> PENDING -> STARTED -> COMPLETED
      stream.pipe(take(4)).subscribe({
        next: (event) => {
          const data = JSON.parse(event.data as string);
          if (data.length > 0) {
            statuses.push(data[0].status);
          }
        },
        complete: () => {
          expect(statuses).toContain("PENDING");
          expect(statuses).toContain("STARTED");
          expect(statuses).toContain("COMPLETED");
          done();
        },
        error: done,
      });

      service.uploadScan(Buffer.from("test"), "test.pdf", "application/pdf");
    }, 10000);
  });
});
