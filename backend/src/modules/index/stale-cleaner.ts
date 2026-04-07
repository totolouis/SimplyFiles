import { Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { File } from "../files/file.entity";
import { Folder } from "../folders/folder.entity";
import { PathService } from "../../common/path.service";
import { SyncOperationDetail } from "./sync-operation.interface";
import * as fsp from "fs/promises";

@Injectable()
export class StaleCleaner {
  private readonly logger = new Logger(StaleCleaner.name);

  constructor(
    @InjectRepository(File) private filesRepo: Repository<File>,
    @InjectRepository(Folder) private foldersRepo: Repository<Folder>,
    private pathService: PathService,
  ) {}

  async removeStaleFiles(_folderId: string | null): Promise<SyncOperationDetail> {
    const items: string[] = [];
    const dbFiles = await this.filesRepo.find();

    for (const file of dbFiles) {
      const exists = await this.fileExistsOnDisk(file.storagePath, file.isSymlink);
      if (!exists) {
        await this.filesRepo.query(
          `DELETE FROM file_index_chunks WHERE file_id = $1`,
          [file.id],
        );
        await this.filesRepo.remove(file);
        items.push(file.filename);
        this.logger.log(`Removed stale file: ${file.filename}`);
      }
    }

    return { label: "Stale files removed", items };
  }

  async removeStaleFolders(_folderId: string | null): Promise<SyncOperationDetail> {
    const items: string[] = [];
    const dbFolders = await this.foldersRepo.find();

    for (const folder of dbFolders) {
      const folderDir = await this.pathService.folderFsPath(folder.id);
      const exists = await this.fileExistsOnDisk(folderDir, folder.isSymlink);
      if (!exists) {
        await this.foldersRepo.remove(folder);
        items.push(folder.name);
        this.logger.log(`Removed stale folder: ${folder.name}`);
      }
    }

    return { label: "Stale folders removed", items };
  }

  async fixBrokenSymlinks(): Promise<SyncOperationDetail> {
    const items: string[] = [];

    // File symlinks
    const symlinkFiles = await this.filesRepo.find({
      where: { isSymlink: true },
    });
    for (const file of symlinkFiles) {
      try {
        await fsp.lstat(file.storagePath);
        await fsp.stat(file.storagePath);
      } catch {
        try { await fsp.unlink(file.storagePath); } catch {}
        await this.filesRepo.remove(file);
        items.push(`File: ${file.filename}`);
        this.logger.log(`Fixed broken file symlink: ${file.filename}`);
      }
    }

    // Folder symlinks
    const symlinkFolders = await this.foldersRepo.find({
      where: { isSymlink: true },
    });
    for (const folder of symlinkFolders) {
      const folderPath = await this.pathService.folderFsPath(folder.id);
      try {
        await fsp.lstat(folderPath);
        await fsp.stat(folderPath);
      } catch {
        try { await fsp.unlink(folderPath); } catch {}
        await this.foldersRepo.remove(folder);
        items.push(`Folder: ${folder.name}`);
        this.logger.log(`Fixed broken folder symlink: ${folder.name}`);
      }
    }

    return { label: "Broken symlinks fixed", items };
  }

  private async fileExistsOnDisk(filePath: string, isSymlink: boolean): Promise<boolean> {
    try {
      if (isSymlink) {
        await fsp.lstat(filePath);
      } else {
        await fsp.access(filePath);
      }
      return true;
    } catch {
      return false;
    }
  }
}
