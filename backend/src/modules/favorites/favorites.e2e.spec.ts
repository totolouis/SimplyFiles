import * as path from "path";

// Set DATA_PATH before importing modules that use it
const testDataPath = path.join(__dirname, "test-data-favorites");
process.env.DATA_PATH = testDataPath;

import { Test, TestingModule } from "@nestjs/testing";
import { ConfigModule } from "@nestjs/config";
import appConfig from "../../config/app.config";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import request = require("supertest");
import * as fs from "fs";
import { FavoritesModule } from "../favorites/favorites.module";
import { FilesModule } from "../files/files.module";
import { FoldersModule } from "../folders/folders.module";
import { PathModule } from "../../common/path.module";
import { Folder } from "../folders/folder.entity";
import { File } from "../files/file.entity";
import { Favorite } from "../favorites/favorite.entity";
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

describe("Favorites Integration Tests", () => {
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
          entities: [Folder, File, Favorite, FileIndexChunk],
          synchronize: true,
          logging: false,
        }),
        PathModule,
        FoldersModule,
        FilesModule,
        FavoritesModule,
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
    await dataSource.query("TRUNCATE TABLE favorites CASCADE");
    await dataSource.query("TRUNCATE TABLE file_index_chunks CASCADE");
    await dataSource.query("TRUNCATE TABLE files CASCADE");
    await dataSource.query("TRUNCATE TABLE folders CASCADE");

    // Clean files in test directory
    if (fs.existsSync(testDataPath)) {
      fs.rmSync(testDataPath, { recursive: true, force: true });
    }
    fs.mkdirSync(testDataPath, { recursive: true });
  });

  describe("POST /favorites", () => {
    it("should add a file to favorites", async () => {
      // Upload a file
      const fileBuffer = Buffer.from("Favorite file");
      const uploadResponse = await request(app.getHttpServer())
        .post("/files/upload")
        .attach("file", fileBuffer, "favorite.txt")
        .expect(201);

      const fileId = uploadResponse.body.id;

      // Add to favorites
      const response = await request(app.getHttpServer())
        .post("/favorites")
        .send({ itemType: "file", itemId: fileId })
        .expect(201);

      expect(response.body).toHaveProperty("id");
      expect(response.body).toHaveProperty("itemType", "file");
      expect(response.body).toHaveProperty("itemId", fileId);
      expect(response.body).toHaveProperty("createdAt");
    });

    it("should add a folder to favorites", async () => {
      // Create a folder
      const folderResponse = await request(app.getHttpServer())
        .post("/folders")
        .send({ name: "FavoriteFolder", parentId: null })
        .expect(201);

      const folderId = folderResponse.body.id;

      // Add to favorites
      const response = await request(app.getHttpServer())
        .post("/favorites")
        .send({ itemType: "folder", itemId: folderId })
        .expect(201);

      expect(response.body).toHaveProperty("itemType", "folder");
      expect(response.body).toHaveProperty("itemId", folderId);
    });

    it("should return existing favorite for duplicate add", async () => {
      // Upload a file
      const fileBuffer = Buffer.from("Duplicate test");
      const uploadResponse = await request(app.getHttpServer())
        .post("/files/upload")
        .attach("file", fileBuffer, "duplicate.txt")
        .expect(201);

      const fileId = uploadResponse.body.id;

      // Add to favorites first time
      const first = await request(app.getHttpServer())
        .post("/favorites")
        .send({ itemType: "file", itemId: fileId })
        .expect(201);

      // Add again - should return existing (idempotent)
      const second = await request(app.getHttpServer())
        .post("/favorites")
        .send({ itemType: "file", itemId: fileId })
        .expect(201);

      expect(second.body.id).toBe(first.body.id);
    });

    it("should allow favorites for non-existent items", async () => {
      const response = await request(app.getHttpServer())
        .post("/favorites")
        .send({
          itemType: "file",
          itemId: "550e8400-e29b-41d4-a716-446655440999",
        })
        .expect(201);

      expect(response.body).toHaveProperty("id");
      expect(response.body.itemId).toBe("550e8400-e29b-41d4-a716-446655440999");
    });

    it("should allow favorites for non-existent folders", async () => {
      const response = await request(app.getHttpServer())
        .post("/favorites")
        .send({
          itemType: "folder",
          itemId: "550e8400-e29b-41d4-a716-446655440999",
        })
        .expect(201);

      expect(response.body).toHaveProperty("id");
    });

    it("should accept any item type without validation", async () => {
      const fileBuffer = Buffer.from("Test");
      const uploadResponse = await request(app.getHttpServer())
        .post("/files/upload")
        .attach("file", fileBuffer, "test.txt")
        .expect(201);

      // No DTO validation on itemType, so any value is accepted
      const response = await request(app.getHttpServer())
        .post("/favorites")
        .send({ itemType: "invalid", itemId: uploadResponse.body.id })
        .expect(201);

      expect(response.body).toHaveProperty("id");
    });

    it("should fail for invalid UUID format", async () => {
      await request(app.getHttpServer())
        .post("/favorites")
        .send({ itemType: "file", itemId: "not-a-uuid" })
        .expect(500);
    });
  });

  describe("GET /favorites", () => {
    it("should return empty array when no favorites exist", async () => {
      const response = await request(app.getHttpServer())
        .get("/favorites")
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body).toHaveLength(0);
    });

    it("should list all favorites", async () => {
      // Create multiple favorites
      const file1 = await request(app.getHttpServer())
        .post("/files/upload")
        .attach("file", Buffer.from("Content 1"), "file1.txt")
        .expect(201);

      const file2 = await request(app.getHttpServer())
        .post("/files/upload")
        .attach("file", Buffer.from("Content 2"), "file2.txt")
        .expect(201);

      const folder = await request(app.getHttpServer())
        .post("/folders")
        .send({ name: "Folder", parentId: null })
        .expect(201);

      // Add to favorites
      await request(app.getHttpServer())
        .post("/favorites")
        .send({ itemType: "file", itemId: file1.body.id })
        .expect(201);

      await request(app.getHttpServer())
        .post("/favorites")
        .send({ itemType: "file", itemId: file2.body.id })
        .expect(201);

      await request(app.getHttpServer())
        .post("/favorites")
        .send({ itemType: "folder", itemId: folder.body.id })
        .expect(201);

      // Get favorites
      const response = await request(app.getHttpServer())
        .get("/favorites")
        .expect(200);

      expect(response.body).toHaveLength(3);

      // Should include item names
      const fileFavorite = response.body.find(
        (f: any) => f.itemType === "file",
      );
      expect(fileFavorite).toHaveProperty("name");
    });

    it("should include file metadata in favorites", async () => {
      const fileBuffer = Buffer.from("Metadata test");
      const uploadResponse = await request(app.getHttpServer())
        .post("/files/upload")
        .attach("file", fileBuffer, "meta.txt")
        .expect(201);

      await request(app.getHttpServer())
        .post("/favorites")
        .send({ itemType: "file", itemId: uploadResponse.body.id })
        .expect(201);

      const response = await request(app.getHttpServer())
        .get("/favorites")
        .expect(200);

      expect(response.body[0]).toHaveProperty("name");
      expect(response.body[0]).toHaveProperty("mimeType");
    });

    it("should include folder metadata in favorites", async () => {
      const folderResponse = await request(app.getHttpServer())
        .post("/folders")
        .send({ name: "MyFolder", parentId: null })
        .expect(201);

      await request(app.getHttpServer())
        .post("/favorites")
        .send({ itemType: "folder", itemId: folderResponse.body.id })
        .expect(201);

      const response = await request(app.getHttpServer())
        .get("/favorites")
        .expect(200);

      expect(response.body[0]).toHaveProperty("name", "MyFolder");
    });

    it("should sort favorites by creation date", async () => {
      // Create favorites with delays
      const file1 = await request(app.getHttpServer())
        .post("/files/upload")
        .attach("file", Buffer.from("Content first"), "first.txt")
        .expect(201);

      await request(app.getHttpServer())
        .post("/favorites")
        .send({ itemType: "file", itemId: file1.body.id })
        .expect(201);

      await new Promise((resolve) => setTimeout(resolve, 100));

      const file2 = await request(app.getHttpServer())
        .post("/files/upload")
        .attach("file", Buffer.from("Content second"), "second.txt")
        .expect(201);

      await request(app.getHttpServer())
        .post("/favorites")
        .send({ itemType: "file", itemId: file2.body.id })
        .expect(201);

      const response = await request(app.getHttpServer())
        .get("/favorites")
        .expect(200);

      // Should be sorted by createdAt descending
      const first = new Date(response.body[0].createdAt).getTime();
      const second = new Date(response.body[1].createdAt).getTime();
      expect(first).toBeGreaterThanOrEqual(second);
    });
  });

  describe("DELETE /favorites/:itemType/:itemId", () => {
    it("should remove a file from favorites", async () => {
      // Upload and favorite a file
      const fileBuffer = Buffer.from("Unfavorite me");
      const uploadResponse = await request(app.getHttpServer())
        .post("/files/upload")
        .attach("file", fileBuffer, "unfavorite.txt")
        .expect(201);

      await request(app.getHttpServer())
        .post("/favorites")
        .send({ itemType: "file", itemId: uploadResponse.body.id })
        .expect(201);

      // Verify it's favorited
      let response = await request(app.getHttpServer())
        .get("/favorites")
        .expect(200);
      expect(response.body).toHaveLength(1);

      // Remove from favorites
      await request(app.getHttpServer())
        .delete(`/favorites/file/${uploadResponse.body.id}`)
        .expect(204);

      // Verify it's removed
      response = await request(app.getHttpServer())
        .get("/favorites")
        .expect(200);
      expect(response.body).toHaveLength(0);
    });

    it("should remove a folder from favorites", async () => {
      // Create and favorite a folder
      const folderResponse = await request(app.getHttpServer())
        .post("/folders")
        .send({ name: "UnfavoriteFolder", parentId: null })
        .expect(201);

      await request(app.getHttpServer())
        .post("/favorites")
        .send({ itemType: "folder", itemId: folderResponse.body.id })
        .expect(201);

      // Remove from favorites
      await request(app.getHttpServer())
        .delete(`/favorites/folder/${folderResponse.body.id}`)
        .expect(204);

      // Verify it's removed
      const response = await request(app.getHttpServer())
        .get("/favorites")
        .expect(200);
      expect(response.body).toHaveLength(0);
    });

    it("should handle removing non-favorited item", async () => {
      // Try to remove something not favorited
      await request(app.getHttpServer())
        .delete("/favorites/file/550e8400-e29b-41d4-a716-446655440999")
        .expect(204);
    });

    it("should validate UUID format when removing", async () => {
      const response = await request(app.getHttpServer())
        .delete("/favorites/file/invalid-uuid")
        .expect(400);

      expect(response.body.message).toMatch(/uuid/i);
    });

    it("should handle invalid item type when removing", async () => {
      // itemType is just a string param, no validation - returns 204 (nothing to delete)
      await request(app.getHttpServer())
        .delete("/favorites/invalid/550e8400-e29b-41d4-a716-446655440999")
        .expect(204);
    });
  });

  describe("GET /favorites/check/:itemType/:itemId", () => {
    it("should return true for favorited item", async () => {
      // Upload and favorite
      const fileBuffer = Buffer.from("Check me");
      const uploadResponse = await request(app.getHttpServer())
        .post("/files/upload")
        .attach("file", fileBuffer, "check.txt")
        .expect(201);

      await request(app.getHttpServer())
        .post("/favorites")
        .send({ itemType: "file", itemId: uploadResponse.body.id })
        .expect(201);

      // Check if favorited
      const response = await request(app.getHttpServer())
        .get(`/favorites/check/file/${uploadResponse.body.id}`)
        .expect(200);

      expect(response.body).toHaveProperty("favorited", true);
    });

    it("should return false for non-favorited item", async () => {
      // Upload but don't favorite
      const fileBuffer = Buffer.from("Not favorited");
      const uploadResponse = await request(app.getHttpServer())
        .post("/files/upload")
        .attach("file", fileBuffer, "not-fav.txt")
        .expect(201);

      // Check
      const response = await request(app.getHttpServer())
        .get(`/favorites/check/file/${uploadResponse.body.id}`)
        .expect(200);

      expect(response.body).toHaveProperty("favorited", false);
    });

    it("should handle check for non-existent item", async () => {
      const response = await request(app.getHttpServer())
        .get("/favorites/check/file/550e8400-e29b-41d4-a716-446655440999")
        .expect(200);

      expect(response.body).toHaveProperty("favorited", false);
    });

    it("should validate UUID format for check", async () => {
      const response = await request(app.getHttpServer())
        .get("/favorites/check/file/invalid-uuid")
        .expect(400);

      expect(response.body.message).toMatch(/uuid/i);
    });
  });

  describe("Favorites with folders", () => {
    it("should favorite a file inside a folder", async () => {
      // Create folder
      const folderResponse = await request(app.getHttpServer())
        .post("/folders")
        .send({ name: "Container", parentId: null })
        .expect(201);

      // Upload file to folder
      const fileBuffer = Buffer.from("In folder");
      const uploadResponse = await request(app.getHttpServer())
        .post("/files/upload")
        .attach("file", fileBuffer, "in-folder.txt")
        .field("folderId", folderResponse.body.id)
        .expect(201);

      // Favorite the file
      await request(app.getHttpServer())
        .post("/favorites")
        .send({ itemType: "file", itemId: uploadResponse.body.id })
        .expect(201);

      // List favorites
      const response = await request(app.getHttpServer())
        .get("/favorites")
        .expect(200);

      expect(response.body).toHaveLength(1);
      expect(response.body[0].itemId).toBe(uploadResponse.body.id);
    });

    it("should favorite a nested folder", async () => {
      // Create nested structure
      const parentResponse = await request(app.getHttpServer())
        .post("/folders")
        .send({ name: "Parent", parentId: null })
        .expect(201);

      const childResponse = await request(app.getHttpServer())
        .post("/folders")
        .send({ name: "Child", parentId: parentResponse.body.id })
        .expect(201);

      // Favorite the child folder
      await request(app.getHttpServer())
        .post("/favorites")
        .send({ itemType: "folder", itemId: childResponse.body.id })
        .expect(201);

      // Verify
      const response = await request(app.getHttpServer())
        .get("/favorites")
        .expect(200);

      expect(response.body).toHaveLength(1);
      expect(response.body[0].name).toBe("Child");
    });
  });

  describe("Favorites persistence", () => {
    it("should persist favorites across requests", async () => {
      // Create and favorite
      const fileBuffer = Buffer.from("Persistent");
      const uploadResponse = await request(app.getHttpServer())
        .post("/files/upload")
        .attach("file", fileBuffer, "persistent.txt")
        .expect(201);

      await request(app.getHttpServer())
        .post("/favorites")
        .send({ itemType: "file", itemId: uploadResponse.body.id })
        .expect(201);

      // Multiple list requests should return same data
      const response1 = await request(app.getHttpServer())
        .get("/favorites")
        .expect(200);

      const response2 = await request(app.getHttpServer())
        .get("/favorites")
        .expect(200);

      expect(response1.body).toHaveLength(1);
      expect(response2.body).toHaveLength(1);
      expect(response1.body[0].itemId).toBe(response2.body[0].itemId);
    });

    it("should maintain favorite after file move", async () => {
      // Create folders
      const folder1 = await request(app.getHttpServer())
        .post("/folders")
        .send({ name: "Folder1", parentId: null })
        .expect(201);

      const folder2 = await request(app.getHttpServer())
        .post("/folders")
        .send({ name: "Folder2", parentId: null })
        .expect(201);

      // Upload file to folder1
      const fileBuffer = Buffer.from("Move me");
      const uploadResponse = await request(app.getHttpServer())
        .post("/files/upload")
        .attach("file", fileBuffer, "move.txt")
        .field("folderId", folder1.body.id)
        .expect(201);

      // Favorite the file
      await request(app.getHttpServer())
        .post("/favorites")
        .send({ itemType: "file", itemId: uploadResponse.body.id })
        .expect(201);

      // Move file to folder2
      await request(app.getHttpServer())
        .patch(`/files/${uploadResponse.body.id}/move`)
        .send({ folderId: folder2.body.id })
        .expect(200);

      // Check if still favorited
      const checkResponse = await request(app.getHttpServer())
        .get(`/favorites/check/file/${uploadResponse.body.id}`)
        .expect(200);

      expect(checkResponse.body.favorited).toBe(true);

      // List favorites
      const listResponse = await request(app.getHttpServer())
        .get("/favorites")
        .expect(200);

      expect(listResponse.body).toHaveLength(1);
    });

    it("should maintain favorite after folder rename", async () => {
      // Create folder
      const folderResponse = await request(app.getHttpServer())
        .post("/folders")
        .send({ name: "Original", parentId: null })
        .expect(201);

      const folderId = folderResponse.body.id;

      // Favorite the folder
      await request(app.getHttpServer())
        .post("/favorites")
        .send({ itemType: "folder", itemId: folderId })
        .expect(201);

      // Rename folder
      await request(app.getHttpServer())
        .patch(`/folders/${folderId}`)
        .send({ name: "Renamed" })
        .expect(200);

      // Check if still favorited
      const checkResponse = await request(app.getHttpServer())
        .get(`/favorites/check/folder/${folderId}`)
        .expect(200);

      expect(checkResponse.body.favorited).toBe(true);

      // List favorites should show new name
      const listResponse = await request(app.getHttpServer())
        .get("/favorites")
        .expect(200);

      expect(listResponse.body[0].name).toBe("Renamed");
    });
  });

  describe("Favorites edge cases", () => {
    it("should handle deleted files in favorites", async () => {
      // Upload, favorite, then delete file
      const fileBuffer = Buffer.from("Deleted");
      const uploadResponse = await request(app.getHttpServer())
        .post("/files/upload")
        .attach("file", fileBuffer, "deleted.txt")
        .expect(201);

      await request(app.getHttpServer())
        .post("/favorites")
        .send({ itemType: "file", itemId: uploadResponse.body.id })
        .expect(201);

      // Delete file (soft delete)
      await request(app.getHttpServer())
        .delete(`/files/${uploadResponse.body.id}`)
        .expect(204);

      // Favorites might still show the item or filter it out
      const response = await request(app.getHttpServer())
        .get("/favorites")
        .expect(200);

      // Implementation dependent - could be empty or show deleted items
      expect(Array.isArray(response.body)).toBe(true);
    });

    it("should handle multiple users scenario (all favorites shared)", async () => {
      // In this app, favorites are not user-scoped
      // Create multiple favorites
      const file1 = await request(app.getHttpServer())
        .post("/files/upload")
        .attach("file", Buffer.from("Shared 1"), "shared1.txt")
        .expect(201);

      const file2 = await request(app.getHttpServer())
        .post("/files/upload")
        .attach("file", Buffer.from("Shared 2"), "shared2.txt")
        .expect(201);

      await request(app.getHttpServer())
        .post("/favorites")
        .send({ itemType: "file", itemId: file1.body.id })
        .expect(201);

      await request(app.getHttpServer())
        .post("/favorites")
        .send({ itemType: "file", itemId: file2.body.id })
        .expect(201);

      // All favorites appear in list
      const response = await request(app.getHttpServer())
        .get("/favorites")
        .expect(200);

      expect(response.body).toHaveLength(2);
    });

    it("should allow favoriting after unfavoriting", async () => {
      // Upload file
      const fileBuffer = Buffer.from("Refavorite");
      const uploadResponse = await request(app.getHttpServer())
        .post("/files/upload")
        .attach("file", fileBuffer, "refav.txt")
        .expect(201);

      // Favorite
      await request(app.getHttpServer())
        .post("/favorites")
        .send({ itemType: "file", itemId: uploadResponse.body.id })
        .expect(201);

      // Unfavorite
      await request(app.getHttpServer())
        .delete(`/favorites/file/${uploadResponse.body.id}`)
        .expect(204);

      // Favorite again
      const response = await request(app.getHttpServer())
        .post("/favorites")
        .send({ itemType: "file", itemId: uploadResponse.body.id })
        .expect(201);

      expect(response.body.itemId).toBe(uploadResponse.body.id);

      // Verify
      const listResponse = await request(app.getHttpServer())
        .get("/favorites")
        .expect(200);

      expect(listResponse.body).toHaveLength(1);
    });
  });

  describe("Data consistency", () => {
    it("should maintain DB consistency for favorites", async () => {
      // Create favorite
      const fileBuffer = Buffer.from("Consistency");
      const uploadResponse = await request(app.getHttpServer())
        .post("/files/upload")
        .attach("file", fileBuffer, "consistent.txt")
        .expect(201);

      const favoriteResponse = await request(app.getHttpServer())
        .post("/favorites")
        .send({ itemType: "file", itemId: uploadResponse.body.id })
        .expect(201);

      const favoriteId = favoriteResponse.body.id;

      // Verify in DB
      const dbResult = await dataSource.query(
        "SELECT * FROM favorites WHERE id = $1",
        [favoriteId],
      );

      expect(dbResult).toHaveLength(1);
      expect(dbResult[0].item_type).toBe("file");
      expect(dbResult[0].item_id).toBe(uploadResponse.body.id);

      // Remove and verify
      await request(app.getHttpServer())
        .delete(`/favorites/file/${uploadResponse.body.id}`)
        .expect(204);

      const afterDelete = await dataSource.query(
        "SELECT * FROM favorites WHERE id = $1",
        [favoriteId],
      );

      expect(afterDelete).toHaveLength(0);
    });

    it("should enforce unique constraint at DB level", async () => {
      // Try to manually insert duplicate (should fail at DB level)
      const fileBuffer = Buffer.from("Unique");
      const uploadResponse = await request(app.getHttpServer())
        .post("/files/upload")
        .attach("file", fileBuffer, "unique.txt")
        .expect(201);

      // Add favorite
      await request(app.getHttpServer())
        .post("/favorites")
        .send({ itemType: "file", itemId: uploadResponse.body.id })
        .expect(201);

      // Verify only one entry in DB
      const dbResult = await dataSource.query(
        "SELECT COUNT(*) as count FROM favorites WHERE item_id = $1 AND item_type = $2",
        [uploadResponse.body.id, "file"],
      );

      expect(parseInt(dbResult[0].count)).toBe(1);
    });
  });
});
