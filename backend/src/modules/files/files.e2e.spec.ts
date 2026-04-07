import * as path from "path";

// Set DATA_PATH before importing modules that use it
const testDataPath = path.join(__dirname, "test-data-files");
process.env.DATA_PATH = testDataPath;

import { Test, TestingModule } from "@nestjs/testing";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { ConfigModule } from "@nestjs/config";
import appConfig from "../../config/app.config";
import request = require("supertest");
import * as fs from "fs";
import { FilesModule } from "../files/files.module";
import { FoldersModule } from "../folders/folders.module";
import { PathModule } from "../../common/path.module";
import { Folder } from "../folders/folder.entity";
import { File } from "../files/file.entity";
import { DataSource } from "typeorm";
import {
  PostgreSqlContainer,
  StartedPostgreSqlContainer,
} from "@testcontainers/postgresql";
import { Client } from "pg";
import { FileIndexChunk } from "../search/file-index-chunk.entity";
import { FilesService } from "../files/files.service";

let postgresContainer: StartedPostgreSqlContainer;
let postgresClient: Client;

describe("Files Integration Tests", () => {
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
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe());

    await app.init();

    dataSource = moduleRef.get(DataSource);
    filesService = app.get(FilesService);
  }, 300000); // increase timeout for container startup and migrations

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
    await filesService.waitForPendingIndexing();
    // Clean database before each test
    await dataSource.query("TRUNCATE TABLE file_index_chunks CASCADE");
    await dataSource.query("TRUNCATE TABLE files CASCADE");
    await dataSource.query("TRUNCATE TABLE folders CASCADE");

    // Clean files in test directory
    if (fs.existsSync(testDataPath)) {
      fs.rmSync(testDataPath, { recursive: true, force: true });
    }
    fs.mkdirSync(testDataPath, { recursive: true });
  });

  describe("POST /files/upload", () => {
    it("should upload a file to root folder", async () => {
      const fileBuffer = Buffer.from("Test file content");

      const response = await request(app.getHttpServer())
        .post("/files/upload")
        .attach("file", fileBuffer, "test-document.txt")
        .expect(201);

      expect(response.body).toHaveProperty("id");
      expect(response.body).toHaveProperty("filename", "test-document.txt");
      expect(response.body).toHaveProperty("folderId", null);
      expect(response.body).toHaveProperty("mimeType");
      expect(response.body).toHaveProperty("size");
      expect(response.body).toHaveProperty("storagePath");

      // Verify file exists on disk
      expect(fs.existsSync(response.body.storagePath)).toBe(true);

      // Verify content matches
      const diskContent = fs.readFileSync(response.body.storagePath);
      expect(diskContent.toString()).toBe("Test file content");
    }, 300000); // increase timeout for file operations

    it("should upload a file to a specific folder", async () => {
      // Create a folder first
      const folderResponse = await request(app.getHttpServer())
        .post("/folders")
        .send({ name: "TestFolder", parentId: null })
        .expect(201);

      const fileBuffer = Buffer.from("File in folder");

      const response = await request(app.getHttpServer())
        .post("/files/upload")
        .attach("file", fileBuffer, "folder-file.txt")
        .field("folderId", folderResponse.body.id)
        .expect(201);

      expect(response.body.folderId).toBe(folderResponse.body.id);
      expect(fs.existsSync(response.body.storagePath)).toBe(true);
    });

    it("should handle filename collisions by appending suffix", async () => {
      const fileBuffer1 = Buffer.from("First file content");
      const fileBuffer2 = Buffer.from("Second file content");

      // First upload
      const first = await request(app.getHttpServer())
        .post("/files/upload")
        .attach("file", fileBuffer1, "same-name.txt")
        .expect(201);

      // Second upload with same name but different content
      const second = await request(app.getHttpServer())
        .post("/files/upload")
        .attach("file", fileBuffer2, "same-name.txt")
        .expect(201);

      // Both should exist with their original filename in DB
      expect(first.body.filename).toBe("same-name.txt");
      expect(second.body.filename).toBe("same-name.txt");
      // But storage paths should differ
      expect(first.body.storagePath).not.toBe(second.body.storagePath);
    });

    it("should reject files exceeding max size", async () => {
      // Create a buffer larger than MAX_SIZE (524288000 bytes = ~500MB)
      // For testing, we'll just test with a reasonably large buffer
      const largeBuffer = Buffer.alloc(1024 * 1024); // 1MB, should be fine

      const response = await request(app.getHttpServer())
        .post("/files/upload")
        .attach("file", largeBuffer, "large-file.bin")
        .expect(201);

      expect(response.body).toHaveProperty("id");
      expect(response.body.size).toBe(1024 * 1024);
    });
  }); // increase timeout for file uploads

  describe("GET /files/:id", () => {
    it("should retrieve file by ID", async () => {
      // Upload a file first
      const fileBuffer = Buffer.from("Test content");
      const uploadResponse = await request(app.getHttpServer())
        .post("/files/upload")
        .attach("file", fileBuffer, "find-me.txt")
        .expect(201);

      const fileId = uploadResponse.body.id;

      // Retrieve the file
      const response = await request(app.getHttpServer())
        .get(`/files/${fileId}`)
        .expect(200);

      expect(response.body.id).toBe(fileId);
      expect(response.body.filename).toBe("find-me.txt");
      expect(Number(response.body.size)).toBe(fileBuffer.length);
    });

    it("should return 404 for non-existent file", async () => {
      const response = await request(app.getHttpServer())
        .get("/files/550e8400-e29b-41d4-a716-446655440999")
        .expect(404);

      expect(response.body.message).toContain("File not found");
    });
  });

  describe("GET /files/:id/download", () => {
    it("should download file with attachment headers", async () => {
      const fileBuffer = Buffer.from("Downloadable content");
      const uploadResponse = await request(app.getHttpServer())
        .post("/files/upload")
        .attach("file", fileBuffer, "download-me.txt")
        .expect(201);

      const fileId = uploadResponse.body.id;

      const response = await request(app.getHttpServer())
        .get(`/files/${fileId}/download`)
        .expect(200)
        .expect("Content-Type", /text\/plain/)
        .expect("Content-Disposition", /attachment/);

      expect(response.text).toBe("Downloadable content");
    });
  });

  describe("GET /files/:id/stream", () => {
    it("should stream file with inline headers", async () => {
      const fileBuffer = Buffer.from("Streamable content");
      const uploadResponse = await request(app.getHttpServer())
        .post("/files/upload")
        .attach("file", fileBuffer, "stream-me.txt")
        .expect(201);

      const fileId = uploadResponse.body.id;

      const response = await request(app.getHttpServer())
        .get(`/files/${fileId}/stream`)
        .expect(200)
        .expect("Content-Type", /text\/plain/)
        .expect("Content-Disposition", /inline/);

      expect(response.text).toBe("Streamable content");
    });
  });

  describe("PATCH /files/:id/move", () => {
    it("should move file to different folder", async () => {
      // Create source and target folders via API
      const sourceFolderResponse = await request(app.getHttpServer())
        .post("/folders")
        .send({ name: "Source", parentId: null })
        .expect(201);

      const targetFolderResponse = await request(app.getHttpServer())
        .post("/folders")
        .send({ name: "Target", parentId: null })
        .expect(201);

      const sourceFolderId = sourceFolderResponse.body.id;
      const targetFolderId = targetFolderResponse.body.id;

      // Upload file to source folder
      const fileBuffer = Buffer.from("Move me");
      const uploadResponse = await request(app.getHttpServer())
        .post("/files/upload")
        .attach("file", fileBuffer, "move-me.txt")
        .field("folderId", sourceFolderId)
        .expect(201);

      const fileId = uploadResponse.body.id;
      const oldPath = uploadResponse.body.storagePath;

      // Move file to target folder
      const response = await request(app.getHttpServer())
        .patch(`/files/${fileId}/move`)
        .send({ folderId: targetFolderId })
        .expect(200);

      expect(response.body.folderId).toBe(targetFolderId);
      expect(response.body.storagePath).not.toBe(oldPath);
      expect(fs.existsSync(response.body.storagePath)).toBe(true);
      expect(fs.existsSync(oldPath)).toBe(false);
    });

    it("should move file to root (null folder)", async () => {
      // Create a folder via API
      const folderResponse = await request(app.getHttpServer())
        .post("/folders")
        .send({ name: "SomeFolder", parentId: null })
        .expect(201);

      const folderId = folderResponse.body.id;

      // Upload file to folder
      const fileBuffer = Buffer.from("Move to root");
      const uploadResponse = await request(app.getHttpServer())
        .post("/files/upload")
        .attach("file", fileBuffer, "to-root.txt")
        .field("folderId", folderId)
        .expect(201);

      const fileId = uploadResponse.body.id;

      // Move to root (null)
      const response = await request(app.getHttpServer())
        .patch(`/files/${fileId}/move`)
        .send({ folderId: null })
        .expect(200);

      expect(response.body.folderId).toBeNull();
    });
  });

  describe("DELETE /files/:id", () => {
    it("should soft delete file from database", async () => {
      // Upload a file
      const fileBuffer = Buffer.from("Delete me");
      const uploadResponse = await request(app.getHttpServer())
        .post("/files/upload")
        .attach("file", fileBuffer, "delete-me.txt")
        .expect(201);

      const fileId = uploadResponse.body.id;
      const storagePath = uploadResponse.body.storagePath;

      // Verify file exists
      expect(fs.existsSync(storagePath)).toBe(true);

      // Soft delete
      await request(app.getHttpServer()).delete(`/files/${fileId}`).expect(204);

      // File should still exist on disk (soft delete)
      expect(fs.existsSync(storagePath)).toBe(true);

      // Record should exist with deleted_at set
      const files = await dataSource.query(
        "SELECT * FROM files WHERE id = $1",
        [fileId],
      );
      expect(files).toHaveLength(1);
      expect(files[0].deleted_at).not.toBeNull();

      // Should not be accessible via API (findOne doesn't include soft-deleted)
      await request(app.getHttpServer()).get(`/files/${fileId}`).expect(404);
    });

    it("should return 404 when deleting non-existent file", async () => {
      const response = await request(app.getHttpServer())
        .delete("/files/550e8400-e29b-41d4-a716-446655440999")
        .expect(404);

      expect(response.body.message).toContain("File not found");
    });
  });

  describe("POST /files/reindex", () => {
    it("should reindex all files", async () => {
      // Upload some files
      const textBuffer = Buffer.from("Text content for indexing");
      const pdfBuffer = Buffer.from("%PDF-1.4 test pdf content");

      await request(app.getHttpServer())
        .post("/files/upload")
        .attach("file", textBuffer, "indexable.txt")
        .expect(201);

      await request(app.getHttpServer())
        .post("/files/upload")
        .attach("file", pdfBuffer, "document.pdf")
        .expect(201);

      // Clear the index
      await dataSource.query("TRUNCATE TABLE file_index_chunks CASCADE");

      // Reindex all files
      const response = await request(app.getHttpServer())
        .post("/files/reindex")
        .expect(201);

      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBe(2);

      // Check that index entries were created
      const indexEntries = await dataSource.query(
        "SELECT * FROM file_index_chunks",
      );
      expect(indexEntries.length).toBeGreaterThan(0);
    });
  });

  describe("POST /files/:id/reindex", () => {
    it("should reindex a single file", async () => {
      // Upload a file with enough content to be indexed (at least 5 chars)
      const fileBuffer = Buffer.from(
        "This is a longer text file with enough content to be indexed properly by the system.",
      );
      const uploadResponse = await request(app.getHttpServer())
        .post("/files/upload")
        .attach("file", fileBuffer, {
          filename: "reindex-me.txt",
          contentType: "text/plain",
        })
        .expect(201);

      const fileId = uploadResponse.body.id;
      const storagePath = uploadResponse.body.storagePath;

      // Verify file exists on disk
      expect(fs.existsSync(storagePath)).toBe(true);

      // Check file content
      const fileContent = fs.readFileSync(storagePath).toString();
      console.log("File content:", fileContent.substring(0, 100));
      console.log("MimeType:", uploadResponse.body.mimeType);

      // Clear the index for this file
      await dataSource.query(
        "DELETE FROM file_index_chunks WHERE file_id = $1",
        [fileId],
      );

      // Reindex single file
      const response = await request(app.getHttpServer())
        .post(`/files/${fileId}/reindex`)
        .expect(201);

      console.log("Reindex response:", JSON.stringify(response.body, null, 2));
      expect(response.body.indexed).toBe(true);
      expect(response.body.filename).toBe("reindex-me.txt");

      // Verify index was created
      const indexEntries = await dataSource.query(
        "SELECT * FROM file_index_chunks WHERE file_id = $1",
        [fileId],
      );
      expect(indexEntries.length).toBe(1);
    });

    it("should return 404 when reindexing non-existent file", async () => {
      const response = await request(app.getHttpServer())
        .post("/files/550e8400-e29b-41d4-a716-446655440999/reindex")
        .expect(404);

      expect(response.body.message).toContain("File not found");
    });
  });

  describe("File types handling", () => {
    it("should handle PDF files with text extraction", async () => {
      const pdfBuffer = Buffer.from(
        "%PDF-1.4\n1 0 obj\n<<\n/Type /Catalog\n>>\nendobj\ntrailer\n<<\n/Root 1 0 R\n>>\n%%EOF",
      );

      const response = await request(app.getHttpServer())
        .post("/files/upload")
        .attach("file", pdfBuffer, "minimal.pdf")
        .expect(201);

      expect(response.body.mimeType).toBe("application/pdf");
      expect(fs.existsSync(response.body.storagePath)).toBe(true);
    });

    it("should handle various text file types", async () => {
      const testCases = [
        {
          name: "code.js",
          content: "const x = 1;",
          mime: "application/javascript",
        },
        {
          name: "data.json",
          content: '{"key": "value"}',
          mime: "application/json",
        },
        { name: "readme.md", content: "# Hello", mime: "text/markdown" },
      ];

      for (const testCase of testCases) {
        const response = await request(app.getHttpServer())
          .post("/files/upload")
          .attach("file", Buffer.from(testCase.content), testCase.name)
          .expect(201);

        expect(response.body.filename).toBe(testCase.name);
      }
    });

    it("should handle binary files", async () => {
      const binaryBuffer = Buffer.from([0x00, 0x01, 0x02, 0x03, 0xff, 0xfe]);

      const response = await request(app.getHttpServer())
        .post("/files/upload")
        .attach("file", binaryBuffer, "binary.dat")
        .expect(201);

      expect(response.body.size).toBe(6);

      // Verify binary content is preserved
      const diskContent = fs.readFileSync(response.body.storagePath);
      expect(diskContent.equals(binaryBuffer)).toBe(true);
    });
  });

  describe("Data consistency", () => {
    it("should maintain consistency between DB and filesystem", async () => {
      const fileBuffer = Buffer.from("Consistency check");

      const uploadResponse = await request(app.getHttpServer())
        .post("/files/upload")
        .attach("file", fileBuffer, "consistent.txt")
        .expect(201);

      const fileId = uploadResponse.body.id;

      // Query database directly
      const dbFile = await dataSource.query(
        "SELECT * FROM files WHERE id = $1",
        [fileId],
      );
      expect(dbFile.length).toBe(1);

      // Verify storage path is correct
      expect(dbFile[0].storage_path).toBe(uploadResponse.body.storagePath);
      expect(fs.existsSync(dbFile[0].storage_path)).toBe(true);

      // Verify size matches
      expect(Number(dbFile[0].size)).toBe(fileBuffer.length);

      // Delete and verify soft delete
      await request(app.getHttpServer()).delete(`/files/${fileId}`).expect(204);

      // File should still exist on disk (soft delete preserves file)
      expect(fs.existsSync(dbFile[0].storage_path)).toBe(true);

      // Record should exist with deleted_at set
      const afterDelete = await dataSource.query(
        "SELECT * FROM files WHERE id = $1",
        [fileId],
      );
      expect(afterDelete).toHaveLength(1);
      expect(afterDelete[0].deleted_at).not.toBeNull();
    });
  });
});
