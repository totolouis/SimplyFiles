import { Injectable, Logger } from "@nestjs/common";
import { FileTrashHandler } from "./file-trash-handler";
import { FolderTrashHandler } from "./folder-trash-handler";
import { TrashItem, RawDeletedItem } from "./trash-item-handler.interface";


const TRASH_RETENTION_DAYS = 30;

@Injectable()
export class TrashService {
  private readonly logger = new Logger(TrashService.name);

  constructor(
    private readonly fileHandler: FileTrashHandler,
    private readonly folderHandler: FolderTrashHandler,
  ) {}

  async list(): Promise<TrashItem[]> {
    const [rawFiles, rawFolders] = await Promise.all([
      this.fileHandler.listDeleted(),
      this.folderHandler.listDeleted(),
    ]);

    // Top-level filtering: exclude items nested inside a deleted folder
    const deletedFolderIds = new Set(rawFolders.map((f) => f.id));

    const topLevelFiles = rawFiles.filter(
      (f) => !f.parentRef || !deletedFolderIds.has(f.parentRef),
    );
    const topLevelFolders = rawFolders.filter(
      (f) => !f.parentRef || !deletedFolderIds.has(f.parentRef),
    );

    const items: TrashItem[] = [...topLevelFiles, ...topLevelFolders].map(
      (raw) => this.toTrashItem(raw),
    );

    items.sort(
      (a, b) =>
        new Date(b.deletedAt).getTime() - new Date(a.deletedAt).getTime(),
    );

    return items;
  }

  async restoreFile(id: string): Promise<void> {
    await this.fileHandler.restore(id);
  }

  async restoreFolder(id: string): Promise<void> {
    await this.folderHandler.restore(id);
  }

  async permanentDeleteFile(id: string): Promise<void> {
    await this.fileHandler.permanentDelete(id);
  }

  async permanentDeleteFolder(id: string): Promise<void> {
    await this.folderHandler.permanentDelete(id);
  }

  async emptyTrash(): Promise<{ deletedFiles: number; deletedFolders: number }> {
    // Delete files first (they reference folders)
    const deletedFiles = await this.fileHandler.deleteAll();
    const deletedFolders = await this.folderHandler.deleteAll();

    this.logger.log(`Emptied trash: ${deletedFiles} files, ${deletedFolders} folders`);
    return { deletedFiles, deletedFolders };
  }

  async purgeExpired(): Promise<{ purgedFiles: number; purgedFolders: number }> {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - TRASH_RETENTION_DAYS);

    const purgedFiles = await this.fileHandler.purgeExpired(cutoff);
    const purgedFolders = await this.folderHandler.purgeExpired(cutoff);

    if (purgedFiles > 0 || purgedFolders > 0) {
      this.logger.log(
        `Purged ${purgedFiles} expired files and ${purgedFolders} expired folders from trash`,
      );
    }

    return { purgedFiles, purgedFolders };
  }

  private toTrashItem(raw: RawDeletedItem): TrashItem {
    return {
      id: raw.id,
      name: raw.name,
      type: raw.type,
      deletedAt: raw.deletedAt,
      expiresAt: this.expiresAt(raw.deletedAt),
      ...(raw.size !== undefined && { size: raw.size }),
      ...(raw.mimeType !== undefined && { mimeType: raw.mimeType }),
    };
  }

  private expiresAt(deletedAt: Date): Date {
    const expires = new Date(deletedAt);
    expires.setDate(expires.getDate() + TRASH_RETENTION_DAYS);
    return expires;
  }
}

export type { TrashItem } from "./trash-item-handler.interface";
