import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { DataSource } from "typeorm";
import { File } from "../files/file.entity";
import { extractTextFromFile } from "../../common/extract-text";

@Injectable()
export class FileIndexService {
  private readonly logger = new Logger(FileIndexService.name);
  private readonly chunkSize: number;
  private readonly searchLang: string;
  private readonly ocrEnabled: boolean;

  constructor(
    private dataSource: DataSource,
    private configService: ConfigService,
  ) {
    this.chunkSize = this.configService.get<number>('app.chunkSize') ?? 1500;
    this.searchLang = this.configService.get<string>('app.searchLang') ?? 'english';
    this.ocrEnabled = this.configService.get<boolean>('app.ocrEnabled') ?? false;
  }

  async indexFile(file: File, buffer: Buffer): Promise<boolean> {
    const lang = this.searchLang;

    // Strip null bytes (0x00) – PostgreSQL rejects them in text columns
    const rawText = await extractTextFromFile(file, buffer, this.ocrEnabled);
    const text = rawText ? rawText.replace(/\0/g, '') : rawText;

    // Run everything in a transaction so a failure leaves no partial state
    await this.dataSource.transaction(async (manager) => {
      // Wipe old chunks for this file before re-indexing
      await manager.query(`DELETE FROM file_index_chunks WHERE file_id = $1`, [
        file.id,
      ]);

      if (!text) {
        // Insert a sentinel empty chunk so the file is marked as processed
        // and won't be picked up as "unindexed" on every sync
        await manager.query(
          `INSERT INTO file_index_chunks (file_id, chunk_index, content_text, content_vector)
           VALUES ($1, 0, '', to_tsvector($2::regconfig, ''))`,
          [file.id, lang],
        );
        return;
      }

      // Split into chunks
      const chunks: string[] = [];
      for (let i = 0; i < text.length; i += this.chunkSize) {
        chunks.push(text.substring(i, i + this.chunkSize));
      }

      for (let i = 0; i < chunks.length; i++) {
        await manager.query(
          `INSERT INTO file_index_chunks (file_id, chunk_index, content_text, content_vector)
           VALUES ($1, $2, $3, to_tsvector($4::regconfig, $3))`,
          [file.id, i, chunks[i], lang],
        );
      }
    });
    this.logger.debug(`Indexed file: ${file.filename} (${text ? Math.ceil(text.length / this.chunkSize) + ' chunks' : 'no text'})`);
    return !!text;
  }

  async removeIndex(fileId: string): Promise<void> {
    await this.dataSource.query(
      `DELETE FROM file_index_chunks WHERE file_id = $1`,
      [fileId],
    );
    this.logger.debug(`Removed index for file: id=${fileId}`);
  }
}
