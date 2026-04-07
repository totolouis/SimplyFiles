import { Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { Favorite } from "./favorite.entity";
import { ItemType } from "../../common/item-type.enum";
import { FavoriteItemResolver, ResolvedItemMetadata } from "./favorite-item-resolver.interface";
import { FileFavoriteResolver } from "./file-favorite-resolver";
import { FolderFavoriteResolver } from "./folder-favorite-resolver";

export interface FavoriteItem {
  id: string;
  itemType: ItemType;
  itemId: string;
  name: string;
  createdAt: Date;
  mimeType?: string;
  size?: number;
}

@Injectable()
export class FavoritesService {
  private readonly logger = new Logger(FavoritesService.name);
  private readonly resolvers: Map<ItemType, FavoriteItemResolver>;

  constructor(
    @InjectRepository(Favorite) private readonly favoritesRepo: Repository<Favorite>,
    fileResolver: FileFavoriteResolver,
    folderResolver: FolderFavoriteResolver,
  ) {
    this.resolvers = new Map<ItemType, FavoriteItemResolver>([
      [ItemType.File, fileResolver],
      [ItemType.Folder, folderResolver],
    ]);
  }

  async list(): Promise<FavoriteItem[]> {
    const favorites = await this.favoritesRepo.find({
      order: { createdAt: "DESC" },
    });

    if (favorites.length === 0) return [];

    // Group favorite IDs by type
    const idsByType = new Map<ItemType, string[]>();
    for (const fav of favorites) {
      const ids = idsByType.get(fav.itemType) ?? [];
      ids.push(fav.itemId);
      idsByType.set(fav.itemType, ids);
    }

    // Batch-resolve metadata for each type in parallel
    const metadataByType = new Map<ItemType, Map<string, ResolvedItemMetadata>>();
    await Promise.all(
      Array.from(idsByType.entries()).map(async ([type, ids]) => {
        const resolver = this.resolvers.get(type);
        if (resolver) {
          metadataByType.set(type, await resolver.resolveMany(ids));
        }
      }),
    );

    // Map favorites to items, skipping those with missing metadata
    const items: FavoriteItem[] = [];
    for (const fav of favorites) {
      const metadata = metadataByType.get(fav.itemType)?.get(fav.itemId);
      if (metadata) {
        items.push({
          id: fav.id,
          itemType: fav.itemType,
          itemId: fav.itemId,
          name: metadata.name,
          createdAt: fav.createdAt,
          ...(metadata.mimeType !== undefined && { mimeType: metadata.mimeType }),
          ...(metadata.size !== undefined && { size: metadata.size }),
        });
      }
    }

    return items;
  }

  async add(itemType: ItemType, itemId: string): Promise<Favorite> {
    const existing = await this.favoritesRepo.findOne({
      where: { itemType, itemId },
    });
    if (existing) return existing;

    const favorite = this.favoritesRepo.create({ itemType, itemId });
    const saved = await this.favoritesRepo.save(favorite);
    this.logger.log(`Added favorite: ${itemType}=${itemId}`);
    return saved;
  }

  async remove(itemType: ItemType, itemId: string): Promise<void> {
    await this.favoritesRepo.delete({ itemType, itemId });
    this.logger.log(`Removed favorite: ${itemType}=${itemId}`);
  }

  async check(
    itemType: ItemType,
    itemId: string,
  ): Promise<{ favorited: boolean }> {
    const count = await this.favoritesRepo.count({
      where: { itemType, itemId },
    });
    return { favorited: count > 0 };
  }
}
