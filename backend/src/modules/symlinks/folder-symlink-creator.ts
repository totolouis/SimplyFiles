import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { Folder } from "../folders/folder.entity";
import { PathService } from "../../common/path.service";
import { SymlinkCreator, SymlinkTarget, SymlinkCreateResult } from "./symlink-creator.interface";
import { ItemType } from "../../common/item-type.enum";
import * as fsp from "fs/promises";
import * as path from "path";

@Injectable()
export class FolderSymlinkCreator implements SymlinkCreator {
  private readonly logger = new Logger(FolderSymlinkCreator.name);

  constructor(
    @InjectRepository(Folder) private readonly foldersRepo: Repository<Folder>,
    private readonly pathService: PathService,
  ) {}

  async resolveTarget(targetId: string): Promise<SymlinkTarget> {
    const folder = await this.foldersRepo.findOne({ where: { id: targetId } });
    if (!folder) throw new NotFoundException("Target folder not found");
    const fsPath = await this.pathService.folderFsPath(folder.id);
    return { fsPath, name: folder.name };
  }

  async uniqueSymlinkPath(destDir: string, name: string): Promise<string> {
    let candidate = path.join(destDir, name);
    let counter = 1;
    while (true) {
      try {
        await fsp.access(candidate);
        candidate = path.join(destDir, `${name} (${counter})`);
        counter++;
      } catch {
        return candidate;
      }
    }
  }

  async createRecord(params: {
    name: string;
    destinationFolderId: string | null;
    symlinkFsPath: string;
    targetId: string;
  }): Promise<SymlinkCreateResult> {
    const newFolder = this.foldersRepo.create({
      name: params.name,
      parentId: params.destinationFolderId,
      isSymlink: true,
      symlinkTargetId: params.targetId,
    });
    await this.foldersRepo.save(newFolder);
    this.logger.log(`Created folder symlink: "${params.name}" -> target=${params.targetId}`);
    return {
      id: newFolder.id,
      type: ItemType.Folder,
      name: newFolder.name,
      isSymlink: true,
      symlinkTargetId: newFolder.symlinkTargetId,
      parentId: newFolder.parentId,
    };
  }

  async fixBroken(): Promise<number> {
    let count = 0;
    const symlinkFolders = await this.foldersRepo.find({ where: { isSymlink: true } });
    for (const folder of symlinkFolders) {
      const folderPath = await this.pathService.folderFsPath(folder.id);
      try {
        await fsp.lstat(folderPath);
        await fsp.stat(folderPath);
      } catch {
        try { await fsp.unlink(folderPath); } catch {}
        await this.foldersRepo.remove(folder);
        count++;
        this.logger.log(`Deleted broken folder symlink: ${folder.name}`);
      }
    }
    return count;
  }
}
