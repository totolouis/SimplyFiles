import { Injectable, OnApplicationBootstrap, Logger } from "@nestjs/common";
import { DataSource } from "typeorm";
import { PathService } from "./path.service";
import { TrashService } from "../modules/trash/trash.service";
import * as fsp from "fs/promises";

@Injectable()
export class DbInitService implements OnApplicationBootstrap {
  private readonly logger = new Logger(DbInitService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly pathService: PathService,
    private readonly trashService: TrashService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    this.logger.log('Running bootstrap tasks...');
    // await this.ensureGinIndex();
    await this.ensureFolderDirs();
    await this.purgeExpiredTrash();
    this.logger.log('Bootstrap tasks completed');
  }

  private async purgeExpiredTrash(): Promise<void> {
    try {
      await this.trashService.purgeExpired();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error("purgeExpiredTrash failed", message);
    }
  }

  // /** Ensure a GIN index exists on content_vector for fast full-text search. */
  // private async ensureGinIndex(): Promise<void> {
  //   try {
  //     await this.dataSource.query(
  //       `CREATE INDEX IF NOT EXISTS "idx_file_index_chunks_vector_gin"
  //        ON "file_index_chunks" USING GIN ("content_vector")`,
  //     );
  //   } catch (err: unknown) {
  //     const message = err instanceof Error ? err.message : String(err);
  //     this.logger.warn("ensureGinIndex failed (table may not exist yet)", message);
  //   }
  // }

  /** Make sure every folder in the DB has a directory on disk. */
  private async ensureFolderDirs(): Promise<void> {
    try {
      const folders: Array<{ id: string }> = await this.dataSource.query(
        `SELECT id FROM folders WHERE deleted_at IS NULL`,
      );
      await Promise.all(
        folders.map(async (f) => {
          const dir = await this.pathService.folderFsPath(f.id);
          await fsp.mkdir(dir, { recursive: true });
        }),
      );
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error("ensureFolderDirs failed", message);
    }
  }
}
