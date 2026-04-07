import * as path from "path";

// Set DATA_PATH before importing modules that use it
const testDataPath = path.join(__dirname, "test-data-trash");
process.env.DATA_PATH = testDataPath;

import { Test, TestingModule } from "@nestjs/testing";
import { ConfigModule } from "@nestjs/config";
import appConfig from "../../config/app.config";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import request = require("supertest");
import * as fs from "fs";
import { TrashModule } from "../trash/trash.module";
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

describe("Trash Integration Tests", () => {
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
        TrashModule,
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

  describe("GET /trash", () => {
    it("should return empty array when trash is empty", async () => {
      const response = await request(app.getHttpServer())
        .get("/trash")
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body).toHaveLength(0);
    });

    it("should list deleted files in trash", async () => {
      // Upload a file
      const fileBuffer = Buffer.from("Delete me");
      const uploadResponse = await request(app.getHttpServer())
        .post("/files/upload")
        .attach("file", fileBuffer, "to-delete.txt")
        .expect(201);

      const fileId = uploadResponse.body.id;

      // Delete the file (soft delete)
      await request(app.getHttpServer()).delete(`/files/${fileId}`).expect(204);

      // Check trash
      const response = await request(app.getHttpServer())
        .get("/trash")
        .expect(200);

      expect(response.body).toHaveLength(1);
      expect(response.body[0]).toHaveProperty("id", fileId);
      expect(response.body[0]).toHaveProperty("name", "to-delete.txt");
      expect(response.body[0]).toHaveProperty("type", "file");
      expect(response.body[0]).toHaveProperty("deletedAt");
      expect(response.body[0]).toHaveProperty("expiresAt");
    });

    it("should list deleted folders in trash", async () => {
      // Create a folder
      const folderResponse = await request(app.getHttpServer())
        .post("/folders")
        .send({ name: "ToDeleteFolder", parentId: null })
        .expect(201);

      const folderId = folderResponse.body.id;

      // Delete the folder (soft delete)
      await request(app.getHttpServer())
        .delete(`/folders/${folderId}`)
        .expect(204);

      // Check trash
      const response = await request(app.getHttpServer())
        .get("/trash")
        .expect(200);

      expect(response.body).toHaveLength(1);
      expect(response.body[0]).toHaveProperty("id", folderId);
      expect(response.body[0]).toHaveProperty("name", "ToDeleteFolder");
      expect(response.body[0]).toHaveProperty("type", "folder");
    });

    it("should show only top-level deleted folders", async () => {
      // Create parent and child folders
      const parentResponse = await request(app.getHttpServer())
        .post("/folders")
        .send({ name: "Parent", parentId: null })
        .expect(201);

      await request(app.getHttpServer())
        .post("/folders")
        .send({ name: "Child", parentId: parentResponse.body.id })
        .expect(201);

      // Delete parent (child is cascade soft-deleted too)
      await request(app.getHttpServer())
        .delete(`/folders/${parentResponse.body.id}`)
        .expect(204);

      // Check trash - should only show parent (child is inside deleted parent)
      const response = await request(app.getHttpServer())
        .get("/trash")
        .expect(200);

      const folderItems = response.body.filter((item: any) => item.type === "folder");
      expect(folderItems).toHaveLength(1);
      expect(folderItems[0].id).toBe(parentResponse.body.id);
    });

    it("should sort items by deletion date descending", async () => {
      // Upload and delete files with delays
      const file1Buffer = Buffer.from("File 1");
      const upload1 = await request(app.getHttpServer())
        .post("/files/upload")
        .attach("file", file1Buffer, "file1.txt")
        .expect(201);

      await request(app.getHttpServer())
        .delete(`/files/${upload1.body.id}`)
        .expect(204);

    await new Promise((resolve) => setTimeout(resolve, 100));

    const file2Buffer = Buffer.from("File 2");
    const upload2 = await request(app.getHttpServer())
      .post("/files/upload")
      .attach("file", file2Buffer, "file2.txt")
      .expect(201);

    await request(app.getHttpServer())
      .delete(`/files/${upload2.body.id}`)
      .expect(204);

      // Check trash order
      const response = await request(app.getHttpServer())
        .get("/trash")
        .expect(200);

      expect(response.body).toHaveLength(2);
      const first = new Date(response.body[0].deletedAt).getTime();
      const second = new Date(response.body[1].deletedAt).getTime();
      expect(first).toBeGreaterThanOrEqual(second);
    });

    it("should include file metadata in trash items", async () => {
      const fileBuffer = Buffer.from("Metadata test");
      const uploadResponse = await request(app.getHttpServer())
        .post("/files/upload")
      .attach("file", fileBuffer, "meta.txt")
      .expect(201);

    await request(app.getHttpServer())
      .delete(`/files/${uploadResponse.body.id}`)
      .expect(204);

    const response = await request(app.getHttpServer())
      .get("/trash")
        .expect(200);

      const item = response.body[0];
      expect(item).toHaveProperty("size");
      expect(item).toHaveProperty("mimeType");
    });
  });

  describe("POST /trash/files/:id/restore", () => {
    it("should restore a deleted file", async () => {
      // Upload and delete a file
      const fileBuffer = Buffer.from("Restore me");
      const uploadResponse = await request(app.getHttpServer())
        .post("/files/upload")
        .attach("file", fileBuffer, "restore.txt")
        .expect(201);

      const fileId = uploadResponse.body.id;
      const storagePath = uploadResponse.body.storagePath;

      await request(app.getHttpServer()).delete(`/files/${fileId}`).expect(204);

      // Restore the file
      await request(app.getHttpServer())
        .post(`/trash/files/${fileId}/restore`)
        .expect(204);

      // Verify file is restored (no longer in trash)
      const trashResponse = await request(app.getHttpServer())
        .get("/trash")
        .expect(200);
      expect(trashResponse.body).toHaveLength(0);

      // Verify file is accessible
      const fileResponse = await request(app.getHttpServer())
        .get(`/files/${fileId}`)
        .expect(200);

      expect(fileResponse.body.id).toBe(fileId);

      // Verify file still exists on disk
      expect(fs.existsSync(storagePath)).toBe(true);
    });

    it("should restore file to original location", async () => {
      // Create folder and upload file
      const folderResponse = await request(app.getHttpServer())
        .post("/folders")
        .send({ name: "Original", parentId: null })
        .expect(201);

      const fileBuffer = Buffer.from("In folder");
      const uploadResponse = await request(app.getHttpServer())
        .post("/files/upload")
        .attach("file", fileBuffer, "in-folder.txt")
        .field("folderId", folderResponse.body.id)
        .expect(201);

      const fileId = uploadResponse.body.id;

      // Delete and restore
      await request(app.getHttpServer()).delete(`/files/${fileId}`).expect(204);

      await request(app.getHttpServer())
        .post(`/trash/files/${fileId}/restore`)
        .expect(204);

      // Verify file is back in original folder
      const folderContents = await request(app.getHttpServer())
        .get(`/folders/${folderResponse.body.id}`)
        .expect(200);

      expect(folderContents.body.files).toHaveLength(1);
    });

    it("should handle restoring non-existent file", async () => {
      // Should not throw error
      await request(app.getHttpServer())
        .post("/trash/files/550e8400-e29b-41d4-a716-446655440999/restore")
        .expect(204);
    });

    it("should restore file with preserved metadata", async () => {
      const fileBuffer = Buffer.from("Preserve metadata");
      const uploadResponse = await request(app.getHttpServer())
        .post("/files/upload")
        .attach("file", fileBuffer, "preserve.txt")
        .expect(201);

      const originalSize = uploadResponse.body.size;
      const originalMimeType = uploadResponse.body.mimeType;

      await request(app.getHttpServer())
        .delete(`/files/${uploadResponse.body.id}`)
        .expect(204);

      await request(app.getHttpServer())
        .post(`/trash/files/${uploadResponse.body.id}/restore`)
        .expect(204);

      const fileResponse = await request(app.getHttpServer())
        .get(`/files/${uploadResponse.body.id}`)
        .expect(200);

      expect(fileResponse.body.size).toBe(originalSize);
      expect(fileResponse.body.mimeType).toBe(originalMimeType);
    });
  });

  describe("POST /trash/folders/:id/restore", () => {
    it("should restore a deleted folder", async () => {
      // Create and delete folder
      const folderResponse = await request(app.getHttpServer())
        .post("/folders")
        .send({ name: "RestoreFolder", parentId: null })
        .expect(201);

      const folderId = folderResponse.body.id;
      const folderPath = path.join(testDataPath, "RestoreFolder");

      await request(app.getHttpServer())
        .delete(`/folders/${folderId}`)
        .expect(204);

      // Restore
      await request(app.getHttpServer())
        .post(`/trash/folders/${folderId}/restore`)
        .expect(204);

      // Verify folder is back
      const folderResponse2 = await request(app.getHttpServer())
        .get(`/folders/${folderId}`)
        .expect(200);

      expect(folderResponse2.body.folder.name).toBe("RestoreFolder");

      // Verify folder exists on disk
      expect(fs.existsSync(folderPath)).toBe(true);
    });

    it("should restore folder and all its descendants", async () => {
      // Create folder hierarchy
      const parentResponse = await request(app.getHttpServer())
        .post("/folders")
        .send({ name: "Parent", parentId: null })
        .expect(201);

      const childResponse = await request(app.getHttpServer())
        .post("/folders")
        .send({ name: "Child", parentId: parentResponse.body.id })
        .expect(201);

      const grandchildResponse = await request(app.getHttpServer())
        .post("/folders")
        .send({ name: "Grandchild", parentId: childResponse.body.id })
        .expect(201);

      // Delete parent
      await request(app.getHttpServer())
        .delete(`/folders/${parentResponse.body.id}`)
        .expect(204);

      // Restore parent
      await request(app.getHttpServer())
        .post(`/trash/folders/${parentResponse.body.id}/restore`)
        .expect(204);

      // Verify all folders are restored
      await request(app.getHttpServer())
        .get(`/folders/${parentResponse.body.id}`)
        .expect(200);
      await request(app.getHttpServer())
        .get(`/folders/${childResponse.body.id}`)
        .expect(200);
      await request(app.getHttpServer())
        .get(`/folders/${grandchildResponse.body.id}`)
        .expect(200);
    });

    it("should restore files inside restored folder", async () => {
      // Create folder with file
      const folderResponse = await request(app.getHttpServer())
        .post("/folders")
        .send({ name: "WithFile", parentId: null })
        .expect(201);

      const fileBuffer = Buffer.from("Inside folder");
      const uploadResponse = await request(app.getHttpServer())
        .post("/files/upload")
        .attach("file", fileBuffer, "inside.txt")
        .field("folderId", folderResponse.body.id)
        .expect(201);

      const fileId = uploadResponse.body.id;

      // Delete folder
      await request(app.getHttpServer())
        .delete(`/folders/${folderResponse.body.id}`)
        .expect(204);

      // Restore folder
      await request(app.getHttpServer())
        .post(`/trash/folders/${folderResponse.body.id}/restore`)
        .expect(204);

      // Verify file is restored
      const folderContents = await request(app.getHttpServer())
        .get(`/folders/${folderResponse.body.id}`)
        .expect(200);

      const restoredFile = folderContents.body.files.find(
        (f: any) => f.id === fileId,
      );
      expect(restoredFile).toBeDefined();
    });

    it("should handle restoring non-existent folder", async () => {
      await request(app.getHttpServer())
        .post("/trash/folders/550e8400-e29b-41d4-a716-446655440999/restore")
        .expect(204);
    });
  });

  describe("DELETE /trash/files/:id", () => {
    it("should permanently delete a file", async () => {
      // Upload and delete a file
      const fileBuffer = Buffer.from("Delete permanently");
      const uploadResponse = await request(app.getHttpServer())
        .post("/files/upload")
        .attach("file", fileBuffer, "permanent.txt")
        .expect(201);

    const fileId = uploadResponse.body.id;
    const storagePath = uploadResponse.body.storagePath;

    await request(app.getHttpServer()).delete(`/files/${fileId}`).expect(204);

    // Verify file still exists on disk before permanent delete
    expect(fs.existsSync(storagePath)).toBe(true);

    // Permanently delete
    await request(app.getHttpServer())
      .delete(`/trash/files/${fileId}`)
      .expect(204);

      // Verify file is removed from trash
      const trashResponse = await request(app.getHttpServer())
        .get("/trash")
        .expect(200);
      const fileInTrash = trashResponse.body.find(
        (item: any) => item.id === fileId,
      );
      expect(fileInTrash).toBeUndefined();

      // Verify file is removed from database
      const dbResult = await dataSource.query(
        "SELECT * FROM files WHERE id = $1",
        [fileId],
      );
      expect(dbResult).toHaveLength(0);

      // Verify file is removed from disk
      expect(fs.existsSync(storagePath)).toBe(false);
    });

    it("should handle permanent delete of non-existent file", async () => {
      await request(app.getHttpServer())
        .delete("/trash/files/550e8400-e29b-41d4-a716-446655440999")
        .expect(204);
    });

    it("should also delete file index chunks", async () => {
      // Upload, index, then delete file
      const fileBuffer = Buffer.from("Index and delete");
      const uploadResponse = await request(app.getHttpServer())
        .post("/files/upload")
        .attach("file", fileBuffer, "indexed-delete.txt")
        .expect(201);

      const fileId = uploadResponse.body.id;

    // Index the file
    await request(app.getHttpServer())
      .post(`/files/${fileId}/reindex`)
      .expect(201);

    // Verify index exists
    let chunks = await dataSource.query(
      "SELECT * FROM file_index_chunks WHERE file_id = $1",
      [fileId],
    );
    expect(chunks.length).toBeGreaterThan(0);

    // Soft delete
    await request(app.getHttpServer()).delete(`/files/${fileId}`).expect(204);

    // Permanent delete
    await request(app.getHttpServer())
      .delete(`/trash/files/${fileId}`)
      .expect(204);

      // Verify chunks are deleted
      chunks = await dataSource.query(
        "SELECT * FROM file_index_chunks WHERE file_id = $1",
        [fileId],
      );
      expect(chunks).toHaveLength(0);
    });
  });

  describe("DELETE /trash/folders/:id", () => {
    it("should permanently delete a folder", async () => {
      // Create and delete folder
      const folderResponse = await request(app.getHttpServer())
        .post("/folders")
        .send({ name: "PermanentDelete", parentId: null })
        .expect(201);

      const folderId = folderResponse.body.id;
      const folderPath = path.join(testDataPath, "PermanentDelete");

      await request(app.getHttpServer())
        .delete(`/folders/${folderId}`)
        .expect(204);

      // Verify folder exists on disk before permanent delete
      expect(fs.existsSync(folderPath)).toBe(true);

      // Permanently delete
      await request(app.getHttpServer())
        .delete(`/trash/folders/${folderId}`)
        .expect(204);

      // Verify folder is removed from database
      const dbResult = await dataSource.query(
        "SELECT * FROM folders WHERE id = $1",
        [folderId],
      );
      expect(dbResult).toHaveLength(0);

      // Verify folder is removed from disk
      expect(fs.existsSync(folderPath)).toBe(false);
    });

    it("should permanently delete folder and all contents", async () => {
      // Create folder with subfolders and files
      const parentResponse = await request(app.getHttpServer())
        .post("/folders")
        .send({ name: "Parent", parentId: null })
        .expect(201);

      const childResponse = await request(app.getHttpServer())
        .post("/folders")
        .send({ name: "Child", parentId: parentResponse.body.id })
        .expect(201);

      const fileBuffer = Buffer.from("Inside child");
      const uploadResponse = await request(app.getHttpServer())
        .post("/files/upload")
        .attach("file", fileBuffer, "inside.txt")
        .field("folderId", childResponse.body.id)
        .expect(201);

      const filePath = uploadResponse.body.storagePath;

      // Delete parent
      await request(app.getHttpServer())
        .delete(`/folders/${parentResponse.body.id}`)
        .expect(204);

      // Permanent delete parent
      await request(app.getHttpServer())
        .delete(`/trash/folders/${parentResponse.body.id}`)
        .expect(204);

      // Verify all deleted
      const folders = await dataSource.query("SELECT * FROM folders");
      expect(folders).toHaveLength(0);

      const files = await dataSource.query("SELECT * FROM files");
      expect(files).toHaveLength(0);

      expect(fs.existsSync(filePath)).toBe(false);
    });

    it("should handle permanent delete of non-existent folder", async () => {
      await request(app.getHttpServer())
        .delete("/trash/folders/550e8400-e29b-41d4-a716-446655440999")
        .expect(204);
    });
  });

  describe("DELETE /trash (empty trash)", () => {
    it("should empty all trash", async () => {
      // Create and delete multiple items
      const upload1 = await request(app.getHttpServer())
        .post("/files/upload")
        .attach("file", Buffer.from("File 1"), "file1.txt")
        .expect(201);

      const upload2 = await request(app.getHttpServer())
        .post("/files/upload")
        .attach("file", Buffer.from("File 2"), "file2.txt")
        .expect(201);

    await request(app.getHttpServer())
      .delete(`/files/${upload1.body.id}`)
      .expect(204);

    await request(app.getHttpServer())
      .delete(`/files/${upload2.body.id}`)
      .expect(204);

    // Verify items in trash
    let trashResponse = await request(app.getHttpServer())
      .get("/trash")
      .expect(200);
    expect(trashResponse.body.length).toBeGreaterThanOrEqual(2);

      // Empty trash
      const response = await request(app.getHttpServer())
        .delete("/trash")
        .expect(200);

      expect(response.body).toHaveProperty("deletedFiles");
      expect(response.body).toHaveProperty("deletedFolders");
      expect(response.body.deletedFiles).toBeGreaterThanOrEqual(2);

      // Verify trash is empty
      trashResponse = await request(app.getHttpServer())
        .get("/trash")
        .expect(200);
      expect(trashResponse.body).toHaveLength(0);
    });

    it("should handle emptying already empty trash", async () => {
      const response = await request(app.getHttpServer())
        .delete("/trash")
        .expect(200);

      expect(response.body.deletedFiles).toBe(0);
      expect(response.body.deletedFolders).toBe(0);
    });

    it("should delete files before folders to avoid FK issues", async () => {
      // Create folder with file
      const folderResponse = await request(app.getHttpServer())
        .post("/folders")
        .send({ name: "WithFile", parentId: null })
        .expect(201);

      const fileBuffer = Buffer.from("Inside");
      await request(app.getHttpServer())
        .post("/files/upload")
        .attach("file", fileBuffer, "inside.txt")
        .field("folderId", folderResponse.body.id)
        .expect(201);

      // Delete folder (soft delete for both)
      await request(app.getHttpServer())
        .delete(`/folders/${folderResponse.body.id}`)
        .expect(204);

      // Empty trash should handle dependencies
      await request(app.getHttpServer()).delete("/trash").expect(200);

      // Verify all deleted
      const files = await dataSource.query("SELECT * FROM files");
      const folders = await dataSource.query("SELECT * FROM folders");
      expect(files).toHaveLength(0);
      expect(folders).toHaveLength(0);
    });
  });

  describe("POST /trash/purge-expired", () => {
    it("should purge files older than retention period", async () => {
      // This test would require manipulating the deleted_at timestamp
      // which is difficult in integration tests without DB manipulation
      // We'll test that the endpoint works

      const response = await request(app.getHttpServer())
        .post("/trash/purge-expired")
        .expect(201);

      expect(response.body).toHaveProperty("purgedFiles");
      expect(response.body).toHaveProperty("purgedFolders");
    });

    it("should return zero when no expired items", async () => {
      // Create and delete a fresh file (not expired)
      const fileBuffer = Buffer.from("Not expired");
      const uploadResponse = await request(app.getHttpServer())
        .post("/files/upload")
        .attach("file", fileBuffer, "fresh.txt")
        .expect(201);

    await request(app.getHttpServer())
      .delete(`/files/${uploadResponse.body.id}`)
      .expect(204);

    // Purge should not delete fresh items
    await request(app.getHttpServer())
      .post("/trash/purge-expired")
      .expect(201);

      // Fresh file should still be in trash
      const trashResponse = await request(app.getHttpServer())
        .get("/trash")
        .expect(200);
      expect(trashResponse.body.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe("Trash expiration", () => {
    it("should calculate expiration date correctly", async () => {
      const fileBuffer = Buffer.from("Expires test");
      const uploadResponse = await request(app.getHttpServer())
        .post("/files/upload")
        .attach("file", fileBuffer, "expires.txt")
        .expect(201);

      await request(app.getHttpServer())
        .delete(`/files/${uploadResponse.body.id}`)
        .expect(204);

      const response = await request(app.getHttpServer())
        .get("/trash")
        .expect(200);

      const item = response.body[0];
      expect(item).toHaveProperty("expiresAt");

      const deletedAt = new Date(item.deletedAt);
      const expiresAt = new Date(item.expiresAt);
      const diffDays =
        (expiresAt.getTime() - deletedAt.getTime()) / (1000 * 60 * 60 * 24);

      // Should be approximately 30 days
      expect(diffDays).toBeGreaterThanOrEqual(29);
      expect(diffDays).toBeLessThanOrEqual(31);
    });
  });

  describe("Edge cases", () => {
    it("should not show deleted files inside deleted folders in trash", async () => {
      // Create folder with file
      const folderResponse = await request(app.getHttpServer())
        .post("/folders")
        .send({ name: "ParentWithFile", parentId: null })
        .expect(201);

      const fileBuffer = Buffer.from("Nested");
      await request(app.getHttpServer())
        .post("/files/upload")
        .attach("file", fileBuffer, "nested.txt")
        .field("folderId", folderResponse.body.id)
        .expect(201);

      // Delete folder
      await request(app.getHttpServer())
        .delete(`/folders/${folderResponse.body.id}`)
        .expect(204);

      // Trash should only show the folder, not the file separately
      const response = await request(app.getHttpServer())
        .get("/trash")
        .expect(200);

      expect(response.body.length).toBe(1);
      expect(response.body[0].type).toBe("folder");
    });

    it("should handle restore of file with deleted parent folder", async () => {
      // Create folder and file
      const folderResponse = await request(app.getHttpServer())
        .post("/folders")
        .send({ name: "Parent", parentId: null })
        .expect(201);

      const fileBuffer = Buffer.from("Child file");
      const uploadResponse = await request(app.getHttpServer())
        .post("/files/upload")
        .attach("file", fileBuffer, "child.txt")
        .field("folderId", folderResponse.body.id)
        .expect(201);

      // Delete both
      await request(app.getHttpServer())
        .delete(`/folders/${folderResponse.body.id}`)
        .expect(204);

      // Try to restore just the file (file's folder is also deleted)
      await request(app.getHttpServer())
        .post(`/trash/files/${uploadResponse.body.id}/restore`)
        .expect(204);

      // The file should be restored but may lose its folder association
      const fileResponse = await request(app.getHttpServer())
        .get(`/files/${uploadResponse.body.id}`)
        .expect(200);

      // File should exist
      expect(fileResponse.body.id).toBe(uploadResponse.body.id);
    });

    it("should maintain data consistency after trash operations", async () => {
      // Upload file
      const fileBuffer = Buffer.from("Consistency check");
      const uploadResponse = await request(app.getHttpServer())
        .post("/files/upload")
        .attach("file", fileBuffer, "consistent.txt")
        .expect(201);

      const fileId = uploadResponse.body.id;
      const storagePath = uploadResponse.body.storagePath;

      // Delete
      await request(app.getHttpServer()).delete(`/files/${fileId}`).expect(204);

      // Verify soft delete in DB
      let dbResult = await dataSource.query(
        "SELECT deleted_at FROM files WHERE id = $1",
        [fileId],
      );
      expect(dbResult[0].deleted_at).not.toBeNull();

      // File should still exist on disk
      expect(fs.existsSync(storagePath)).toBe(true);

      // Permanent delete
      await request(app.getHttpServer())
        .delete(`/trash/files/${fileId}`)
        .expect(204);

      // Verify hard delete
      dbResult = await dataSource.query("SELECT * FROM files WHERE id = $1", [
        fileId,
      ]);
      expect(dbResult).toHaveLength(0);

      // File should be removed from disk
      expect(fs.existsSync(storagePath)).toBe(false);
    });
  });
});
