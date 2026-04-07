import { ItemType } from "../../common/item-type.enum";

export interface ResolvedItemMetadata {
  name: string;
  mimeType?: string;
  size?: number;
}

export interface FavoriteItemResolver {
  readonly itemType: ItemType;

  /** Batch-fetch metadata for the given item IDs. */
  resolveMany(ids: string[]): Promise<Map<string, ResolvedItemMetadata>>;
}
