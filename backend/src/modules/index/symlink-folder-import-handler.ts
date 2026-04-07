import { Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository, IsNull } from "typeorm";
import { Folder } from "../folders/folder.entity";
import { SymlinkInfo } from "./probe-entry";
import { ImportItemHandler, ImportItemResult } from "./import-item-handler.interface";
import * as path from "path";

@Injectable()
export class SymlinkFolderImportHandler implements ImportItemHandler {
  private readonly logger = new Logger(SymlinkFolderImportHandler.name);

  constructor(
    @InjectRepository(Folder) private foldersRepo: Repository<Folder>,
  ) {}

  canHandle(info: SymlinkInfo): boolean {
    return info.targetIsDirectory && info.isSymlink;
  }

  async handle(
    itemPath: string,
    folderId: string | null,
    _info: SymlinkInfo,
    _existingPaths: Set<string>,
  ): Promise<ImportItemResult | null> {
    const basename = path.basename(itemPath);

    const existing = await this.foldersRepo.findOne({
      where: { name: basename, parentId: folderId ?? IsNull() },
    });
    if (existing) return null;

    const folder = this.foldersRepo.create({
      name: basename,
      parentId: folderId,
      isSymlink: true,
    });
    await this.foldersRepo.save(folder);
    this.logger.log(`Imported symlinked folder: ${basename}`);
    return { type: "folder", name: basename };
  }
}
