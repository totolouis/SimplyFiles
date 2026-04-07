import { ItemType } from "../../common/item-type.enum";

export interface TrashItem {
  id: string;
  name: string;
  type: ItemType;
  deletedAt: Date;
  expiresAt: Date;
  size?: number;
  mimeType?: string;
}

export interface RawDeletedItem {
  id: string;
  name: string;
  type: ItemType;
  deletedAt: Date;
  size?: number;
  mimeType?: string;
  /** For files: folderId. For folders: parentId. Used for top-level filtering. */
  parentRef: string | null;
}

export interface TrashItemHandler {
  /** Fetch all soft-deleted items of this type. */
  listDeleted(): Promise<RawDeletedItem[]>;

  /** Restore an item from trash by id. */
  restore(id: string): Promise<void>;

  /** Permanently delete one item by id. */
  permanentDelete(id: string): Promise<void>;

  /** Permanently delete all trashed items of this type. Returns count. */
  deleteAll(): Promise<number>;

  /** Permanently delete items expired before cutoff. Returns count. */
  purgeExpired(cutoff: Date): Promise<number>;
}
