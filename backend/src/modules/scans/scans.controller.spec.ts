import { Test, TestingModule } from "@nestjs/testing";
import { BadRequestException, MessageEvent } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { of } from "rxjs";
import { ScansController } from "./scans.controller";
import { ScansService } from "./scans.service";
import { ProcessingTask, ScanStatus } from "./scans.types";

describe("ScansController", () => {
  let controller: ScansController;
  let scansService: jest.Mocked<ScansService>;

  const mockFile: Express.Multer.File = {
    fieldname: "document",
    originalname: "test-document.pdf",
    encoding: "7bit",
    mimetype: "application/pdf",
    buffer: Buffer.from("test content"),
    size: 1024,
  } as Express.Multer.File;

  const mockUploadResult = {
    task_id: "abc-123-uuid",
    message: "Document uploaded successfully",
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ScansController],
      providers: [
        {
          provide: ScansService,
          useValue: {
            uploadScan: jest.fn().mockResolvedValue(mockUploadResult),
            getTaskStatus: jest
              .fn()
              .mockResolvedValue({ id: "abc-123-uuid", status: "SUCCESS" }),
            getAllTasks: jest.fn().mockReturnValue([]),
            getTaskStream: jest.fn().mockReturnValue(of({ data: "[]" })),
          },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockReturnValue(524288000),
          },
        },
      ],
    }).compile();

    controller = module.get<ScansController>(ScansController);
    scansService = module.get(ScansService);
  });

  describe("upload", () => {
    it("should upload a PDF file successfully", async () => {
      const result = await controller.upload(mockFile, {});

      expect(result).toEqual(mockUploadResult);
      expect(scansService.uploadScan).toHaveBeenCalledWith(
        Buffer.from("test content"),
        "test-document.pdf",
        "application/pdf",
        {},
      );
    });

    it("should upload a JPEG file successfully", async () => {
      const jpegFile = {
        ...mockFile,
        originalname: "scan.jpg",
        mimetype: "image/jpeg",
      };

      const result = await controller.upload(jpegFile, {});

      expect(result).toEqual(mockUploadResult);
      expect(scansService.uploadScan).toHaveBeenCalledWith(
        Buffer.from("test content"),
        "scan.jpg",
        "image/jpeg",
        {},
      );
    });

    it("should upload a PNG file successfully", async () => {
      const pngFile = {
        ...mockFile,
        originalname: "scan.png",
        mimetype: "image/png",
      };

      const result = await controller.upload(pngFile, {});

      expect(result).toEqual(mockUploadResult);
      expect(scansService.uploadScan).toHaveBeenCalledWith(
        Buffer.from("test content"),
        "scan.png",
        "image/png",
        {},
      );
    });

    it("should upload with metadata fields", async () => {
      const metadata = {
        title: "My Scanned Document",
        created: "2024-01-15",
        correspondent: "12",
        document_type: "3",
        tags: ["3", "7"],
        archive_serial_number: "SN12345",
      };

      const result = await controller.upload(mockFile, metadata);

      expect(result).toEqual(mockUploadResult);
      expect(scansService.uploadScan).toHaveBeenCalledWith(
        Buffer.from("test content"),
        "test-document.pdf",
        "application/pdf",
        metadata,
      );
    });

    it("should reject when no file is provided", async () => {
      await expect(controller.upload(undefined as any, {})).rejects.toThrow(
        BadRequestException,
      );
      await expect(controller.upload(undefined as any, {})).rejects.toThrow(
        "No document provided",
      );
    });

    it("should reject non-allowed MIME types", async () => {
      const invalidFile = {
        ...mockFile,
        mimetype: "application/zip",
        originalname: "document.zip",
      };

      await expect(controller.upload(invalidFile, {})).rejects.toThrow(
        BadRequestException,
      );
      await expect(controller.upload(invalidFile, {})).rejects.toThrow(
        "Invalid file type",
      );
    });

    it("should reject image/gif files", async () => {
      const gifFile = {
        ...mockFile,
        mimetype: "image/gif",
        originalname: "scan.gif",
      };

      await expect(controller.upload(gifFile, {})).rejects.toThrow(
        BadRequestException,
      );
    });

    it("should reject text/plain files", async () => {
      const txtFile = {
        ...mockFile,
        mimetype: "text/plain",
        originalname: "document.txt",
      };

      await expect(controller.upload(txtFile, {})).rejects.toThrow(
        BadRequestException,
      );
    });

    it("should reject invalid created date format", async () => {
      const invalidMetadata = { created: "not-a-date" };

      await expect(
        controller.upload(mockFile, invalidMetadata),
      ).rejects.toThrow(BadRequestException);
      await expect(
        controller.upload(mockFile, invalidMetadata),
      ).rejects.toThrow("Invalid created date format");
    });

    it("should accept ISO date with time", async () => {
      const metadata = { created: "2024-01-15T10:30:00.000Z" };

      await controller.upload(mockFile, metadata);
      expect(scansService.uploadScan).toHaveBeenCalled();
    });

    it("should handle files with MIME type determined from filename", async () => {
      const fileWithoutMimeType = { ...mockFile, mimetype: undefined };

      await controller.upload(fileWithoutMimeType as any, {});

      expect(scansService.uploadScan).toHaveBeenCalled();
    });

    it("should pass through service errors", async () => {
      scansService.uploadScan.mockRejectedValue(new Error("Service error"));

      await expect(controller.upload(mockFile, {})).rejects.toThrow(
        "Service error",
      );
    });

    it("should accept image/jpeg with jpg extension", async () => {
      const jpgFile = {
        ...mockFile,
        mimetype: "image/jpeg",
        originalname: "photo.jpg",
      };

      const result = await controller.upload(jpgFile, {});

      expect(result).toEqual(mockUploadResult);
    });

    it("should handle files with uppercase extensions", async () => {
      const uppercaseFile = { ...mockFile, originalname: "DOCUMENT.PDF" };

      const result = await controller.upload(uppercaseFile, {});

      expect(result).toEqual(mockUploadResult);
    });
  });

  describe("getTaskStatus", () => {
    it("should get task status successfully", async () => {
      const taskId = "abc-123-uuid";
      const mockStatus = {
        task_id: taskId,
        status: ScanStatus.COMPLETED,
        created: new Date().toISOString(),
      } as ProcessingTask;

      scansService.getTaskStatus.mockResolvedValue([mockStatus]);

      const result = await controller.getTaskStatus(taskId);

      expect(result.at(0)!.task_id).toEqual(mockStatus.task_id);
      expect(scansService.getTaskStatus).toHaveBeenCalledWith(taskId);
    });

    it("should require task_id query parameter", async () => {
      await expect(controller.getTaskStatus("")).rejects.toThrow(
        BadRequestException,
      );
      await expect(controller.getTaskStatus("")).rejects.toThrow(
        "task_id query parameter is required",
      );
    });
  });

  describe("getAllTasks", () => {
    it("should return all tasks from the service", () => {
      const mockTasks: ProcessingTask[] = [
        {
          task_id: "task-1",
          status: ScanStatus.COMPLETED,
          created: new Date().toISOString(),
        },
        {
          task_id: "task-2",
          status: ScanStatus.PENDING,
          created: new Date().toISOString(),
        },
      ];

      scansService.getAllTasks.mockReturnValue(mockTasks);

      const result = controller.getAllTasks();

      expect(result).toEqual(mockTasks);
      expect(scansService.getAllTasks).toHaveBeenCalled();
    });

    it("should return empty array when no tasks exist", () => {
      scansService.getAllTasks.mockReturnValue([]);

      const result = controller.getAllTasks();

      expect(result).toEqual([]);
    });
  });

  describe("streamTasks", () => {
    it("should return an observable from the service", () => {
      const mockStream = of({ data: "[]" } as MessageEvent);
      scansService.getTaskStream.mockReturnValue(mockStream);

      const result = controller.streamTasks();

      expect(result).toBe(mockStream);
      expect(scansService.getTaskStream).toHaveBeenCalled();
    });

    it("should emit task data through the stream", (done) => {
      const mockTasks: ProcessingTask[] = [
        {
          task_id: "task-1",
          status: ScanStatus.STARTED,
          created: new Date().toISOString(),
        },
      ];
      const mockStream = of({
        data: JSON.stringify(mockTasks),
      } as MessageEvent);
      scansService.getTaskStream.mockReturnValue(mockStream);

      const result = controller.streamTasks();

      result.subscribe({
        next: (event) => {
          const data = JSON.parse(event.data as string);
          expect(data).toHaveLength(1);
          expect(data[0].task_id).toBe("task-1");
          expect(data[0].status).toBe("STARTED");
          done();
        },
        error: done,
      });
    });
  });
});
