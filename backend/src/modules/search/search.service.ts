import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { DataSource } from "typeorm";

@Injectable()
export class SearchService {
  private readonly logger = new Logger(SearchService.name);
  private readonly searchLang: string;

  constructor(
    private dataSource: DataSource,
    private configService: ConfigService,
  ) {
    this.searchLang = this.configService.get<string>('app.searchLang') ?? 'english';
  }

  async search(query: string): Promise<unknown[]> {
    if (!query || query.trim().length < 2) return [];

    const lang = this.searchLang;
    // websearch_to_tsquery handles quotes, OR, and - natively
    const q = query.trim();
    if (!q) return [];

    try {
      const results = await this.dataSource.query(
        `WITH matched_chunks AS (
          -- All chunks that match, with their rank
          SELECT 
            c.file_id,
            c.content_text,
            c.content_vector,
            ts_rank(c.content_vector, websearch_to_tsquery($1::regconfig, $2)) AS chunk_rank
          FROM file_index_chunks c
          WHERE c.content_vector @@ websearch_to_tsquery($1::regconfig, $2)
        ),
        best_chunk AS (
          -- Pick the highest-ranking chunk per file for the snippet
          SELECT DISTINCT ON (file_id)
            file_id,
            content_text,
            content_vector,
            chunk_rank
          FROM matched_chunks
          ORDER BY file_id, chunk_rank DESC
        ),
        file_rank AS (
          -- Aggregate rank across all matching chunks per file
          SELECT file_id, MAX(chunk_rank) AS rank
          FROM matched_chunks
          GROUP BY file_id
        )
        SELECT 
          f.id AS "fileId",
          f.filename,
          f.mime_type AS "mimeType",
          f.size,
          f.folder_id AS "folderId",
          f.created_at AS "createdAt",
          fr.rank,
          ts_headline(
            $1::regconfig,
            bc.content_text,
            websearch_to_tsquery($1::regconfig, $2),
            'MaxWords=30, MinWords=10, ShortWord=3, MaxFragments=2'
          ) AS snippet
        FROM files f
        JOIN file_rank fr ON fr.file_id = f.id
        JOIN best_chunk bc ON bc.file_id = f.id
        WHERE f.deleted_at IS NULL
        ORDER BY fr.rank DESC
        LIMIT 50`,
        [lang, q],
      );
      this.logger.debug(`Search for "${q}" returned ${results.length} results`);
      return results;
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      this.logger.error(`Search error: ${message}`);
      return [];
    }
  }
}
