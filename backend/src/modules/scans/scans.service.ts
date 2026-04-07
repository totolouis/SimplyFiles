import { Injectable, Logger, MessageEvent } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository, IsNull } from "typeorm";
import { Folder } from "../folders/folder.entity";
import { FilesService } from "../files/files.service";
import * as path from "path";
import { v4 as uuidv4 } from "uuid";
import { Subject, Observable, merge, of } from "rxjs";
import { map } from "rxjs/operators";
import { ProcessingTask, ScanStatus } from "./scans.types";

const SCANS_FOLDER_NAME = "Scans";

@Injectable()
export class ScansService {
  private readonly logger = new Logger(ScansService.name);
  private scansFolderId: string | null = null;
  private tasks: Map<string, ProcessingTask> = new Map();
  private taskUpdates$ = new Subject<ProcessingTask[]>();
  private readonly inFlightUploads: Set<Promise<void>> = new Set();

  constructor(
    @InjectRepository(Folder) private foldersRepo: Repository<Folder>,
    private filesService: FilesService,
  ) {}

  /**
   * Emit the current task list to all SSE subscribers.
   */
  private emitUpdate(): void {
    this.taskUpdates$.next(this.getAllTasks());
  }

  /**
   * Get an observable stream of task updates for SSE.
   * Immediately emits the current state, then emits on every change.
   */
  getTaskStream(): Observable<MessageEvent> {
    return merge(of(this.getAllTasks()), this.taskUpdates$).pipe(
      map((tasks) => ({ data: JSON.stringify(tasks) }) as MessageEvent),
    );
  }

  /**
   * Get or create the default Scans folder.
   * Called on application bootstrap.
   */
  async getOrCreateScansFolder(): Promise<string> {
    if (this.scansFolderId) {
      // Verify folder still exists
      const exists = await this.foldersRepo.findOne({
        where: { id: this.scansFolderId },
      });
      if (exists) return this.scansFolderId;
    }

    // Look for existing Scans folder at root level
    const existingFolder = await this.foldersRepo.findOne({
      where: { name: SCANS_FOLDER_NAME, parentId: IsNull() },
    });

    if (existingFolder) {
      this.scansFolderId = existingFolder.id;
      this.logger.log(`Using existing Scans folder: ${this.scansFolderId}`);
      return this.scansFolderId;
    }

    // Create Scans folder
    const newFolder = this.foldersRepo.create({
      name: SCANS_FOLDER_NAME,
      parentId: null,
    });
    await this.foldersRepo.save(newFolder);
    this.scansFolderId = newFolder.id;
    this.logger.log(`Created Scans folder: ${this.scansFolderId}`);

    return this.scansFolderId;
  }

  /**
   * Upload a document to the Scans folder.
   *
   * Mimics Paperless-ngx API:
   * - POST /api/documents/post_document/
   * - Returns task_id for polling
   *
   * Optional metadata fields:
   * - title: Document title
   * - created: Date/datetime (e.g. 2024-04-19)
   * - correspondent: Correspondent ID (integer)
   * - document_type: Document type ID
   * - tags: Tag IDs (array of integers)
   * - archive_serial_number: Optional serial number
   */
  async uploadScan(
    buffer: Buffer,
    filename: string,
    mimeType: string,
    metadata?: {
      title?: string;
      created?: string;
      correspondent?: string;
      document_type?: string;
      tags?: string[];
      archive_serial_number?: string;
    },
  ): Promise<{ task_id: string; message: string }> {
    // Create a task ID (mimics Paperless-ngx behavior)
    const taskId = uuidv4();

    // Initialize task
    const task: ProcessingTask = {
      task_id: taskId,
      status: ScanStatus.PENDING,
      created: new Date().toISOString(),
    };
    this.tasks.set(taskId, task);
    this.emitUpdate();

    // Process the upload asynchronously
    const uploadPromise = this.processUpload(taskId, buffer, filename, mimeType, metadata).catch(
      (error) => {
        this.logger.error(
          `Failed to process upload: ${error.message}`,
          error.stack,
        );
        const task = this.tasks.get(taskId);
        if (task) {
          task.status = ScanStatus.FAILED;
          task.error = error.message;
          task.completed = new Date().toISOString();
          this.emitUpdate();
        }
      },
    ).finally(() => {
      this.inFlightUploads.delete(uploadPromise);
    });
    this.inFlightUploads.add(uploadPromise);

    return {
      task_id: taskId,
      message: "Document uploaded successfully",
    };
  }

  /**
   * Process the document upload (async).
   */
  private async processUpload(
    taskId: string,
    buffer: Buffer,
    originalName: string,
    mimeType: string,
    metadata?: {
      title?: string;
      created?: string;
      correspondent?: string;
      document_type?: string;
      tags?: string[];
      archive_serial_number?: string;
    },
  ): Promise<void> {
    const task = this.tasks.get(taskId);
    if (!task) {
      this.logger.error(`Task ${taskId} not found`);
      return;
    }

    // Mark as started
    task.status = ScanStatus.STARTED;
    task.started = new Date().toISOString();
    this.emitUpdate();

    try {
      const scansFolderId = await this.getOrCreateScansFolder();

      // Generate filename
      const finalFilename = this.generateFilename(
        originalName,
        metadata?.created,
      );

      // Upload the file using existing FilesService
      const file = await this.filesService.upload(
        finalFilename,
        buffer,
        scansFolderId,
        mimeType,
      );

      // Build result (mimics Paperless-ngx response)
      const result = {
        file_id: file.id,
        filename: file.filename,
        path: `/Scans/${file.filename}`,
        title: metadata?.title || file.filename,
        created: metadata?.created || new Date().toISOString().split("T")[0],
        correspondent: metadata?.correspondent || null,
        document_type: metadata?.document_type || null,
        tags: metadata?.tags || [],
        archive_serial_number: metadata?.archive_serial_number || null,
      };

      // Mark as success
      task.status = ScanStatus.COMPLETED;
      task.result = result;
      task.completed = new Date().toISOString();
      this.emitUpdate();

      this.logger.log(`Document processed successfully: ${taskId}`);
    } catch (error: any) {
      this.logger.error(
        `Failed to process document ${taskId}: ${error.message}`,
        error.stack,
      );
      task.status = ScanStatus.FAILED;
      task.error = error.message;
      task.completed = new Date().toISOString();
      this.emitUpdate();
      throw error;
    }
  }

  /**
   * Get all tasks, sorted by created date descending (newest first).
   */
  getAllTasks(): ProcessingTask[] {
    return Array.from(this.tasks.values()).sort(
      (a, b) => new Date(b.created).getTime() - new Date(a.created).getTime(),
    );
  }

  /**
   * Get task status for polling.
   * Mimics Paperless-ngx: GET /api/tasks/?task_id=<uuid>
   */
  async getTaskStatus(taskId: string): Promise<ProcessingTask[]> {
    const task = this.tasks.get(taskId);

    if (!task) {
      // Return empty array if task not found (matching Paperless-ngx behavior)
      return [];
    }

    return [task];
  }

  /**
   * Generate a filename with optional date prefix.
   */
  private generateFilename(originalName: string, createdDate?: string): string {
    let date: Date;

    if (createdDate) {
      date = new Date(createdDate);
      if (isNaN(date.getTime())) {
        date = new Date();
      }
    } else {
      date = new Date();
    }

    const dateStr = date.toISOString().split("T")[0]; // YYYY-MM-DD

    const ext = path.extname(originalName);
    const baseName = path.basename(originalName, ext);

    // Sanitize base name
    const sanitizedBase =
      baseName
        .replace(/[/\\:*?"<>|]/g, "_")
        .replace(/\.{2,}/g, "_")
        .trim() || "document";

    return `${dateStr}_${sanitizedBase}${ext}`;
  }

  /**
   * Periodically clean up completed/failed tasks older than maxAgeMs.
   * Active tasks (PENDING, STARTED) are never removed regardless of age.
   */
  @Cron(CronExpression.EVERY_HOUR)
  scheduledCleanup(): void {
    this.cleanupOldTasks(24 * 60 * 60 * 1000);
  }

  /**
   * Clean up old tasks that are in a terminal state (COMPLETED or FAILED).
   * Tasks in PENDING or STARTED state are never removed.
   */
  cleanupOldTasks(maxAgeMs: number = 24 * 60 * 60 * 1000): void {
    const now = Date.now();
    let removed = 0;
    for (const [taskId, task] of this.tasks.entries()) {
      // Never remove active tasks
      if (
        task.status === ScanStatus.PENDING ||
        task.status === ScanStatus.STARTED
      ) {
        continue;
      }
      const created = new Date(task.created).getTime();
      if (now - created > maxAgeMs) {
        this.tasks.delete(taskId);
        removed++;
      }
    }
    if (removed > 0) {
      this.logger.log(`Cleaned up ${removed} old task(s)`);
    }
  }

  /**
   * Wait for all in-flight upload processing to complete.
   */
  async waitForUploads(): Promise<void> {
    await Promise.allSettled([...this.inFlightUploads]);
  }

  /**
   * Clear all tasks. Used for testing.
   */
  clearAllTasks(): void {
    this.tasks.clear();
    this.emitUpdate();
  }

  /**
   * Reset the scans folder ID. Used for testing.
   */
  resetScansFolderId(): void {
    this.scansFolderId = null;
  }
}
