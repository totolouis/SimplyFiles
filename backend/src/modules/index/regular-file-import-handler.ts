import { Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { File } from "../files/file.entity";
import { FileIndexService } from "../search/file-index.service";
import { SymlinkInfo } from "./probe-entry";
import { ImportItemHandler, ImportItemResult } from "./import-item-handler.interface";
import * as fsp from "fs/promises";
import * as path from "path";
import * as mime from "mime-types";
import { v4 as uuidv4 } from "uuid";

@Injectable()
export class RegularFileImportHandler implements ImportItemHandler {
  private readonly logger = new Logger(RegularFileImportHandler.name);

  constructor(
    @InjectRepository(File) private filesRepo: Repository<File>,
    private fileIndexService: FileIndexService,
  ) {}

  canHandle(_info: SymlinkInfo): boolean {
    return true; // fallback handler — handles all remaining items
  }

  async handle(
    itemPath: string,
    folderId: string | null,
    info: SymlinkInfo,
    existingPaths: Set<string>,
  ): Promise<ImportItemResult | null> {
    if (existingPaths.has(itemPath)) return null;

    const basename = path.basename(itemPath);
    const buffer = await fsp.readFile(itemPath);
    const mimeType = mime.lookup(itemPath) || "application/octet-stream";

    const file = this.filesRepo.create({
      id: uuidv4(),
      filename: basename,
      folderId,
      mimeType,
      size: info.targetSize,
      storagePath: itemPath,
      isSymlink: info.isSymlink,
    });

    await this.filesRepo.save(file);
    await this.fileIndexService.indexFile(file, buffer);

    this.logger.log(`Imported: ${basename}${info.isSymlink ? " (symlink)" : ""}`);
    return { type: "file", name: basename };
  }
}
