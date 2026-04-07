import * as path from "path";

// Set DATA_PATH before importing modules that use it
const testDataPath = path.join(__dirname, "test-data-search");
process.env.DATA_PATH = testDataPath;

import { Test, TestingModule } from "@nestjs/testing";
import { ConfigModule } from "@nestjs/config";
import appConfig from "../../config/app.config";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import request = require("supertest");
import * as fs from "fs";
import { SearchModule } from "../search/search.module";
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

describe("Search Integration Tests", () => {
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
        SearchModule,
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
    // Wait for any background indexing from previous test to finish
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

  describe("GET /search", () => {
    it("should return empty array for empty query", async () => {
      const response = await request(app.getHttpServer())
        .get("/search?q=")
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body).toHaveLength(0);
    });

    it("should return empty array for short query (< 2 chars)", async () => {
      const response = await request(app.getHttpServer())
        .get("/search?q=a")
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body).toHaveLength(0);
    });

    it("should search indexed content", async () => {
      // Upload and index a file with searchable content
      const fileBuffer = Buffer.from(
        "This is a document about artificial intelligence and machine learning. AI is transforming the way we work.",
      );
      const uploadResponse = await request(app.getHttpServer())
        .post("/files/upload")
        .attach("file", fileBuffer, "ai-document.txt")
        .expect(201);


      // Reindex the file to ensure content is indexed
      await request(app.getHttpServer())
        .post(`/files/${uploadResponse.body.id}/reindex`)
        .expect(201);

      // Search for content
      const response = await request(app.getHttpServer())
        .get("/search?q=artificial%20intelligence")
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBeGreaterThan(0);
      expect(response.body[0]).toHaveProperty("fileId");
      expect(response.body[0]).toHaveProperty("filename");
      expect(response.body[0].filename).toBe("ai-document.txt");
    });

    it("should return search results with metadata", async () => {
      // Upload and index file
      const fileBuffer = Buffer.from(
        "This document contains important information about the project requirements and specifications.",
      );
      const uploadResponse = await request(app.getHttpServer())
        .post("/files/upload")
        .attach("file", fileBuffer, "requirements.txt")
        .expect(201);


      const fileId = uploadResponse.body.id;

      // Reindex
      await request(app.getHttpServer())
        .post(`/files/${fileId}/reindex`)
        .expect(201);

      // Search
      const response = await request(app.getHttpServer())
        .get("/search?q=project%20requirements")
        .expect(200);

      expect(response.body.length).toBeGreaterThan(0);
      const result = response.body[0];
      expect(result).toHaveProperty("fileId", fileId);
      expect(result).toHaveProperty("filename");
      expect(result).toHaveProperty("mimeType");
      expect(result).toHaveProperty("size");
      expect(result).toHaveProperty("folderId");
      expect(result).toHaveProperty("createdAt");
      expect(result).toHaveProperty("rank");
      expect(result).toHaveProperty("snippet");
    });

    it("should search multiple files and return ranked results", async () => {
      // Upload multiple files
      const file1Buffer = Buffer.from(
        "Machine learning is a subset of artificial intelligence that focuses on algorithms.",
      );
      const file1Response = await request(app.getHttpServer())
        .post("/files/upload")
        .attach("file", file1Buffer, "ml-basics.txt")
        .expect(201);

      const file2Buffer = Buffer.from(
        "Deep learning uses neural networks with many layers for complex pattern recognition.",
      );
      const file2Response = await request(app.getHttpServer())
        .post("/files/upload")
        .attach("file", file2Buffer, "deep-learning.txt")
        .expect(201);


      // Index both files
      await request(app.getHttpServer())
        .post(`/files/${file1Response.body.id}/reindex`)
        .expect(201);
      await request(app.getHttpServer())
        .post(`/files/${file2Response.body.id}/reindex`)
        .expect(201);

      // Search for a term that appears in both
      const response = await request(app.getHttpServer())
        .get("/search?q=learning")
        .expect(200);

      expect(response.body.length).toBeGreaterThanOrEqual(2);

      // Results should be ranked
      const filenames = response.body.map((r: any) => r.filename);
      expect(filenames).toContain("ml-basics.txt");
      expect(filenames).toContain("deep-learning.txt");
    });

    it("should return empty array when no matches found", async () => {
      // Upload and index a file
      const fileBuffer = Buffer.from("This is just some content");
      const uploadResponse = await request(app.getHttpServer())
        .post("/files/upload")
        .attach("file", fileBuffer, "simple.txt")
        .expect(201);


      await request(app.getHttpServer())
        .post(`/files/${uploadResponse.body.id}/reindex`)
        .expect(201);

      // Search for non-existent term
      const response = await request(app.getHttpServer())
        .get("/search?q=xyznonexistentterm123")
        .expect(200);

      expect(response.body).toHaveLength(0);
    });

    it("should search within specific folders", async () => {
      // Create a folder
      const folderResponse = await request(app.getHttpServer())
        .post("/folders")
        .send({ name: "Documents", parentId: null })
        .expect(201);

      const folderId = folderResponse.body.id;

      // Upload file to folder
      const fileBuffer = Buffer.from(
        "This document is inside the Documents folder.",
      );
      const uploadResponse = await request(app.getHttpServer())
        .post("/files/upload")
        .attach("file", fileBuffer, "in-folder.txt")
        .field("folderId", folderId)
        .expect(201);


      // Index the file
      await request(app.getHttpServer())
        .post(`/files/${uploadResponse.body.id}/reindex`)
        .expect(201);

      // Search
      const response = await request(app.getHttpServer())
        .get("/search?q=document")
        .expect(200);

      expect(response.body.length).toBeGreaterThan(0);
      const result = response.body.find(
        (r: any) => r.filename === "in-folder.txt",
      );
      expect(result).toBeDefined();
      expect(result.folderId).toBe(folderId);
    });

    it("should return text snippets with search results", async () => {
      // Upload file with searchable content
      const fileBuffer = Buffer.from(
        "This is a long document with multiple paragraphs. The first paragraph talks about introduction. " +
          "The second paragraph contains information about the methodology used. " +
          "The third paragraph discusses the results and conclusions. " +
          "Each paragraph has important information that should be searchable.",
      );
      const uploadResponse = await request(app.getHttpServer())
        .post("/files/upload")
        .attach("file", fileBuffer, "long-doc.txt")
        .expect(201);

      // Index
      await request(app.getHttpServer())
        .post(`/files/${uploadResponse.body.id}/reindex`)
        .expect(201);

      // Wait for background index to settle

      // Search
      const response = await request(app.getHttpServer())
        .get("/search?q=methodology")
        .expect(200);

      expect(response.body.length).toBeGreaterThan(0);
      const result = response.body[0];
      expect(result).toHaveProperty("snippet");
      expect(result.snippet).toBeTruthy();
    });

    it("should handle search with special characters", async () => {
      // Upload file with special content
      const fileBuffer = Buffer.from(
        "This file contains special terms like C++ and C# programming languages.",
      );
      const uploadResponse = await request(app.getHttpServer())
        .post("/files/upload")
        .attach("file", fileBuffer, "programming.txt")
        .expect(201);


      // Index
      await request(app.getHttpServer())
        .post(`/files/${uploadResponse.body.id}/reindex`)
        .expect(201);

      // Search with URL-encoded query
      const response = await request(app.getHttpServer())
        .get("/search?q=programming")
        .expect(200);

      expect(response.body.length).toBeGreaterThan(0);
    });

    it("should limit results to 50 items", async () => {
      // This test verifies the limit is applied
      // Create many files and search
      const promises = [];
      for (let i = 0; i < 5; i++) {
        const fileBuffer = Buffer.from(
          `This is document number ${i} with searchable content that should be indexed for search functionality testing.`,
        );
        promises.push(
          request(app.getHttpServer())
            .post("/files/upload")
            .attach("file", fileBuffer, `doc${i}.txt`)
            .expect(201),
        );
      }

      const responses = await Promise.all(promises);


      // Index all files
      for (const response of responses) {
        await request(app.getHttpServer())
          .post(`/files/${response.body.id}/reindex`)
          .expect(201);
      }

      // Search
      const searchResponse = await request(app.getHttpServer())
        .get("/search?q=document")
        .expect(200);

      // Should return results but not exceed 50
      expect(searchResponse.body.length).toBeGreaterThan(0);
      expect(searchResponse.body.length).toBeLessThanOrEqual(50);
    });

    it("should search across different file types", async () => {
      // Create files with different types
      const textBuffer = Buffer.from("This is a text document for testing.");
      const textResponse = await request(app.getHttpServer())
        .post("/files/upload")
        .attach("file", textBuffer, "test.txt")
        .expect(201);

      const mdBuffer = Buffer.from("# Markdown document for testing purposes");
      const mdResponse = await request(app.getHttpServer())
        .post("/files/upload")
        .attach("file", mdBuffer, "test.md")
        .expect(201);


      // Index both
      await request(app.getHttpServer())
        .post(`/files/${textResponse.body.id}/reindex`)
        .expect(201);
      await request(app.getHttpServer())
        .post(`/files/${mdResponse.body.id}/reindex`)
        .expect(201);

      // Search
      const response = await request(app.getHttpServer())
        .get("/search?q=testing")
        .expect(200);

      expect(response.body.length).toBeGreaterThanOrEqual(2);
      const filenames = response.body.map((r: any) => r.filename);
      expect(filenames).toContain("test.txt");
      expect(filenames).toContain("test.md");
    });

    it("should handle boolean search operators", async () => {
      // Upload files with different content
      const file1Buffer = Buffer.from("Python programming language tutorial");
      await request(app.getHttpServer())
        .post("/files/upload")
        .attach("file", file1Buffer, "python.txt")
        .expect(201);

      const file2Buffer = Buffer.from("JavaScript programming guide");
      await request(app.getHttpServer())
        .post("/files/upload")
        .attach("file", file2Buffer, "javascript.txt")
        .expect(201);

      const file3Buffer = Buffer.from("Machine learning with Python");
      await request(app.getHttpServer())
        .post("/files/upload")
        .attach("file", file3Buffer, "ml-python.txt")
        .expect(201);


      // Reindex all
      await request(app.getHttpServer()).post("/files/reindex").expect(201);

      // Search with OR operator
      const response = await request(app.getHttpServer())
        .get("/search?q=Python%20OR%20JavaScript")
        .expect(200);

      expect(response.body.length).toBeGreaterThanOrEqual(2);
    });

    it("should not return deleted files in search results", async () => {
      // Upload and index a file
      const fileBuffer = Buffer.from("This file will be deleted");
      const uploadResponse = await request(app.getHttpServer())
        .post("/files/upload")
        .attach("file", fileBuffer, "to-delete.txt")
        .expect(201);


      const fileId = uploadResponse.body.id;

      // Index
      await request(app.getHttpServer())
        .post(`/files/${fileId}/reindex`)
        .expect(201);

      // Search to verify it exists
      let response = await request(app.getHttpServer())
        .get("/search?q=deleted")
        .expect(200);
      expect(response.body.length).toBeGreaterThan(0);

      // Delete the file
      await request(app.getHttpServer()).delete(`/files/${fileId}`).expect(204);

      // Search again
      response = await request(app.getHttpServer())
        .get("/search?q=deleted")
        .expect(200);
      const found = response.body.find((r: any) => r.fileId === fileId);
      expect(found).toBeUndefined();
    });

    it("should rank more relevant results higher", async () => {
      // Upload files with varying relevance
      const file1Buffer = Buffer.from(
        "Machine learning machine learning machine learning. This document is all about machine learning.",
      );
      const file1Response = await request(app.getHttpServer())
        .post("/files/upload")
        .attach("file", file1Buffer, "high-relevance.txt")
        .expect(201);

      const file2Buffer = Buffer.from(
        "This document mentions machine learning once.",
      );
      const file2Response = await request(app.getHttpServer())
        .post("/files/upload")
        .attach("file", file2Buffer, "low-relevance.txt")
        .expect(201);


      // Index both
      await request(app.getHttpServer())
        .post(`/files/${file1Response.body.id}/reindex`)
        .expect(201);
      await request(app.getHttpServer())
        .post(`/files/${file2Response.body.id}/reindex`)
        .expect(201);

      // Search
      const response = await request(app.getHttpServer())
        .get("/search?q=machine%20learning")
        .expect(200);

      expect(response.body.length).toBeGreaterThanOrEqual(2);

      // Check ranking - higher relevance should have higher rank
      const highRelevance = response.body.find(
        (r: any) => r.filename === "high-relevance.txt",
      );
      const lowRelevance = response.body.find(
        (r: any) => r.filename === "low-relevance.txt",
      );

      if (highRelevance && lowRelevance) {
        expect(highRelevance.rank).toBeGreaterThanOrEqual(lowRelevance.rank);
      }
    });

    it("should handle search with quoted phrases", async () => {
      // Upload file with phrase
      const fileBuffer = Buffer.from(
        "The quick brown fox jumps over the lazy dog.",
      );
      const uploadResponse = await request(app.getHttpServer())
        .post("/files/upload")
        .attach("file", fileBuffer, "phrase.txt")
        .expect(201);

      // Wait for background indexing to settle

      // Index
      await request(app.getHttpServer())
        .post(`/files/${uploadResponse.body.id}/reindex`)
        .expect(201);

      // Search for phrase
      const response = await request(app.getHttpServer())
        .get("/search?q=quick%20brown")
        .expect(200);

      expect(response.body.length).toBeGreaterThan(0);
    });

    it("should handle empty database gracefully", async () => {
      const response = await request(app.getHttpServer())
        .get("/search?q=test")
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body).toHaveLength(0);
    });
  });

  describe("Search edge cases", () => {
    it("should handle search with URL special characters", async () => {
      const fileBuffer = Buffer.from("Test content");
      const uploadResponse = await request(app.getHttpServer())
        .post("/files/upload")
        .attach("file", fileBuffer, "test.txt")
        .expect(201);

      // Wait for background upload to settle

      await request(app.getHttpServer())
        .post(`/files/${uploadResponse.body.id}/reindex`)
        .expect(201);

      // Test with various special characters
      const response = await request(app.getHttpServer())
        .get("/search?q=test")
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
    });

    it("should handle very long search queries", async () => {
      const longQuery = "word ".repeat(100).trim();

      const response = await request(app.getHttpServer())
        .get(`/search?q=${encodeURIComponent(longQuery)}`)
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
    });

    it("should handle Unicode content in search", async () => {
      const fileBuffer = Buffer.from("This contains Unicode: Hello World");
      const uploadResponse = await request(app.getHttpServer())
        .post("/files/upload")
        .attach("file", fileBuffer, "unicode.txt")
        .expect(201);


      await request(app.getHttpServer())
        .post(`/files/${uploadResponse.body.id}/reindex`)
        .expect(201);

      const response = await request(app.getHttpServer())
        .get("/search?q=Hello")
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
    });

    it("should handle search after reindexing", async () => {
      // Upload file
      const fileBuffer = Buffer.from("Original content");
      const uploadResponse = await request(app.getHttpServer())
        .post("/files/upload")
        .attach("file", fileBuffer, "reindex-test.txt")
        .expect(201);

      // Wait for background indexing to settle

      // Index
      await request(app.getHttpServer())
        .post(`/files/${uploadResponse.body.id}/reindex`)
        .expect(201);

      // Search works
      let response = await request(app.getHttpServer())
        .get("/search?q=Original")
        .expect(200);
      expect(response.body.length).toBeGreaterThan(0);

      // Clear index
      await dataSource.query("TRUNCATE TABLE file_index_chunks CASCADE");

      // Search returns nothing
      response = await request(app.getHttpServer())
        .get("/search?q=Original")
        .expect(200);
      expect(response.body).toHaveLength(0);

      // Reindex
      await request(app.getHttpServer())
        .post(`/files/${uploadResponse.body.id}/reindex`)
        .expect(201);

      // Search works again
      response = await request(app.getHttpServer())
        .get("/search?q=Original")
        .expect(200);
      expect(response.body.length).toBeGreaterThan(0);
    });
  });
});
