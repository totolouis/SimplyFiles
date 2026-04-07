import { Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository, Not, IsNull, LessThan } from "typeorm";
import { Folder } from "../folders/folder.entity";
import { FoldersService } from "../folders/folders.service";
import { TrashItemHandler, RawDeletedItem } from "./trash-item-handler.interface";
import { ItemType } from "../../common/item-type.enum";

@Injectable()
export class FolderTrashHandler implements TrashItemHandler {
  private readonly logger = new Logger(FolderTrashHandler.name);

  constructor(
    @InjectRepository(Folder) private readonly foldersRepo: Repository<Folder>,
    private readonly foldersService: FoldersService,
  ) {}

  async listDeleted(): Promise<RawDeletedItem[]> {
    const folders = await this.foldersRepo.find({
      where: { deletedAt: Not(IsNull()) },
      withDeleted: true,
      order: { deletedAt: "DESC" },
    });

    return folders.map((folder) => ({
      id: folder.id,
      name: folder.name,
      type: ItemType.Folder,
      deletedAt: folder.deletedAt!,
      parentRef: folder.parentId,
    }));
  }

  async restore(id: string): Promise<void> {
    const folder = await this.foldersRepo.findOne({
      where: { id },
      withDeleted: true,
    });
    if (!folder) return;

    // Restore the folder and all its descendants
    await this.foldersRepo.manager.query(
      `WITH RECURSIVE tree AS (
         SELECT id FROM folders WHERE id = $1
         UNION ALL
         SELECT f.id FROM folders f INNER JOIN tree t ON f.parent_id = t.id
         WHERE f.deleted_at IS NOT NULL
       )
       UPDATE folders SET deleted_at = NULL WHERE id IN (SELECT id FROM tree)`,
      [id],
    );

    this.logger.log(`Restored folder from trash: "${folder.name}" (id=${id})`);

    // Restore all files under the folder tree
    await this.foldersRepo.manager.query(
      `WITH RECURSIVE tree AS (
         SELECT id FROM folders WHERE id = $1
         UNION ALL
         SELECT f.id FROM folders f INNER JOIN tree t ON f.parent_id = t.id
       )
       UPDATE files SET deleted_at = NULL WHERE folder_id IN (SELECT id FROM tree) AND deleted_at IS NOT NULL`,
      [id],
    );
  }

  async permanentDelete(id: string): Promise<void> {
    this.logger.log(`Permanently deleting folder from trash: id=${id}`);
    await this.foldersService.permanentDelete(id);
  }

  async deleteAll(): Promise<number> {
    const folders = await this.foldersRepo.find({
      where: { deletedAt: Not(IsNull()) },
      withDeleted: true,
    });
    return this.deleteFoldersDepthFirst(folders);
  }

  async purgeExpired(cutoff: Date): Promise<number> {
    const folders = await this.foldersRepo.find({
      where: { deletedAt: LessThan(cutoff) },
      withDeleted: true,
    });
    return this.deleteFoldersDepthFirst(folders);
  }

  private async deleteFoldersDepthFirst(folders: Folder[]): Promise<number> {
    const folderMap = new Map(folders.map((f) => [f.id, f]));
    folders.sort((a, b) => this.getDepth(b, folderMap) - this.getDepth(a, folderMap));

    for (const folder of folders) {
      await this.foldersService.permanentDelete(folder.id);
    }

    return folders.length;
  }

  private getDepth(f: Folder, folderMap: Map<string, Folder>): number {
    let depth = 0;
    let current: Folder | undefined = f;
    while (current?.parentId && folderMap.has(current.parentId)) {
      depth++;
      current = folderMap.get(current.parentId);
    }
    return depth;
  }
}
