import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { FileIndexChunk } from "./file-index-chunk.entity";
import { FileIndexService } from "./file-index.service";
import { SearchService } from "./search.service";
import { SearchController } from "./search.controller";

@Module({
  imports: [TypeOrmModule.forFeature([FileIndexChunk])],
  providers: [FileIndexService, SearchService],
  controllers: [SearchController],
  exports: [FileIndexService, SearchService],
})
export class SearchModule {}
