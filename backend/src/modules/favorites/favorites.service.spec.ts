import { Test, TestingModule } from "@nestjs/testing";
import { getRepositoryToken } from "@nestjs/typeorm";
import { FavoritesService } from "./favorites.service";
import { Favorite } from "./favorite.entity";
import { FileFavoriteResolver } from "./file-favorite-resolver";
import { FolderFavoriteResolver } from "./folder-favorite-resolver";
import { ItemType } from "../../common/item-type.enum";

describe("FavoritesService", () => {
  let service: FavoritesService;
  let favoritesRepo: any;
  let fileResolver: any;
  let folderResolver: any;

  beforeEach(async () => {
    favoritesRepo = {
      find: jest.fn(),
      findOne: jest.fn(),
      create: jest.fn((data) => ({ ...data })),
      save: jest.fn((entity) => Promise.resolve({ id: "fav-1", ...entity })),
      delete: jest.fn(),
      count: jest.fn(),
    };

    fileResolver = {
      itemType: ItemType.File,
      resolveMany: jest.fn().mockResolvedValue(new Map()),
    };

    folderResolver = {
      itemType: ItemType.Folder,
      resolveMany: jest.fn().mockResolvedValue(new Map()),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FavoritesService,
        { provide: getRepositoryToken(Favorite), useValue: favoritesRepo },
        { provide: FileFavoriteResolver, useValue: fileResolver },
        { provide: FolderFavoriteResolver, useValue: folderResolver },
      ],
    }).compile();

    service = module.get<FavoritesService>(FavoritesService);
  });

  describe("list", () => {
    it("should return empty array when no favorites", async () => {
      favoritesRepo.find.mockResolvedValue([]);

      const result = await service.list();

      expect(result).toEqual([]);
    });

    it("should return file favorites with metadata", async () => {
      const createdAt = new Date("2025-01-01");
      favoritesRepo.find.mockResolvedValue([
        { id: "fav-1", itemType: ItemType.File, itemId: "file-1", createdAt },
      ]);
      fileResolver.resolveMany.mockResolvedValue(
        new Map([["file-1", { name: "doc.pdf", mimeType: "application/pdf", size: 1024 }]]),
      );

      const result = await service.list();

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        id: "fav-1",
        itemType: ItemType.File,
        itemId: "file-1",
        name: "doc.pdf",
        createdAt,
        mimeType: "application/pdf",
        size: 1024,
      });
    });

    it("should return folder favorites with metadata", async () => {
      const createdAt = new Date("2025-01-01");
      favoritesRepo.find.mockResolvedValue([
        { id: "fav-2", itemType: ItemType.Folder, itemId: "folder-1", createdAt },
      ]);
      folderResolver.resolveMany.mockResolvedValue(
        new Map([["folder-1", { name: "Documents" }]]),
      );

      const result = await service.list();

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        id: "fav-2",
        itemType: ItemType.Folder,
        itemId: "folder-1",
        name: "Documents",
        createdAt,
      });
    });

    it("should skip file favorites where file no longer exists", async () => {
      favoritesRepo.find.mockResolvedValue([
        {
          id: "fav-1",
          itemType: ItemType.File,
          itemId: "deleted-file",
          createdAt: new Date(),
        },
      ]);
      fileResolver.resolveMany.mockResolvedValue(new Map());

      const result = await service.list();

      expect(result).toEqual([]);
    });

    it("should skip folder favorites where folder no longer exists", async () => {
      favoritesRepo.find.mockResolvedValue([
        {
          id: "fav-2",
          itemType: ItemType.Folder,
          itemId: "deleted-folder",
          createdAt: new Date(),
        },
      ]);
      folderResolver.resolveMany.mockResolvedValue(new Map());

      const result = await service.list();

      expect(result).toEqual([]);
    });

    it("should handle mixed file and folder favorites", async () => {
      const createdAt = new Date("2025-01-01");
      favoritesRepo.find.mockResolvedValue([
        { id: "fav-1", itemType: ItemType.File, itemId: "file-1", createdAt },
        { id: "fav-2", itemType: ItemType.Folder, itemId: "folder-1", createdAt },
      ]);
      fileResolver.resolveMany.mockResolvedValue(
        new Map([["file-1", { name: "test.txt", mimeType: "text/plain", size: 10 }]]),
      );
      folderResolver.resolveMany.mockResolvedValue(
        new Map([["folder-1", { name: "MyFolder" }]]),
      );

      const result = await service.list();

      expect(result).toHaveLength(2);
      expect(result[0].itemType).toBe(ItemType.File);
      expect(result[1].itemType).toBe(ItemType.Folder);
    });
  });

  describe("add", () => {
    it("should return existing favorite if already exists", async () => {
      const existing = {
        id: "fav-1",
        itemType: ItemType.File,
        itemId: "file-1",
        createdAt: new Date(),
      };
      favoritesRepo.findOne.mockResolvedValue(existing);

      const result = await service.add(ItemType.File, "file-1");

      expect(result).toBe(existing);
      expect(favoritesRepo.save).not.toHaveBeenCalled();
    });

    it("should create new favorite if not existing", async () => {
      favoritesRepo.findOne.mockResolvedValue(null);

      const result = await service.add(ItemType.File, "file-1");

      expect(favoritesRepo.create).toHaveBeenCalledWith({
        itemType: ItemType.File,
        itemId: "file-1",
      });
      expect(favoritesRepo.save).toHaveBeenCalled();
      expect(result).toHaveProperty("id");
    });

    it("should create folder favorite", async () => {
      favoritesRepo.findOne.mockResolvedValue(null);

      await service.add(ItemType.Folder, "folder-1");

      expect(favoritesRepo.create).toHaveBeenCalledWith({
        itemType: ItemType.Folder,
        itemId: "folder-1",
      });
    });
  });

  describe("remove", () => {
    it("should delete the favorite by itemType and itemId", async () => {
      favoritesRepo.delete.mockResolvedValue({ affected: 1 });

      await service.remove(ItemType.File, "file-1");

      expect(favoritesRepo.delete).toHaveBeenCalledWith({
        itemType: ItemType.File,
        itemId: "file-1",
      });
    });

    it("should handle removing non-existent favorite", async () => {
      favoritesRepo.delete.mockResolvedValue({ affected: 0 });

      await service.remove(ItemType.Folder, "nonexistent");

      expect(favoritesRepo.delete).toHaveBeenCalledWith({
        itemType: ItemType.Folder,
        itemId: "nonexistent",
      });
    });
  });

  describe("check", () => {
    it("should return favorited true when count > 0", async () => {
      favoritesRepo.count.mockResolvedValue(1);

      const result = await service.check(ItemType.File, "file-1");

      expect(result).toEqual({ favorited: true });
      expect(favoritesRepo.count).toHaveBeenCalledWith({
        where: { itemType: ItemType.File, itemId: "file-1" },
      });
    });

    it("should return favorited false when count is 0", async () => {
      favoritesRepo.count.mockResolvedValue(0);

      const result = await service.check(ItemType.Folder, "folder-1");

      expect(result).toEqual({ favorited: false });
    });
  });
});
