import * as path from "path";

// Set DATA_PATH before importing modules that use it
const testDataPath = path.join(__dirname, "test-data");
process.env.DATA_PATH = testDataPath;

import { Test, TestingModule } from "@nestjs/testing";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { ConfigModule } from "@nestjs/config";
import request = require("supertest");
import * as fs from "fs";
import type { IncomingMessage } from "http";
import { ScansModule } from "../scans/scans.module";
import { FilesModule } from "../files/files.module";
import { FoldersModule } from "../folders/folders.module";
import { PathModule } from "../../common/path.module";
import { Folder } from "../folders/folder.entity";
import { File } from "../files/file.entity";
import { DataSource } from "typeorm";
import { FileIndexChunk } from "../search/file-index-chunk.entity";
import { ScansService } from "./scans.service";
import {
  PostgreSqlContainer,
  StartedPostgreSqlContainer,
} from "@testcontainers/postgresql";
import { Client } from "pg";
import appConfig from "../../config/app.config";
import { FilesService } from "../files/files.service";

let postgresContainer: StartedPostgreSqlContainer;
let postgresClient: Client;

describe("Scans Integration Tests", () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let filesService: FilesService;

  beforeAll(async () => {
    // Ensure clean test data directory
    if (fs.existsSync(testDataPath)) {
      fs.rmSync(testDataPath, { recursive: true, force: true });
    }
    fs.mkdirSync(testDataPath, { recursive: true });

    //connect our container
    postgresContainer = await new PostgreSqlContainer(
      "postgres:16.13-bookworm",
    ).start();

    postgresClient = new Client({
      host: postgresContainer.getHost(),
      port: postgresContainer.getPort(),
      database: postgresContainer.getDatabase(),
      user: postgresContainer.getUsername(),
      password: postgresContainer.getPassword(),
    });

    await postgresClient.connect();
    //Set new database Url
    const databaseUrl = `postgresql://${postgresClient.user}:${postgresClient.password}@${postgresClient.host}:${postgresClient.port}/${postgresClient.database}`;
    // Execute Prisma migrations
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, load: [appConfig] }),
        TypeOrmModule.forRoot({
          type: "postgres",
          url: databaseUrl,
          entities: [Folder, File, FileIndexChunk],
          synchronize: true,
          logging: false,
        }),
        PathModule,
        FoldersModule,
        FilesModule,
        ScansModule,
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe());

    await app.init();

    dataSource = moduleRef.get(DataSource);
    filesService = app.get(FilesService);
  }, 60000); // Increase timeout for container startup and migrations

  afterAll(async () => {
    if (app) {
      await app.close();
    }

    // Clean up test data directory
    if (fs.existsSync(testDataPath)) {
      fs.rmSync(testDataPath, { recursive: true, force: true });
    }
    await postgresClient.end();
    await postgresContainer.stop();
  });

  beforeEach(async () => {
    const scansService = app.get(ScansService);

    // Wait for any in-flight async processUpload to finish before truncating
    await scansService.waitForUploads();
    await filesService.waitForPendingIndexing();

    // Clear in-memory state
    scansService.clearAllTasks();
    scansService.resetScansFolderId();

    // Clean database - use TRUNCATE CASCADE for a truly blank slate
    await dataSource.query("TRUNCATE TABLE file_index_chunks CASCADE");
    await dataSource.query("TRUNCATE TABLE files CASCADE");
    await dataSource.query("TRUNCATE TABLE folders CASCADE");
  });

  describe("POST /documents/post_document", () => {
    it("should require a file for upload", async () => {
      const response = await request(app.getHttpServer())
        .post("/documents/post_document")
        .expect(400);

      expect(response.body.message).toContain("No document provided");
    });

    it("should accept PDF files", async () => {
      const pdfBuffer = Buffer.from("%PDF-1.4 test content");

      // This will fail to connect to Paperless-ngx since we're not mocking it
      // But it validates the file upload path works
      await request(app.getHttpServer())
        .post("/documents/post_document")
        .attach("document", pdfBuffer, "test-document.pdf")
        .expect(200);
    });

    it("should accept JPEG files", async () => {
      const jpegBuffer = Buffer.from([0xff, 0xd8, 0xff, 0xe0]); // JPEG header

      await request(app.getHttpServer())
        .post("/documents/post_document")
        .attach("document", jpegBuffer, {
          filename: "photo.jpg",
          contentType: "image/jpeg",
        })
        .expect(200);
    });

    it("should accept PNG files", async () => {
      const pngBuffer = Buffer.from([0x89, 0x50, 0x4e, 0x47]); // PNG header

      await request(app.getHttpServer())
        .post("/documents/post_document")
        .attach("document", pngBuffer, {
          filename: "scan.png",
          contentType: "image/png",
        })
        .expect(200);
    });

    it("should reject ZIP files", async () => {
      const zipBuffer = Buffer.from([0x50, 0x4b, 0x03, 0x04]); // ZIP header

      const response = await request(app.getHttpServer())
        .post("/documents/post_document")
        .attach("document", zipBuffer, "archive.zip")
        .field("mimetype", "application/zip")
        .expect(400);

      expect(response.body.message).toContain("Invalid file type");
    });

    it("should validate metadata fields", async () => {
      const pdfBuffer = Buffer.from("%PDF-1.4 test content");

      await request(app.getHttpServer())
        .post("/documents/post_document")
        .attach("document", pdfBuffer, "document.pdf")
        .field("title", "My Test Document")
        .field("created", "2024-01-15")
        .field("correspondent", "12")
        .field("document_type", "3")
        .field("tags", "3")
        .field("tags", "7")
        .expect(200);
    });

    it("should reject invalid date format", async () => {
      const pdfBuffer = Buffer.from("%PDF-1.4 test content");

      const response = await request(app.getHttpServer())
        .post("/documents/post_document")
        .attach("document", pdfBuffer, "document.pdf")
        .field("created", "not-a-date")
        .expect(400);

      expect(response.body.message).toContain("Invalid created date format");
    });

    it("should accept ISO date format", async () => {
      const pdfBuffer = Buffer.from("%PDF-1.4 test content");

      await request(app.getHttpServer())
        .post("/documents/post_document")
        .attach("document", pdfBuffer, "document.pdf")
        .field("created", "2024-01-15T10:30:00.000Z")
        .expect(200);
    });
  });

  describe("GET /documents/tasks", () => {
    it("should require task_id parameter", async () => {
      const response = await request(app.getHttpServer())
        .get("/documents/tasks")
        .expect(400);

      expect(response.body.message).toContain(
        "task_id query parameter is required",
      );
    });

    it("should validate task_id is provided", async () => {
      const response = await request(app.getHttpServer())
        .get("/documents/tasks?task_id=")
        .expect(400);

      expect(response.body.message).toContain(
        "task_id query parameter is required",
      );
    });
  });

  describe("GET /documents/tasks/all", () => {
    it("should return empty array when no tasks exist", async () => {
      const response = await request(app.getHttpServer())
        .get("/documents/tasks/all")
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body).toHaveLength(0);
    });

    it("should return tasks after uploading documents", async () => {
      const pdfBuffer = Buffer.from("%PDF-1.4 test content");

      // Upload a document to create a task
      await request(app.getHttpServer())
        .post("/documents/post_document")
        .attach("document", pdfBuffer, "test-document.pdf")
        .expect(200);

      // Wait for async processing to complete (or fail)
      const scansService = app.get(ScansService);
      await scansService.waitForUploads();
      await filesService.waitForPendingIndexing();

      const response = await request(app.getHttpServer())
        .get("/documents/tasks/all")
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBeGreaterThanOrEqual(1);
      expect(response.body[0]).toHaveProperty("task_id");
      expect(response.body[0]).toHaveProperty("status");
      expect(response.body[0]).toHaveProperty("created");
    });

    it("should return tasks sorted by created date descending", async () => {
      const pdfBuffer = Buffer.from("%PDF-1.4 test content");

      // Upload two documents
      await request(app.getHttpServer())
        .post("/documents/post_document")
        .attach("document", pdfBuffer, "first.pdf")
        .expect(200);

      await new Promise((resolve) => setTimeout(resolve, 50));

      await request(app.getHttpServer())
        .post("/documents/post_document")
        .attach("document", pdfBuffer, "second.pdf")
        .expect(200);

      const scansService2 = app.get(ScansService);
      await scansService2.waitForUploads();
      await filesService.waitForPendingIndexing();

      const response = await request(app.getHttpServer())
        .get("/documents/tasks/all")
        .expect(200);

      expect(response.body.length).toBeGreaterThanOrEqual(2);
      // Newest first
      const first = new Date(response.body[0].created).getTime();
      const second = new Date(response.body[1].created).getTime();
      expect(first).toBeGreaterThanOrEqual(second);
    });
  });

  describe("GET /documents/tasks/stream (SSE)", () => {
    it("should return SSE content type", async () => {
      const { contentType } = await new Promise<{
        contentType: string;
      }>((resolve) => {
        const req = request(app.getHttpServer())
          .get("/documents/tasks/stream")
          .buffer(true)
          .parse((res, cb) => {
            const stream = res as unknown as IncomingMessage;
            const contentType = stream.headers["content-type"] || "";
            stream.on("data", () => {
              stream.destroy();
            });
            stream.on("end", () => cb(null, ""));
            stream.on("error", () => cb(null, ""));
            stream.on("close", () => resolve({ contentType }));
          });

        req.catch(() => {
          /* swallow abort error */
        });
      });

      expect(contentType).toContain("text/event-stream");
    });

    it("should emit initial task state", async () => {
      const data = await new Promise<string>((resolve) => {
        const req = request(app.getHttpServer())
          .get("/documents/tasks/stream")
          .buffer(true)
          .parse((res, cb) => {
            const stream = res as unknown as IncomingMessage;
            let data = "";
            stream.on("data", (chunk: Buffer) => {
              data += chunk.toString();
              stream.destroy();
            });
            stream.on("end", () => cb(null, data));
            stream.on("error", () => cb(null, data));
            stream.on("close", () => resolve(data));
          });

        req.catch(() => {
          /* swallow abort error */
        });
      });

      // SSE format: "data: ...\n\n"
      expect(data).toContain("data:");
      // Extract JSON from the SSE message
      const jsonMatch = data.match(/data:\s*(.+)/);
      expect(jsonMatch).toBeTruthy();
      const tasks = JSON.parse(jsonMatch![1]);
      expect(Array.isArray(tasks)).toBe(true);
    });
  });
});
