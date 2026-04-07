import {
  Controller,
  Post,
  Body,
  UploadedFile,
  UseInterceptors,
  BadRequestException,
  HttpCode,
  HttpStatus,
  Logger,
  Query,
  Get,
  Sse,
  MessageEvent,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { FileInterceptor } from "@nestjs/platform-express";
import { ScansService } from "./scans.service";
import * as mime from "mime-types";
import { UploadDocumentDto } from "./scans.types";
import { Observable } from "rxjs";

// Allowed MIME types for scans
const ALLOWED_MIME_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/jpg",
  "image/png",
];

@Controller("documents")
export class ScansController {
  private readonly logger = new Logger(ScansController.name);
  private readonly maxSize: number;

  constructor(
    private readonly scansService: ScansService,
    private readonly configService: ConfigService,
  ) {
    this.maxSize = this.configService.get<number>('app.maxUploadSize') ?? 524288000;
  }

  /**
   * GET /api/documents - Paperless compatibility endpoint.
   * Returns an empty list for Paperless-ngx clients that query this endpoint.
   */
  @Get()
  @HttpCode(HttpStatus.OK)
  getDocuments() {
    return {
      count: 0,
      next: null,
      previous: null,
      results: [],
    };
  }

  /**
   * Upload a document to Paperless-ngx.
   *
   * Minimal upload:
   * curl -H "Authorization: Token YOUR_API_TOKEN" \
   *   -F "document=@/path/to/scan.pdf" \
   *   https://your-paperless-instance/api/documents/post_document/
   *
   * Full upload with metadata:
   * curl -u "username:password" \
   *   -F "title=My Scanned Document" \
   *   -F "correspondent=12" \
   *   -F "document=@/path/to/scan.pdf" \
   *   https://your-paperless-instance/api/documents/post_document/
   *
   * Authentication options:
   * - Token-based (recommended): -H "Authorization: Token YOUR_API_TOKEN"
   * - Basic auth: -u "username:password"
   */
  @Post("post_document")
  @UseInterceptors(FileInterceptor("document"))
  @HttpCode(HttpStatus.OK)
  async upload(
    @UploadedFile() file: Express.Multer.File,
    @Body() metadata: UploadDocumentDto,
  ) {
    if (!file) {
      throw new BadRequestException("No document provided");
    }

    if (file.size > this.maxSize) {
      throw new BadRequestException(
        `File size ${file.size} exceeds maximum allowed size ${this.maxSize}`,
      );
    }

    // Validate MIME type
    const mimeType =
      file.mimetype ||
      mime.lookup(file.originalname) ||
      "application/octet-stream";
    const isAllowed = ALLOWED_MIME_TYPES.some(
      (type) => mimeType === type || mimeType.startsWith(type),
    );

    if (!isAllowed) {
      this.logger.warn(`Rejected upload with MIME type: ${mimeType}`);
      throw new BadRequestException(
        `Invalid file type: ${mimeType}. Allowed types: PDF, JPEG, PNG`,
      );
    }

    // Validate created date format if provided
    if (metadata.created) {
      const date = new Date(metadata.created);
      if (isNaN(date.getTime())) {
        throw new BadRequestException(
          "Invalid created date format. Use ISO 8601 format (YYYY-MM-DD)",
        );
      }
    }

    // Upload to Paperless-ngx
    const result = await this.scansService.uploadScan(
      file.buffer,
      file.originalname,
      mimeType,
      metadata,
    );

    return result;
  }

  /**
   * Stream task updates via Server-Sent Events.
   */
  @Sse("tasks/stream")
  streamTasks(): Observable<MessageEvent> {
    return this.scansService.getTaskStream();
  }

  /**
   * Get all current processing tasks.
   */
  @Get("tasks/all")
  getAllTasks() {
    return this.scansService.getAllTasks();
  }

  /**
   * Check the status of a processing task.
   *
   * Example:
   * curl -H "Authorization: Token YOUR_API_TOKEN" \
   *   https://your-paperless-instance/api/tasks/?task_id=<uuid>
   */
  @Get("tasks")
  async getTaskStatus(@Query("task_id") taskId: string) {
    this.logger.log(`Checking status for task_id: ${taskId}`);
    if (!taskId) {
      throw new BadRequestException("task_id query parameter is required");
    }

    return this.scansService.getTaskStatus(taskId);
  }
}
