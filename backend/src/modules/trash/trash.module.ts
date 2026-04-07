import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { File } from "../files/file.entity";
import { Folder } from "../folders/folder.entity";
import { FileIndexChunk } from "../search/file-index-chunk.entity";
import { TrashService } from "./trash.service";
import { TrashController } from "./trash.controller";
import { FileTrashHandler } from "./file-trash-handler";
import { FolderTrashHandler } from "./folder-trash-handler";
import { FilesModule } from "../files/files.module";
import { FoldersModule } from "../folders/folders.module";

@Module({
  imports: [
    TypeOrmModule.forFeature([File, Folder, FileIndexChunk]),
    FilesModule,
    FoldersModule,
  ],
  providers: [TrashService, FileTrashHandler, FolderTrashHandler],
  controllers: [TrashController],
  exports: [TrashService],
})
export class TrashModule {}
