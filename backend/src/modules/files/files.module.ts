import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { File } from "./file.entity";
import { FilesService } from "./files.service";
import { FilesController } from "./files.controller";
import { FileIndexChunk } from "../search/file-index-chunk.entity";
import { SearchModule } from "../search/search.module";

@Module({
  imports: [TypeOrmModule.forFeature([File, FileIndexChunk]), SearchModule],
  providers: [FilesService],
  controllers: [FilesController],
  exports: [FilesService],
})
export class FilesModule {}
