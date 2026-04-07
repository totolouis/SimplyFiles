import { Inject, Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { File } from "../files/file.entity";
import { PathService } from "../../common/path.service";
import { DiskScanner } from "./disk-scanner";
import { IMPORT_ITEM_HANDLERS, ImportItemHandler } from "./import-item-handler.interface";
import { SyncOperationDetail } from "./sync-operation.interface";
import * as fsp from "fs/promises";
import * as path from "path";

@Injectable()
export class DiskImporter {
  private readonly logger = new Logger(DiskImporter.name);

  constructor(
    @InjectRepository(File) private filesRepo: Repository<File>,
    private diskScanner: DiskScanner,
    private pathService: PathService,
    @Inject(IMPORT_ITEM_HANDLERS) private handlers: ImportItemHandler[],
  ) {}

  async importFromDisk(folderId: string | null): Promise<SyncOperationDetail[]> {
    const importedFiles: string[] = [];
    const importedFolders: string[] = [];
    const failedItems: string[] = [];

    const targetDir = await this.pathService.folderFsPath(folderId);
    try {
      await fsp.access(targetDir);
    } catch {
      return [
        { label: "Files imported", items: [] },
        { label: "Folders imported", items: [] },
      ];
    }

    const existingPaths = await this.loadExistingPaths();
    const visitedInodes = new Set<number>();
    const foundItems = await this.diskScanner.scan(targetDir, visitedInodes, failedItems);

    for (const { path: itemPath, info } of foundItems) {
      const handler = this.handlers.find((h) => h.canHandle(info));
      if (!handler) continue;

      try {
        const result = await handler.handle(itemPath, folderId, info, existingPaths);
        if (result) {
          if (result.type === "folder") importedFolders.push(result.name);
          else importedFiles.push(result.name);
        }
      } catch (e: any) {
        failedItems.push(path.basename(itemPath));
        this.logger.error(`Failed to import ${path.basename(itemPath)}: ${e.message}`);
      }
    }

    const ops: SyncOperationDetail[] = [
      { label: "Files imported", items: importedFiles },
      { label: "Folders imported", items: importedFolders },
    ];
    if (failedItems.length > 0) {
      ops.push({ label: "Failed to import", items: failedItems });
    }
    return ops;
  }

  private async loadExistingPaths(): Promise<Set<string>> {
    const existingFiles = await this.filesRepo
      .createQueryBuilder("file")
      .withDeleted()
      .select("file.storagePath")
      .getMany();
    return new Set(existingFiles.map((f) => f.storagePath));
  }
}
