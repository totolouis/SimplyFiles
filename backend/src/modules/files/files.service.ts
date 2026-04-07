import {
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
  InternalServerErrorException,
  Logger,
  ConflictException,
  OnModuleInit,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository, DataSource } from "typeorm";
import { File } from "./file.entity";
import { PathService } from "../../common/path.service";
import * as crypto from "crypto";
import * as fs from "fs";
import * as fsp from "fs/promises";
import * as path from "path";
import * as mime from "mime-types";
import { FileIndexChunk } from "../search/file-index-chunk.entity";
import { FileIndexService } from "../search/file-index.service";
import { v4 as uuidv4 } from "uuid";

@Injectable()
export class FilesService implements OnModuleInit {
  private readonly logger = new Logger(FilesService.name);
  private readonly dataPath: string;
  private pendingIndexing = new Map<string, Promise<unknown>>();

  constructor(
    @InjectRepository(File) private filesRepo: Repository<File>,
    @InjectRepository(FileIndexChunk)
    private fileIndexRepo: Repository<FileIndexChunk>,
    private dataSource: DataSource,
    private pathService: PathService,
    private fileIndexService: FileIndexService,
    private configService: ConfigService,
  ) {
    this.dataPath =
      this.configService.get<string>("app.dataPath") || "./data/files";
  }

  async onModuleInit(): Promise<void> {
    await fsp.mkdir(this.dataPath, { recursive: true });
  }

  // -- Upload ---------------------------------------------------------------

  async upload(
    originalName: string,
    buffer: Buffer,
    folderId: string | null,
    mimeType: string,
  ): Promise<File> {
    const fileId = uuidv4();

    // Normalize filename to NFC (Unicode Normalization Form C) to fix MacOS NFD encoding issues
    const normalizedName = originalName.normalize("NFC");

    // Compute content hash and check for duplicates
    const contentHash = crypto
      .createHash("sha256")
      .update(buffer)
      .digest("hex");
    const existing = await this.filesRepo.findOne({ where: { contentHash } });
    if (existing) {
      const virtualPath = await this.buildVirtualPath(existing);
      throw new ConflictException(`File already present at: ${virtualPath}`);
    }

    // Resolve the target directory and ensure it exists
    const dir = await this.pathService.folderFsPath(folderId);
    await this.pathService.ensureDirAsync(dir);

    // Handle filename collisions by appending a suffix
    const storagePath = await this.uniquePathAsync(dir, normalizedName);

    await fsp.writeFile(storagePath, buffer);
    this.logger.log(`Uploaded file: ${normalizedName} (${buffer.length} bytes) to folder=${folderId ?? 'root'}`);

    const file = this.filesRepo.create({
      id: fileId,
      filename: normalizedName, // Use normalized original name (not the storage path)
      folderId: folderId || null,
      mimeType:
        mimeType || mime.lookup(normalizedName) || "application/octet-stream",
      size: buffer.length,
      storagePath,
      contentHash,
    });

    await this.filesRepo.save(file);
    // Index in background — don't block the upload response
    const indexPromise = this.fileIndexService
      .indexFile(file, buffer)
      .catch((e) =>
        this.logger.warn(`Background indexing failed for ${normalizedName}: ${e.message}`),
      )
      .finally(() => this.pendingIndexing.delete(file.id));
    this.pendingIndexing.set(file.id, indexPromise);
    return file;
  }

  // -- Move -----------------------------------------------------------------

  async move(id: string, folderId: string | null): Promise<File> {
    const file = await this.findById(id);

    const newDir = await this.pathService.folderFsPath(folderId);
    await this.pathService.ensureDirAsync(newDir);

    // Normalize filename to NFC
    const normalizedFilename = file.filename.normalize("NFC");

    const newPath = await this.uniquePathAsync(newDir, normalizedFilename);

    try {
      await fsp.access(file.storagePath);
      await fsp.rename(file.storagePath, newPath);
    } catch {}

    file.folderId = folderId;
    file.storagePath = newPath;
    // Keep the normalized filename, don't extract from path
    file.filename = normalizedFilename;
    this.logger.log(`Moved file: ${file.filename} to folder=${folderId ?? 'root'}`);
    return this.filesRepo.save(file);
  }

  /** Wait for all background indexing to complete. */
  async waitForPendingIndexing(): Promise<void> {
    await Promise.allSettled(this.pendingIndexing.values());
  }

  // -- Indexing --------------------------------------------------------------

  async reindex(id: string): Promise<{ indexed: boolean; filename: string }> {
    // Wait for any in-flight background indexing to finish first
    const pending = this.pendingIndexing.get(id);
    if (pending) await pending;

    const file = await this.findById(id);
    try {
      await fsp.access(file.storagePath);
    } catch {
      if (file.isSymlink)
        throw new UnprocessableEntityException("Symlink target is missing or broken");
      throw new NotFoundException("File not on disk");
    }
    const buffer = await fsp.readFile(file.storagePath);
    const indexed = await this.fileIndexService.indexFile(file, buffer);
    this.logger.debug(`Reindexed file: ${file.filename} (indexed=${indexed})`);
    return { indexed, filename: file.filename };
  }

  async reindexAll(): Promise<
    { id: string; filename: string; indexed: boolean }[]
  > {
    this.logger.log('Starting full reindex of all files');
    const BATCH_SIZE = 100;
    const results: { id: string; filename: string; indexed: boolean }[] = [];
    let offset = 0;

    // Process files in batches to avoid loading everything into memory at once
    while (true) {
      const batch = await this.filesRepo.find({
        skip: offset,
        take: BATCH_SIZE,
        order: { createdAt: "ASC" },
      });
      if (batch.length === 0) break;

      for (const file of batch) {
        try {
          await fsp.access(file.storagePath);
        } catch {
          this.logger.warn(
            `File missing on disk, skipping index: ${file.filename}`,
          );
          continue;
        }
        const buffer = await fsp.readFile(file.storagePath);
        const indexed = await this.fileIndexService.indexFile(file, buffer);
        results.push({ id: file.id, filename: file.filename, indexed });
      }

      offset += BATCH_SIZE;
      if (batch.length < BATCH_SIZE) break;
    }

    this.logger.log(`Reindex complete: ${results.length} files processed`);
    return results;
  }

  // -- CRUD -----------------------------------------------------------------

  async findById(id: string): Promise<File> {
    const file = await this.filesRepo.findOne({ where: { id } });
    if (!file) throw new NotFoundException("File not found");
    return file;
  }

  async stream(id: string): Promise<{ file: File; stream: fs.ReadStream }> {
    const file = await this.findById(id);
    try {
      await fsp.access(file.storagePath);
    } catch {
      if (file.isSymlink)
        throw new UnprocessableEntityException("Symlink target is missing or broken");
      throw new NotFoundException("File not on disk");
    }
    return { file, stream: fs.createReadStream(file.storagePath) };
  }

  async delete(id: string): Promise<void> {
    const file = await this.findById(id);
    await this.filesRepo.softRemove(file);
    this.logger.log(`Soft-deleted file: ${file.filename} (id=${id})`);
  }

  async permanentDelete(file: File): Promise<void> {
    try {
      if (file.isSymlink) {
        await fsp.lstat(file.storagePath);
      } else {
        await fsp.access(file.storagePath);
      }
      await fsp.unlink(file.storagePath);
    } catch {}
    await this.fileIndexRepo.delete({ fileId: file.id });
    await this.filesRepo.remove(file);
    this.logger.log(`Permanently deleted file: ${file.filename} (id=${file.id})`);
  }

  async rename(id: string, newName: string): Promise<File> {
    const file = await this.findById(id);
    const normalizedName = newName.normalize('NFC');
    const dir = path.dirname(file.storagePath);
    const newPath = await this.uniquePathAsync(dir, normalizedName);

    if (newPath !== file.storagePath) {
      try {
        await fsp.rename(file.storagePath, newPath);
      } catch (e: any) {
        throw new InternalServerErrorException(`Failed to rename file: ${e.message}`);
      }
    }

    file.filename = normalizedName;
    file.storagePath = newPath;
    this.logger.log(`Renamed file: id=${id} to "${normalizedName}"`);
    return this.filesRepo.save(file);
  }

  // -- Helpers --------------------------------------------------------------

  /**
   * Build the virtual path (e.g. "/Invoices/Q1/invoice.pdf") for a file.
   */
  private async buildVirtualPath(file: File): Promise<string> {
    const segments: string[] = [];
    let currentId = file.folderId;
    while (currentId) {
      const folder = (await this.dataSource
        .getRepository("Folder")
        .findOne({ where: { id: currentId } })) as any;
      if (!folder) break;
      segments.unshift(folder.name);
      currentId = folder.parentId;
    }
    segments.push(file.filename);
    return "/" + segments.join("/");
  }

  /**
   * Return a path that doesn't collide with an existing file.
   * test.pdf -> test (1).pdf -> test (2).pdf ...
   */
  private async uniquePathAsync(dir: string, filename: string): Promise<string> {
    const ext = path.extname(filename);
    const base = path.basename(filename, ext);
    let candidate = path.join(dir, filename);
    let counter = 1;
    while (true) {
      try {
        await fsp.access(candidate);
        // file exists, try next
        candidate = path.join(dir, `${base} (${counter})${ext}`);
        counter++;
      } catch {
        // file doesn't exist — this path is available
        return candidate;
      }
    }
  }
}
