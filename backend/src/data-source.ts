import * as path from "path";
import { DataSource } from "typeorm";
import { Folder } from "./modules/folders/folder.entity";
import { File } from "./modules/files/file.entity";
import { FileIndexChunk } from "./modules/search/file-index-chunk.entity";
import { SyncReport } from "./modules/index/sync-report.entity";
import { Favorite } from "./modules/favorites/favorite.entity";

const databaseUrl =
  process.env.DATABASE_URL ??
  "postgres://docvault:docvault@localhost:5432/docvault";

export default new DataSource({
  type: "postgres",
  url: databaseUrl,
  entities: [Folder, File, FileIndexChunk, SyncReport, Favorite],
  migrations: [path.join(__dirname, "migrations", "*{.ts,.js}")],
  synchronize: false,
  logging: false,
});
