import { Test, TestingModule } from "@nestjs/testing";
import { TrashController } from "./trash.controller";
import { TrashService } from "./trash.service";
import { ItemType } from "../../common/item-type.enum";

describe("TrashController", () => {
  let controller: TrashController;
  let trashService: any;

  beforeEach(async () => {
    trashService = {
      list: jest.fn(),
      restoreFile: jest.fn(),
      restoreFolder: jest.fn(),
      permanentDeleteFile: jest.fn(),
      permanentDeleteFolder: jest.fn(),
      emptyTrash: jest.fn(),
      purgeExpired: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [TrashController],
      providers: [{ provide: TrashService, useValue: trashService }],
    }).compile();

    controller = module.get<TrashController>(TrashController);
  });

  describe("list", () => {
    it("should return trash items from service", async () => {
      const items = [
        { id: "1", name: "test.txt", type: ItemType.File, deletedAt: new Date(), expiresAt: new Date() },
      ];
      trashService.list.mockResolvedValue(items);

      const result = await controller.list();

      expect(result).toBe(items);
      expect(trashService.list).toHaveBeenCalled();
    });
  });

  describe("restoreFile", () => {
    it("should delegate to trashService.restoreFile", async () => {
      trashService.restoreFile.mockResolvedValue(undefined);

      await controller.restoreFile("file-id");

      expect(trashService.restoreFile).toHaveBeenCalledWith("file-id");
    });
  });

  describe("restoreFolder", () => {
    it("should delegate to trashService.restoreFolder", async () => {
      trashService.restoreFolder.mockResolvedValue(undefined);

      await controller.restoreFolder("folder-id");

      expect(trashService.restoreFolder).toHaveBeenCalledWith("folder-id");
    });
  });

  describe("permanentDeleteFile", () => {
    it("should delegate to trashService.permanentDeleteFile", async () => {
      trashService.permanentDeleteFile.mockResolvedValue(undefined);

      await controller.permanentDeleteFile("file-id");

      expect(trashService.permanentDeleteFile).toHaveBeenCalledWith("file-id");
    });
  });

  describe("permanentDeleteFolder", () => {
    it("should delegate to trashService.permanentDeleteFolder", async () => {
      trashService.permanentDeleteFolder.mockResolvedValue(undefined);

      await controller.permanentDeleteFolder("folder-id");

      expect(trashService.permanentDeleteFolder).toHaveBeenCalledWith("folder-id");
    });
  });

  describe("emptyTrash", () => {
    it("should delegate to trashService.emptyTrash", async () => {
      const result = { deletedFiles: 3, deletedFolders: 1 };
      trashService.emptyTrash.mockResolvedValue(result);

      const response = await controller.emptyTrash();

      expect(response).toEqual(result);
      expect(trashService.emptyTrash).toHaveBeenCalled();
    });
  });

  describe("purgeExpired", () => {
    it("should delegate to trashService.purgeExpired", async () => {
      const result = { purgedFiles: 2, purgedFolders: 0 };
      trashService.purgeExpired.mockResolvedValue(result);

      const response = await controller.purgeExpired();

      expect(response).toEqual(result);
      expect(trashService.purgeExpired).toHaveBeenCalled();
    });
  });
});
