import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { In, Repository } from "typeorm";
import { File } from "../files/file.entity";
import { FavoriteItemResolver, ResolvedItemMetadata } from "./favorite-item-resolver.interface";
import { ItemType } from "../../common/item-type.enum";

@Injectable()
export class FileFavoriteResolver implements FavoriteItemResolver {
  readonly itemType = ItemType.File;

  constructor(
    @InjectRepository(File) private readonly filesRepo: Repository<File>,
  ) {}

  async resolveMany(ids: string[]): Promise<Map<string, ResolvedItemMetadata>> {
    if (ids.length === 0) return new Map();

    const files = await this.filesRepo.find({ where: { id: In(ids) } });
    return new Map(
      files.map((f) => [
        f.id,
        { name: f.filename, mimeType: f.mimeType, size: f.size },
      ]),
    );
  }
}
