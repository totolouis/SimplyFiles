export interface SymlinkTarget {
  fsPath: string;
  name: string;
}

export interface SymlinkCreateResult {
  id: string;
  type: string;
  name: string;
  isSymlink: boolean;
  [key: string]: any;
}

export interface SymlinkCreator {
  /** Resolve and validate the symlink target from the database. */
  resolveTarget(targetId: string): Promise<SymlinkTarget>;

  /** Generate a unique symlink path in the destination directory. */
  uniqueSymlinkPath(destDir: string, name: string): Promise<string>;

  /** Create the database record for the symlink and return the API response. */
  createRecord(params: {
    name: string;
    destinationFolderId: string | null;
    symlinkFsPath: string;
    targetId: string;
  }): Promise<SymlinkCreateResult>;

  /** Find all symlinks of this type and delete broken ones. Returns count. */
  fixBroken(): Promise<number>;
}
