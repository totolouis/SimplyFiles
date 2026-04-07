import { Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { File } from "../files/file.entity";
import { SymlinkInfo } from "./probe-entry";
import { ImportItemHandler, ImportItemResult } from "./import-item-handler.interface";
import * as path from "path";
import { v4 as uuidv4 } from "uuid";

@Injectable()
export class BrokenSymlinkImportHandler implements ImportItemHandler {
  private readonly logger = new Logger(BrokenSymlinkImportHandler.name);

  constructor(
    @InjectRepository(File) private filesRepo: Repository<File>,
  ) {}

  canHandle(info: SymlinkInfo): boolean {
    return info.isBroken;
  }

  async handle(
    itemPath: string,
    folderId: string | null,
    _info: SymlinkInfo,
    existingPaths: Set<string>,
  ): Promise<ImportItemResult | null> {
    if (existingPaths.has(itemPath)) return null;

    const basename = path.basename(itemPath);
    const file = this.filesRepo.create({
      id: uuidv4(),
      filename: basename,
      folderId,
      mimeType: "application/octet-stream",
      size: 0,
      storagePath: itemPath,
      isSymlink: true,
    });
    await this.filesRepo.save(file);
    this.logger.warn(`Imported broken symlink (not indexed): ${basename}`);
    return { type: "file", name: `${basename} (broken symlink)` };
  }
}
