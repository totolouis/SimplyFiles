import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { Folder } from "../modules/folders/folder.entity";
import * as fs from "fs";
import * as fsp from "fs/promises";
import * as path from "path";

@Injectable()
export class PathService {
  private readonly dataPath: string;

  constructor(
    @InjectRepository(Folder)
    private foldersRepo: Repository<Folder>,
    private configService: ConfigService,
  ) {
    this.dataPath = this.configService.get<string>('app.dataPath') || './data/files';
  }

  /**
   * Resolve a folderId chain to a real filesystem path.
   * folderId=null  -> DATA_PATH
   * folderId=<id>  -> DATA_PATH/grandparent/parent/folder
   */
  async folderFsPath(folderId: string | null, withDeleted = false): Promise<string> {
    if (!folderId) return this.dataPath;

    const segments: string[] = [];
    let currentId: string | null = folderId;

    while (currentId) {
      const folder = await this.foldersRepo.findOne({
        where: { id: currentId },
        withDeleted,
      });
      if (!folder) break;
      segments.unshift(this.sanitise(folder.name));
      currentId = folder.parentId;
    }

    return path.join(this.dataPath, ...segments);
  }

  /** Full path where a specific file should live. */
  async fileFsPath(filename: string, folderId: string | null): Promise<string> {
    const dir = await this.folderFsPath(folderId);
    return path.join(dir, this.sanitise(filename));
  }

  /** Make sure a directory exists. */
  ensureDir(dirPath: string): void {
    fs.mkdirSync(dirPath, { recursive: true });
  }

  /** Make sure a directory exists (async). */
  async ensureDirAsync(dirPath: string): Promise<void> {
    await fsp.mkdir(dirPath, { recursive: true });
  }

  /**
   * Strip characters that are unsafe in filesystem paths.
   * Keeps unicode letters/digits, spaces, dots, dashes, underscores, parentheses.
   * Normalizes to NFC to handle composed characters.
   */
  private sanitise(name: string): string {
    // Normalize to NFC to ensure proper Unicode handling of accented characters
    const normalized = name.normalize('NFC');
    return (
      normalized
        .replace(/[/\\:*?"<>|]/g, "_") // forbidden on Windows + Unix path separators
        .replace(/\.{2,}/g, "_") // no ".." traversal
        .trim() || "_"
    );
  }
}
