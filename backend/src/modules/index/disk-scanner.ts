import { Injectable, Logger } from "@nestjs/common";
import * as fs from "fs";
import * as fsp from "fs/promises";
import * as path from "path";
import { probeEntry, SymlinkInfo } from "./probe-entry";

export interface ScannedItem {
  path: string;
  info: SymlinkInfo;
}

@Injectable()
export class DiskScanner {
  private readonly logger = new Logger(DiskScanner.name);

  async scan(
    dir: string,
    visitedInodes: Set<number>,
    failedItems: string[],
  ): Promise<ScannedItem[]> {
    const files: ScannedItem[] = [];
    let entries: fs.Dirent[];
    try {
      entries = await fsp.readdir(dir, { withFileTypes: true });
    } catch {
      return files;
    }

    for (const entry of entries) {
      if (entry.name.startsWith(".") || entry.name === ".gitkeep") continue;
      const fullPath = path.join(dir, entry.name);

      let info: SymlinkInfo;
      try {
        info = await probeEntry(fullPath, entry.name);
      } catch (e: any) {
        this.logger.warn(`Failed to probe ${fullPath}: ${e.message}`);
        failedItems.push(entry.name);
        continue;
      }

      if (info.targetIsDirectory) {
        if (info.isSymlink) {
          files.push({ path: fullPath, info });
        } else {
          const lstat = await fsp.lstat(fullPath);
          const ino = lstat.ino;
          if (!visitedInodes.has(ino)) {
            visitedInodes.add(ino);
            const subFiles = await this.scan(fullPath, visitedInodes, failedItems);
            files.push(...subFiles);
          }
        }
      } else {
        files.push({ path: fullPath, info });
      }
    }
    return files;
  }
}
