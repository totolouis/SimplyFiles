import { Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { File } from "../files/file.entity";
import { FileIndexService } from "../search/file-index.service";
import * as fsp from "fs/promises";

export interface ReindexResult {
  indexed: string[];
  queued: number;
  failed: number;
}

@Injectable()
export class Reindexer {
  private readonly logger = new Logger(Reindexer.name);
  private static readonly BATCH_SIZE = 100;

  constructor(
    @InjectRepository(File) private filesRepo: Repository<File>,
    private fileIndexService: FileIndexService,
  ) {}

  async reindex(): Promise<ReindexResult> {
    const indexed: string[] = [];
    let queued = 0;
    let failed = 0;

    while (true) {
      const rows = await this.findUnindexedBatch();
      if (rows.length === 0) break;
      queued += rows.length;

      for (const row of rows) {
        try {
          try {
            await fsp.access(row.storagePath);
          } catch {
            failed++;
            continue;
          }

          const buffer = await fsp.readFile(row.storagePath);
          const fileFromDb = await this.filesRepo.findOneBy({ id: row.id });
          if (!fileFromDb) {
            failed++;
            continue;
          }

          await this.fileIndexService.indexFile(fileFromDb, buffer);
          indexed.push(row.filename);
          this.logger.log(`Indexed: ${row.filename}`);
        } catch (e: any) {
          this.logger.warn(`Failed to index ${row.filename}: ${e.message}`);
          failed++;
        }
      }

      if (rows.length < Reindexer.BATCH_SIZE) break;
    }

    return { indexed, queued, failed };
  }

  private async findUnindexedBatch(): Promise<
    Array<{ id: string; filename: string; mimeType: string; storagePath: string }>
  > {
    return this.filesRepo.query(
      `SELECT f.id, f.filename, f.mime_type AS "mimeType", f.storage_path AS "storagePath"
         FROM files f
         LEFT JOIN file_index_chunks c ON c.file_id = f.id
         WHERE c.file_id IS NULL AND f.deleted_at IS NULL
         LIMIT $1`,
      [Reindexer.BATCH_SIZE],
    );
  }
}
