import { Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository, Not, IsNull, LessThan } from "typeorm";
import { File } from "../files/file.entity";
import { FilesService } from "../files/files.service";
import { TrashItemHandler, RawDeletedItem } from "./trash-item-handler.interface";
import { ItemType } from "../../common/item-type.enum";

@Injectable()
export class FileTrashHandler implements TrashItemHandler {
  private readonly logger = new Logger(FileTrashHandler.name);

  constructor(
    @InjectRepository(File) private readonly filesRepo: Repository<File>,
    private readonly filesService: FilesService,
  ) {}

  async listDeleted(): Promise<RawDeletedItem[]> {
    const files = await this.filesRepo.find({
      where: { deletedAt: Not(IsNull()) },
      withDeleted: true,
      order: { deletedAt: "DESC" },
    });

    return files.map((file) => ({
      id: file.id,
      name: file.filename,
      type: ItemType.File,
      deletedAt: file.deletedAt!,
      size: file.size,
      mimeType: file.mimeType,
      parentRef: file.folderId,
    }));
  }

  async restore(id: string): Promise<void> {
    await this.filesRepo.restore(id);
    this.logger.log(`Restored file from trash: id=${id}`);
  }

  async permanentDelete(id: string): Promise<void> {
    const file = await this.filesRepo.findOne({
      where: { id },
      withDeleted: true,
    });
    if (!file) return;
    this.logger.log(`Permanently deleting file from trash: "${file.filename}" (id=${id})`);
    await this.filesService.permanentDelete(file);
  }

  async deleteAll(): Promise<number> {
    const files = await this.filesRepo.find({
      where: { deletedAt: Not(IsNull()) },
      withDeleted: true,
    });
    return this.deleteFilesInBatches(files);
  }

  async purgeExpired(cutoff: Date): Promise<number> {
    const files = await this.filesRepo.find({
      where: { deletedAt: LessThan(cutoff) },
      withDeleted: true,
    });
    return this.deleteFilesInBatches(files);
  }

  private async deleteFilesInBatches(files: File[], batchSize = 10): Promise<number> {
    let deleted = 0;
    for (let i = 0; i < files.length; i += batchSize) {
      const batch = files.slice(i, i + batchSize);
      await Promise.allSettled(
        batch.map((file) => this.filesService.permanentDelete(file)),
      );
      deleted += batch.length;
    }
    return deleted;
  }
}
