import { Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { File } from "../files/file.entity";
import { SyncReport } from "./sync-report.entity";
import { StaleCleaner } from "./stale-cleaner";
import { DiskImporter } from "./disk-importer";
import { Reindexer } from "./reindexer";

export { probeEntry } from "./probe-entry";
export type { SymlinkInfo } from "./probe-entry";

export type { SyncOperationDetail } from "./sync-operation.interface";
import type { SyncOperationDetail } from "./sync-operation.interface";

export interface SyncResult {
  id: string;
  createdAt: Date;
  operations: SyncOperationDetail[];
}

@Injectable()
export class IndexService {
  private readonly logger = new Logger(IndexService.name);

  constructor(
    @InjectRepository(File) private filesRepo: Repository<File>,
    @InjectRepository(SyncReport) private syncReportsRepo: Repository<SyncReport>,
    private staleCleaner: StaleCleaner,
    private diskImporter: DiskImporter,
    private reindexer: Reindexer,
  ) {}

  async getStats() {
    const total = await this.filesRepo.count();

    const [{ indexed }] = await this.filesRepo.query(`
      SELECT COUNT(DISTINCT c.file_id)::int AS indexed
      FROM file_index_chunks c
      JOIN files f ON f.id = c.file_id
      WHERE f.deleted_at IS NULL
    `);

    const unindexed = await this.filesRepo.query(`
      SELECT f.id, f.filename, f.mime_type AS "mimeType", f.storage_path AS "storagePath"
      FROM files f
      LEFT JOIN file_index_chunks c ON c.file_id = f.id
      WHERE c.file_id IS NULL AND f.deleted_at IS NULL
    `);

    const byType: Record<string, number> = {};
    for (const f of unindexed) {
      const t =
        f.mimeType === "application/pdf"
          ? "pdf"
          : (f.mimeType || "").startsWith("text/")
            ? "text"
            : "other";
      byType[t] = (byType[t] || 0) + 1;
    }

    return { total, indexed: Number(indexed), unindexed: unindexed.length, byType };
  }

  async sync(folderId: string | null): Promise<SyncResult> {
    this.logger.log(`Starting sync for folder=${folderId ?? "root"}`);
    const operations: SyncOperationDetail[] = [];

    // 1. Clean stale entries
    operations.push(await this.staleCleaner.removeStaleFiles(folderId));
    operations.push(await this.staleCleaner.removeStaleFolders(folderId));

    // 2. Fix broken symlinks
    operations.push(await this.staleCleaner.fixBrokenSymlinks());

    // 3. Import new files/folders from disk
    operations.push(...(await this.diskImporter.importFromDisk(folderId)));

    // 4. Reindex unindexed files
    const { indexed } = await this.reindexer.reindex();
    operations.push({ label: "Files reindexed", items: indexed });

    // Save report
    const report = this.syncReportsRepo.create({ folderId, operations });
    await this.syncReportsRepo.save(report);

    const opSummary = operations
      .map((o) => `${o.label}(${o.items.length})`)
      .join(", ");
    this.logger.log(`Sync completed: ${opSummary}`);
    return { id: report.id, createdAt: report.createdAt, operations };
  }

  async listReports(): Promise<SyncReport[]> {
    return this.syncReportsRepo.find({
      order: { createdAt: "DESC" },
      take: 50,
    });
  }

  async reindexMissing(): Promise<{
    queued: number;
    indexed: number;
    failed: number;
  }> {
    const result = await this.reindexer.reindex();
    return {
      queued: result.queued,
      indexed: result.indexed.length,
      failed: result.failed,
    };
  }

  async importFolder(folderId: string | null): Promise<{
    imported: number;
    importedFolders: number;
    skipped: number;
    failed: number;
    removedFiles: number;
    removedFolders: number;
    files: string[];
  }> {
    const syncResult = await this.sync(folderId);
    const ops = syncResult.operations;
    const find = (label: string) =>
      ops.find((o) => o.label === label)?.items ?? [];

    return {
      imported: find("Files imported").length,
      importedFolders: find("Folders imported").length,
      skipped: 0,
      failed: find("Failed to import").length,
      removedFiles: find("Stale files removed").length,
      removedFolders: find("Stale folders removed").length,
      files: find("Files imported"),
    };
  }
}
