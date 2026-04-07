import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { File } from "../files/file.entity";
import { SymlinkCreator, SymlinkTarget, SymlinkCreateResult } from "./symlink-creator.interface";
import { ItemType } from "../../common/item-type.enum";
import * as fsp from "fs/promises";
import * as path from "path";
import { v4 as uuidv4 } from "uuid";

@Injectable()
export class FileSymlinkCreator implements SymlinkCreator {
  private readonly logger = new Logger(FileSymlinkCreator.name);

  constructor(
    @InjectRepository(File) private readonly filesRepo: Repository<File>,
  ) {}

  async resolveTarget(targetId: string): Promise<SymlinkTarget> {
    const file = await this.filesRepo.findOne({ where: { id: targetId } });
    if (!file) throw new NotFoundException("Target file not found");
    return { fsPath: file.storagePath, name: file.filename };
  }

  async uniqueSymlinkPath(destDir: string, name: string): Promise<string> {
    const ext = path.extname(name);
    const base = path.basename(name, ext);
    let candidate = path.join(destDir, name);
    let counter = 1;
    while (true) {
      try {
        await fsp.access(candidate);
        candidate = path.join(destDir, `${base} (${counter})${ext}`);
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
    const target = await this.filesRepo.findOne({ where: { id: params.targetId } });
    const newFile = this.filesRepo.create({
      id: uuidv4(),
      filename: params.name,
      folderId: params.destinationFolderId,
      mimeType: target!.mimeType,
      size: target!.size,
      storagePath: params.symlinkFsPath,
      isSymlink: true,
    });
    await this.filesRepo.save(newFile);
    this.logger.log(`Created file symlink: "${params.name}"`);
    return {
      id: newFile.id,
      type: ItemType.File,
      name: newFile.filename,
      isSymlink: true,
      folderId: newFile.folderId,
      storagePath: newFile.storagePath,
    };
  }

  async fixBroken(): Promise<number> {
    let count = 0;
    const symlinkFiles = await this.filesRepo.find({ where: { isSymlink: true } });
    for (const file of symlinkFiles) {
      try {
        await fsp.lstat(file.storagePath);
        await fsp.stat(file.storagePath);
      } catch {
        try { await fsp.unlink(file.storagePath); } catch {}
        await this.filesRepo.remove(file);
        count++;
        this.logger.log(`Deleted broken file symlink: ${file.filename}`);
      }
    }
    return count;
  }
}
