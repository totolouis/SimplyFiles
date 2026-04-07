import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { In, Repository } from "typeorm";
import { Folder } from "../folders/folder.entity";
import { FavoriteItemResolver, ResolvedItemMetadata } from "./favorite-item-resolver.interface";
import { ItemType } from "../../common/item-type.enum";

@Injectable()
export class FolderFavoriteResolver implements FavoriteItemResolver {
  readonly itemType = ItemType.Folder;

  constructor(
    @InjectRepository(Folder) private readonly foldersRepo: Repository<Folder>,
  ) {}

  async resolveMany(ids: string[]): Promise<Map<string, ResolvedItemMetadata>> {
    if (ids.length === 0) return new Map();

    const folders = await this.foldersRepo.find({ where: { id: In(ids) } });
    return new Map(
      folders.map((f) => [f.id, { name: f.name }]),
    );
  }
}
