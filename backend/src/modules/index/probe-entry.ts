import * as fsp from "fs/promises";
import * as mime from "mime-types";

export interface SymlinkInfo {
  isSymlink: boolean;
  isBroken: boolean;
  targetIsDirectory: boolean;
  targetSize: number;
  targetMimeType: string;
}

export async function probeEntry(
  fullPath: string,
  entryName: string,
): Promise<SymlinkInfo> {
  const lstat = await fsp.lstat(fullPath);

  if (!lstat.isSymbolicLink()) {
    return {
      isSymlink: false,
      isBroken: false,
      targetIsDirectory: lstat.isDirectory(),
      targetSize: lstat.size,
      targetMimeType: mime.lookup(entryName) || "application/octet-stream",
    };
  }

  // It's a symlink — try to follow it
  try {
    const stat = await fsp.stat(fullPath);
    return {
      isSymlink: true,
      isBroken: false,
      targetIsDirectory: stat.isDirectory(),
      targetSize: stat.size,
      targetMimeType: mime.lookup(entryName) || "application/octet-stream",
    };
  } catch (e: any) {
    if (e.code === "ENOENT" || e.code === "ELOOP") {
      return {
        isSymlink: true,
        isBroken: true,
        targetIsDirectory: false,
        targetSize: 0,
        targetMimeType: "application/octet-stream",
      };
    }
    throw e;
  }
}
