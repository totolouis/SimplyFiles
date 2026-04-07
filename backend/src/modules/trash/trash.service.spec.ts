import { Test, TestingModule } from "@nestjs/testing";
import { TrashService } from "./trash.service";
import { FileTrashHandler } from "./file-trash-handler";
import { FolderTrashHandler } from "./folder-trash-handler";
import { ItemType } from "../../common/item-type.enum";

describe("TrashService", () => {
  let service: TrashService;
  let fileHandler: any;
  let folderHandler: any;

  beforeEach(async () => {
    fileHandler = {
      listDeleted: jest.fn().mockResolvedValue([]),
      restore: jest.fn().mockResolvedValue(undefined),
      permanentDelete: jest.fn().mockResolvedValue(undefined),
      deleteAll: jest.fn().mockResolvedValue(0),
      purgeExpired: jest.fn().mockResolvedValue(0),
    };

    folderHandler = {
      listDeleted: jest.fn().mockResolvedValue([]),
      restore: jest.fn().mockResolvedValue(undefined),
      permanentDelete: jest.fn().mockResolvedValue(undefined),
      deleteAll: jest.fn().mockResolvedValue(0),
      purgeExpired: jest.fn().mockResolvedValue(0),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TrashService,
        { provide: FileTrashHandler, useValue: fileHandler },
        { provide: FolderTrashHandler, useValue: folderHandler },
      ],
    }).compile();

    service = module.get<TrashService>(TrashService);
  });

  describe("list", () => {
    it("should return empty array when no items in trash", async () => {
      const result = await service.list();
      expect(result).toEqual([]);
    });

    it("should return top-level deleted files and folders", async () => {
      const deletedAt = new Date("2025-01-01");
      fileHandler.listDeleted.mockResolvedValue([
        {
          id: "file-1",
          name: "test.txt",
          type: ItemType.File,
          deletedAt,
          size: 100,
          mimeType: "text/plain",
          parentRef: null,
        },
      ]);
      folderHandler.listDeleted.mockResolvedValue([
        {
          id: "folder-1",
          name: "TestFolder",
          type: ItemType.Folder,
          deletedAt,
          parentRef: null,
        },
      ]);

      const result = await service.list();

      expect(result).toHaveLength(2);
      expect(result.find((i) => i.type === ItemType.File)).toMatchObject({
        id: "file-1",
        name: "test.txt",
        type: ItemType.File,
        size: 100,
        mimeType: "text/plain",
      });
      expect(result.find((i) => i.type === ItemType.Folder)).toMatchObject({
        id: "folder-1",
        name: "TestFolder",
        type: ItemType.Folder,
      });
    });

    it("should filter out files inside deleted folders", async () => {
      const deletedAt = new Date("2025-01-01");
      fileHandler.listDeleted.mockResolvedValue([
        {
          id: "file-1",
          name: "nested.txt",
          type: ItemType.File,
          deletedAt,
          size: 50,
          mimeType: "text/plain",
          parentRef: "folder-1",
        },
        {
          id: "file-2",
          name: "root.txt",
          type: ItemType.File,
          deletedAt,
          size: 50,
          mimeType: "text/plain",
          parentRef: null,
        },
      ]);
      folderHandler.listDeleted.mockResolvedValue([
        {
          id: "folder-1",
          name: "Deleted",
          type: ItemType.Folder,
          deletedAt,
          parentRef: null,
        },
      ]);

      const result = await service.list();

      const fileItems = result.filter((i) => i.type === ItemType.File);
      expect(fileItems).toHaveLength(1);
      expect(fileItems[0].id).toBe("file-2");
    });

    it("should filter out child folders inside deleted parent folders", async () => {
      const deletedAt = new Date("2025-01-01");
      folderHandler.listDeleted.mockResolvedValue([
        { id: "parent", name: "Parent", type: ItemType.Folder, deletedAt, parentRef: null },
        { id: "child", name: "Child", type: ItemType.Folder, deletedAt, parentRef: "parent" },
      ]);

      const result = await service.list();

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe("parent");
    });

    it("should sort items by deletedAt descending", async () => {
      const older = new Date("2025-01-01");
      const newer = new Date("2025-06-01");
      fileHandler.listDeleted.mockResolvedValue([
        {
          id: "old-file",
          name: "old.txt",
          type: ItemType.File,
          deletedAt: older,
          size: 10,
          mimeType: "text/plain",
          parentRef: null,
        },
      ]);
      folderHandler.listDeleted.mockResolvedValue([
        { id: "new-folder", name: "New", type: ItemType.Folder, deletedAt: newer, parentRef: null },
      ]);

      const result = await service.list();

      expect(result[0].id).toBe("new-folder");
      expect(result[1].id).toBe("old-file");
    });

    it("should calculate expiresAt as 30 days after deletedAt", async () => {
      const deletedAt = new Date("2025-01-01");
      fileHandler.listDeleted.mockResolvedValue([
        {
          id: "file-1",
          name: "test.txt",
          type: ItemType.File,
          deletedAt,
          size: 10,
          mimeType: "text/plain",
          parentRef: null,
        },
      ]);

      const result = await service.list();

      const diffMs =
        result[0].expiresAt.getTime() - result[0].deletedAt.getTime();
      const diffDays = diffMs / (1000 * 60 * 60 * 24);
      expect(diffDays).toBeCloseTo(30, 0);
    });
  });

  describe("restoreFile", () => {
    it("should delegate to fileHandler.restore", async () => {
      await service.restoreFile("file-1");
      expect(fileHandler.restore).toHaveBeenCalledWith("file-1");
    });
  });

  describe("restoreFolder", () => {
    it("should delegate to folderHandler.restore", async () => {
      await service.restoreFolder("folder-1");
      expect(folderHandler.restore).toHaveBeenCalledWith("folder-1");
    });
  });

  describe("permanentDeleteFile", () => {
    it("should delegate to fileHandler.permanentDelete", async () => {
      await service.permanentDeleteFile("file-1");
      expect(fileHandler.permanentDelete).toHaveBeenCalledWith("file-1");
    });
  });

  describe("permanentDeleteFolder", () => {
    it("should delegate to folderHandler.permanentDelete", async () => {
      await service.permanentDeleteFolder("folder-1");
      expect(folderHandler.permanentDelete).toHaveBeenCalledWith("folder-1");
    });
  });

  describe("emptyTrash", () => {
    it("should delete all trashed files and folders", async () => {
      fileHandler.deleteAll.mockResolvedValue(2);
      folderHandler.deleteAll.mockResolvedValue(2);

      const result = await service.emptyTrash();

      expect(result).toEqual({ deletedFiles: 2, deletedFolders: 2 });
      expect(fileHandler.deleteAll).toHaveBeenCalled();
      expect(folderHandler.deleteAll).toHaveBeenCalled();
    });

    it("should return zeros when trash is already empty", async () => {
      const result = await service.emptyTrash();
      expect(result).toEqual({ deletedFiles: 0, deletedFolders: 0 });
    });
  });

  describe("purgeExpired", () => {
    it("should purge expired files and folders", async () => {
      fileHandler.purgeExpired.mockResolvedValue(1);
      folderHandler.purgeExpired.mockResolvedValue(1);

      const result = await service.purgeExpired();

      expect(result).toEqual({ purgedFiles: 1, purgedFolders: 1 });
      expect(fileHandler.purgeExpired).toHaveBeenCalled();
      expect(folderHandler.purgeExpired).toHaveBeenCalled();
    });

    it("should return zeros when nothing is expired", async () => {
      const result = await service.purgeExpired();
      expect(result).toEqual({ purgedFiles: 0, purgedFolders: 0 });
    });
  });
});
