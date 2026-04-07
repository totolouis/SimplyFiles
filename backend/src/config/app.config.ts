import { registerAs } from "@nestjs/config";

export default registerAs("app", () => ({
  port: parseInt(process.env.PORT ?? "3001", 10),
  dataPath: process.env.DATA_PATH ?? "./data/files",
  maxUploadSize: parseInt(process.env.MAX_UPLOAD_SIZE ?? "524288000", 10),
  searchLang: process.env.SEARCH_LANG ?? "english",
  chunkSize: parseInt(process.env.SEARCH_CHUNK_SIZE ?? "1500", 10),
  databaseUrl:
    process.env.DATABASE_URL ??
    "postgres://docvault:docvault@localhost:5432/docvault",
  migrationsRun: false,
  synchronize: true,
  corsOrigin: process.env.CORS_ORIGIN ?? "http://localhost:5173",
  nodeEnv: process.env.NODE_ENV ?? "development",
  ocrEnabled: process.env.OCR_ENABLED === "true",
}));
