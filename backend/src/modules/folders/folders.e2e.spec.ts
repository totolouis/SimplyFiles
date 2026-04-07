import * as path from "path";

// Set DATA_PATH before importing modules that use it
const testDataPath = path.join(__dirname, "test-data-folders");
process.env.DATA_PATH = testDataPath;

import { Test, TestingModule } from "@nestjs/testing";
import { ConfigModule } from "@nestjs/config";
import appConfig from "../../config/app.config";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import request = require("supertest");
import * as fs from "fs";
import { FoldersModule } from "../folders/folders.module";
import { FilesModule } from "../files/files.module";
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

describe("Folders Integration Tests", () => {
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

  describe("POST /folders", () => {
    it("should create a folder in root", async () => {
      const response = await request(app.getHttpServer())
        .post("/folders")
        .send({ name: "TestFolder", parentId: null })
        .expect(201);

      expect(response.body).toHaveProperty("id");
      expect(response.body).toHaveProperty("name", "TestFolder");
      expect(response.body).toHaveProperty("parentId", null);
      expect(response.body).toHaveProperty("isSymlink", false);

      // Verify folder exists on disk (path uses folder name, not ID)
      const folderPath = path.join(testDataPath, "TestFolder");
      expect(fs.existsSync(folderPath)).toBe(true);
      expect(fs.statSync(folderPath).isDirectory()).toBe(true);
    });

    it("should create nested folders", async () => {
      // Create parent folder
      const parentResponse = await request(app.getHttpServer())
        .post("/folders")
        .send({ name: "Parent", parentId: null })
        .expect(201);

      const parentId = parentResponse.body.id;

      // Create child folder
      const childResponse = await request(app.getHttpServer())
        .post("/folders")
        .send({ name: "Child", parentId })
        .expect(201);

      expect(childResponse.body.parentId).toBe(parentId);

      // Verify folder structure on disk (paths use folder names)
      const parentPath = path.join(testDataPath, "Parent");
      const childPath = path.join(testDataPath, "Parent", "Child");
      expect(fs.existsSync(parentPath)).toBe(true);
      expect(fs.existsSync(childPath)).toBe(true);
    });

    it("should reject folder creation without name", async () => {
      const response = await request(app.getHttpServer())
        .post("/folders")
        .send({ parentId: null })
        .expect(400);

      // ValidationPipe returns message as an array
      const messages = Array.isArray(response.body.message)
        ? response.body.message.join(" ")
        : response.body.message;
      expect(messages).toContain("name");
    });

    it("should reject folder creation with non-existent parent", async () => {
      // FK constraint on parent_id causes a 500 error when parent doesn't exist
      await request(app.getHttpServer())
        .post("/folders")
        .send({
          name: "Orphan",
          parentId: "550e8400-e29b-41d4-a716-446655440999",
        })
        .expect(500);
    });
  });

  describe("GET /folders", () => {
    it("should return all folders", async () => {
      // Create some folders
      await request(app.getHttpServer())
        .post("/folders")
        .send({ name: "FolderA", parentId: null })
        .expect(201);

      await request(app.getHttpServer())
        .post("/folders")
        .send({ name: "FolderB", parentId: null })
        .expect(201);

      const response = await request(app.getHttpServer())
        .get("/folders")
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBe(2);
      expect(response.body[0]).toHaveProperty("name");
      expect(response.body[0]).toHaveProperty("id");
    });

    it("should return empty array when no folders exist", async () => {
      const response = await request(app.getHttpServer())
        .get("/folders")
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body).toHaveLength(0);
    });
  });

  describe("GET /folders/root", () => {
    it("should return root contents (folders and files)", async () => {
      // Create a folder in root
      await request(app.getHttpServer())
        .post("/folders")
        .send({ name: "RootFolder", parentId: null })
        .expect(201);

      // Upload a file to root
      const fileBuffer = Buffer.from("Root file content");
      await request(app.getHttpServer())
        .post("/files/upload")
        .attach("file", fileBuffer, "root-file.txt")
        .expect(201);

      const response = await request(app.getHttpServer())
        .get("/folders/root")
        .expect(200);

      expect(response.body).toHaveProperty("folders");
      expect(response.body).toHaveProperty("files");
      expect(response.body.folders).toHaveLength(1);
      expect(response.body.files).toHaveLength(1);
      expect(response.body.folders[0].name).toBe("RootFolder");
      expect(response.body.files[0].filename).toBe("root-file.txt");
    });

    it("should return empty arrays for empty root", async () => {
      const response = await request(app.getHttpServer())
        .get("/folders/root")
        .expect(200);

      expect(response.body.folders).toHaveLength(0);
      expect(response.body.files).toHaveLength(0);
    });
  });

  describe("GET /folders/:id", () => {
    it("should return folder with contents", async () => {
      // Create folder
      const folderResponse = await request(app.getHttpServer())
        .post("/folders")
        .send({ name: "MyFolder", parentId: null })
        .expect(201);

      const folderId = folderResponse.body.id;

      // Upload file to folder
      const fileBuffer = Buffer.from("Folder file content");
      await request(app.getHttpServer())
        .post("/files/upload")
        .attach("file", fileBuffer, "folder-file.txt")
        .field("folderId", folderId)
        .expect(201);

      // Create subfolder
      await request(app.getHttpServer())
        .post("/folders")
        .send({ name: "SubFolder", parentId: folderId })
        .expect(201);

      const response = await request(app.getHttpServer())
        .get(`/folders/${folderId}`)
        .expect(200);

      expect(response.body).toHaveProperty("folder");
      expect(response.body).toHaveProperty("folders");
      expect(response.body).toHaveProperty("files");
      expect(response.body.folder.name).toBe("MyFolder");
      expect(response.body.folders).toHaveLength(1);
      expect(response.body.files).toHaveLength(1);
    });

    it("should return 404 for non-existent folder", async () => {
      const response = await request(app.getHttpServer())
        .get("/folders/550e8400-e29b-41d4-a716-446655440999")
        .expect(404);

      expect(response.body.message).toContain("Folder not found");
    });

    it("should validate UUID format", async () => {
      const response = await request(app.getHttpServer())
        .get("/folders/invalid-uuid")
        .expect(400);

      expect(response.body.message).toMatch(/uuid/i);
    });
  });

  describe("PATCH /folders/:id (rename)", () => {
    it("should rename a folder and update filesystem", async () => {
      // Create folder
      const createResponse = await request(app.getHttpServer())
        .post("/folders")
        .send({ name: "OldName", parentId: null })
        .expect(201);

      const folderId = createResponse.body.id;

      // Verify folder exists at original path
      const oldPath = path.join(testDataPath, "OldName");
      expect(fs.existsSync(oldPath)).toBe(true);

      // Rename folder
      const response = await request(app.getHttpServer())
        .patch(`/folders/${folderId}`)
        .send({ name: "NewName" })
        .expect(200);

      expect(response.body.name).toBe("NewName");

      // Path should have changed to use new name
      const newPath = path.join(testDataPath, "NewName");
      expect(fs.existsSync(newPath)).toBe(true);
      expect(fs.existsSync(oldPath)).toBe(false);
    });

    it("should update storage paths for files in renamed folder", async () => {
      // Create folder
      const folderResponse = await request(app.getHttpServer())
        .post("/folders")
        .send({ name: "RenameMe", parentId: null })
        .expect(201);

      const folderId = folderResponse.body.id;

      // Upload file to folder
      const fileBuffer = Buffer.from("Test content");
      const uploadResponse = await request(app.getHttpServer())
        .post("/files/upload")
        .attach("file", fileBuffer, "test.txt")
        .field("folderId", folderId)
        .expect(201);

      // Rename folder
      await request(app.getHttpServer())
        .patch(`/folders/${folderId}`)
        .send({ name: "RenamedFolder" })
        .expect(200);

      // Verify file still accessible
      const fileId = uploadResponse.body.id;
      const fileResponse = await request(app.getHttpServer())
        .get(`/files/${fileId}`)
        .expect(200);

      expect(fileResponse.body.filename).toBe("test.txt");
    });

    it("should return 404 for non-existent folder", async () => {
      const response = await request(app.getHttpServer())
        .patch("/folders/550e8400-e29b-41d4-a716-446655440999")
        .send({ name: "NewName" })
        .expect(404);

      expect(response.body.message).toContain("Folder not found");
    });
  });

  describe("PATCH /folders/:id/move", () => {
    it("should move folder to different parent", async () => {
      // Create source and target folders
      const sourceResponse = await request(app.getHttpServer())
        .post("/folders")
        .send({ name: "Source", parentId: null })
        .expect(201);

      const targetResponse = await request(app.getHttpServer())
        .post("/folders")
        .send({ name: "Target", parentId: null })
        .expect(201);

      const sourceId = sourceResponse.body.id;
      const targetId = targetResponse.body.id;

      // Move source into target
      const response = await request(app.getHttpServer())
        .patch(`/folders/${sourceId}/move`)
        .send({ parentId: targetId })
        .expect(200);

      expect(response.body.parentId).toBe(targetId);
    });

    it("should move folder to root (null parent)", async () => {
      // Create parent and child
      const parentResponse = await request(app.getHttpServer())
        .post("/folders")
        .send({ name: "Parent", parentId: null })
        .expect(201);

      const childResponse = await request(app.getHttpServer())
        .post("/folders")
        .send({ name: "Child", parentId: parentResponse.body.id })
        .expect(201);

      // Move child to root
      const response = await request(app.getHttpServer())
        .patch(`/folders/${childResponse.body.id}/move`)
        .send({ parentId: null })
        .expect(200);

      expect(response.body.parentId).toBeNull();
    });

    it("should reject moving folder into itself", async () => {
      const folderResponse = await request(app.getHttpServer())
        .post("/folders")
        .send({ name: "Self", parentId: null })
        .expect(201);

      const response = await request(app.getHttpServer())
        .patch(`/folders/${folderResponse.body.id}/move`)
        .send({ parentId: folderResponse.body.id })
        .expect(400);

      expect(response.body.message).toContain("itself");
    });

    it("should reject moving folder into its own descendant", async () => {
      // Create grandparent -> parent -> child
      const grandparentResponse = await request(app.getHttpServer())
        .post("/folders")
        .send({ name: "Grandparent", parentId: null })
        .expect(201);

      const parentResponse = await request(app.getHttpServer())
        .post("/folders")
        .send({
          name: "Parent",
          parentId: grandparentResponse.body.id,
        })
        .expect(201);

      await request(app.getHttpServer())
        .post("/folders")
        .send({
          name: "Child",
          parentId: parentResponse.body.id,
        })
        .expect(201);

      // Try to move grandparent into parent (descendant)
      const response = await request(app.getHttpServer())
        .patch(`/folders/${grandparentResponse.body.id}/move`)
        .send({ parentId: parentResponse.body.id })
        .expect(400);

      expect(response.body.message).toContain("subfolder");
    });

    it("should update storage paths when moving folder", async () => {
      // Create folders
      const folderAResponse = await request(app.getHttpServer())
        .post("/folders")
        .send({ name: "FolderA", parentId: null })
        .expect(201);

      const folderBResponse = await request(app.getHttpServer())
        .post("/folders")
        .send({ name: "FolderB", parentId: null })
        .expect(201);

      const folderAId = folderAResponse.body.id;
      const folderBId = folderBResponse.body.id;

      // Upload file to FolderA
      const fileBuffer = Buffer.from("Move me");
      const uploadResponse = await request(app.getHttpServer())
        .post("/files/upload")
        .attach("file", fileBuffer, "move-me.txt")
        .field("folderId", folderAId)
        .expect(201);

      const fileId = uploadResponse.body.id;
      const oldStoragePath = uploadResponse.body.storagePath;

      // Move FolderA into FolderB
      await request(app.getHttpServer())
        .patch(`/folders/${folderAId}/move`)
        .send({ parentId: folderBId })
        .expect(200);

      // Verify file path updated in DB
      const fileResponse = await request(app.getHttpServer())
        .get(`/files/${fileId}`)
        .expect(200);

      // Path should have changed
      expect(fileResponse.body.storagePath).not.toBe(oldStoragePath);
      expect(fs.existsSync(fileResponse.body.storagePath)).toBe(true);
    });
  });

  describe("DELETE /folders/:id", () => {
    it("should soft delete folder", async () => {
      // Create folder
      const createResponse = await request(app.getHttpServer())
        .post("/folders")
        .send({ name: "ToDelete", parentId: null })
        .expect(201);

      const folderId = createResponse.body.id;

      // Delete folder
      await request(app.getHttpServer())
        .delete(`/folders/${folderId}`)
        .expect(204);

      // Verify folder is soft-deleted (should not appear in list)
      const listResponse = await request(app.getHttpServer())
        .get("/folders")
        .expect(200);

      expect(listResponse.body).toHaveLength(0);
    });

    it("should soft delete folder with contents recursively", async () => {
      // Create folder hierarchy
      const parentResponse = await request(app.getHttpServer())
        .post("/folders")
        .send({ name: "Parent", parentId: null })
        .expect(201);

      const childResponse = await request(app.getHttpServer())
        .post("/folders")
        .send({ name: "Child", parentId: parentResponse.body.id })
        .expect(201);

      // Upload file to child
      const fileBuffer = Buffer.from("Nested file");
      await request(app.getHttpServer())
        .post("/files/upload")
        .attach("file", fileBuffer, "nested.txt")
        .field("folderId", childResponse.body.id)
        .expect(201);

      // Delete parent
      await request(app.getHttpServer())
        .delete(`/folders/${parentResponse.body.id}`)
        .expect(204);

      // Verify root is empty
      const rootResponse = await request(app.getHttpServer())
        .get("/folders/root")
        .expect(200);

      expect(rootResponse.body.folders).toHaveLength(0);
      expect(rootResponse.body.files).toHaveLength(0);
    });

    it("should return 404 for non-existent folder", async () => {
      const response = await request(app.getHttpServer())
        .delete("/folders/550e8400-e29b-41d4-a716-446655440999")
        .expect(404);

      expect(response.body.message).toContain("Folder not found");
    });
  });

  describe("POST /folders/search-goto", () => {
    it("should search folders by name", async () => {
      // Create folders
      await request(app.getHttpServer())
        .post("/folders")
        .send({ name: "Documents", parentId: null })
        .expect(201);

      await request(app.getHttpServer())
        .post("/folders")
        .send({ name: "Images", parentId: null })
        .expect(201);

      const response = await request(app.getHttpServer())
        .post("/folders/search-goto")
        .send({ query: "doc", page: 0, limit: 20 })
        .expect(201);

      expect(response.body).toHaveProperty("results");
      expect(response.body).toHaveProperty("total");
      expect(response.body).toHaveProperty("page");
      expect(response.body).toHaveProperty("totalPages");
      expect(response.body.results.length).toBeGreaterThan(0);
      expect(response.body.results[0].name).toMatch(/doc/i);
    });

    it("should support sequence search with comma separator", async () => {
      // Create nested folders
      const docsResponse = await request(app.getHttpServer())
        .post("/folders")
        .send({ name: "Documents", parentId: null })
        .expect(201);

      await request(app.getHttpServer())
        .post("/folders")
        .send({
          name: "Work",
          parentId: docsResponse.body.id,
        })
        .expect(201);

      // Search with sequence
      const response = await request(app.getHttpServer())
        .post("/folders/search-goto")
        .send({ query: "doc,work", page: 0, limit: 20 })
        .expect(201);

      expect(response.body.results.length).toBeGreaterThan(0);
    });

    it("should return empty results for non-matching query", async () => {
      await request(app.getHttpServer())
        .post("/folders")
        .send({ name: "TestFolder", parentId: null })
        .expect(201);

      const response = await request(app.getHttpServer())
        .post("/folders/search-goto")
        .send({ query: "xyznonexistent", page: 0, limit: 20 })
        .expect(201);

      expect(response.body.results).toHaveLength(0);
      expect(response.body.total).toBe(0);
    });

    it("should support pagination", async () => {
      // Create multiple folders
      for (let i = 0; i < 5; i++) {
        await request(app.getHttpServer())
          .post("/folders")
          .send({ name: `Folder${i}`, parentId: null })
          .expect(201);
      }

      // Get first page with limit 2
      const response = await request(app.getHttpServer())
        .post("/folders/search-goto")
        .send({ query: "folder", page: 0, limit: 2 })
        .expect(201);

      expect(response.body.results).toHaveLength(2);
      expect(response.body.total).toBe(5);
      expect(response.body.totalPages).toBe(3);
    });
  });

  describe("Data consistency", () => {
    it("should maintain consistency between DB and filesystem on folder operations", async () => {
      // Create folder
      const createResponse = await request(app.getHttpServer())
        .post("/folders")
        .send({ name: "Consistent", parentId: null })
        .expect(201);

      const folderId = createResponse.body.id;

      // Verify DB record
      const dbResult = await dataSource.query(
        "SELECT * FROM folders WHERE id = $1",
        [folderId],
      );
      expect(dbResult).toHaveLength(1);
      expect(dbResult[0].name).toBe("Consistent");

      // Verify filesystem (path uses folder name)
      const folderPath = path.join(testDataPath, "Consistent");
      expect(fs.existsSync(folderPath)).toBe(true);

      // Rename and verify
      await request(app.getHttpServer())
        .patch(`/folders/${folderId}`)
        .send({ name: "Renamed" })
        .expect(200);

      // Verify DB updated
      const renamedResult = await dataSource.query(
        "SELECT * FROM folders WHERE id = $1",
        [folderId],
      );
      expect(renamedResult[0].name).toBe("Renamed");

      // Delete and verify
      await request(app.getHttpServer())
        .delete(`/folders/${folderId}`)
        .expect(204);

      // Should be soft-deleted
      const deletedResult = await dataSource.query(
        "SELECT * FROM folders WHERE id = $1",
        [folderId],
      );
      expect(deletedResult[0].deleted_at).not.toBeNull();
    });
  });
});
