import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { File } from "../files/file.entity";
import { Folder } from "../folders/folder.entity";
import { SyncReport } from "./sync-report.entity";
import { SearchModule } from "../search/search.module";
import { PathModule } from "../../common/path.module";
import { IndexService } from "./index.service";
import { IndexController } from "./index.controller";
import { DiskScanner } from "./disk-scanner";
import { StaleCleaner } from "./stale-cleaner";
import { DiskImporter } from "./disk-importer";
import { Reindexer } from "./reindexer";
import { SymlinkFolderImportHandler } from "./symlink-folder-import-handler";
import { BrokenSymlinkImportHandler } from "./broken-symlink-import-handler";
import { RegularFileImportHandler } from "./regular-file-import-handler";
import { IMPORT_ITEM_HANDLERS } from "./import-item-handler.interface";

@Module({
  imports: [
    TypeOrmModule.forFeature([File, Folder, SyncReport]),
    SearchModule,
    PathModule,
  ],
  providers: [
    IndexService,
    DiskScanner,
    StaleCleaner,
    DiskImporter,
    Reindexer,
    SymlinkFolderImportHandler,
    BrokenSymlinkImportHandler,
    RegularFileImportHandler,
    {
      provide: IMPORT_ITEM_HANDLERS,
      useFactory: (
        symlinkFolder: SymlinkFolderImportHandler,
        brokenSymlink: BrokenSymlinkImportHandler,
        regularFile: RegularFileImportHandler,
      ) => [symlinkFolder, brokenSymlink, regularFile],
      inject: [
        SymlinkFolderImportHandler,
        BrokenSymlinkImportHandler,
        RegularFileImportHandler,
      ],
    },
  ],
  controllers: [IndexController],
})
export class IndexModule {}
