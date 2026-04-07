import * as path from "path";
import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { TypeOrmModule } from "@nestjs/typeorm";
import appConfig from "./config/app.config";
import { PathModule } from "./common/path.module";
import { FoldersModule } from "./modules/folders/folders.module";
import { FilesModule } from "./modules/files/files.module";
import { SearchModule } from "./modules/search/search.module";
import { IndexModule } from "./modules/index/index.module";
import { ScansModule } from "./modules/scans/scans.module";
import { SymlinksModule } from "./modules/symlinks/symlinks.module";
import { HealthModule } from "./modules/health/health.module";
import { TrashModule } from "./modules/trash/trash.module";
import { FavoritesModule } from "./modules/favorites/favorites.module";
import { Folder } from "./modules/folders/folder.entity";
import { File } from "./modules/files/file.entity";
import { FileIndexChunk } from "./modules/search/file-index-chunk.entity";
import { SyncReport } from "./modules/index/sync-report.entity";
import { Favorite } from "./modules/favorites/favorite.entity";
import { DbInitService } from "./common/db-init.service";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [appConfig],
    }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: "postgres" as const,
        url: config.get<string>("app.databaseUrl") ?? "",
        entities: [Folder, File, FileIndexChunk, SyncReport, Favorite],
        migrations: [path.join(__dirname, "migrations", "*{.ts,.js}")],
        migrationsRun: config.get<boolean>("app.migrationsRun") ?? false,
        synchronize: config.get<boolean>("app.synchronize") ?? false,
        logging: false,
      }),
    }),
    PathModule, // global — provides PathService everywhere
    FoldersModule,
    FilesModule,
    SearchModule,
    IndexModule,
    SymlinksModule,
    ScansModule,
    HealthModule,
    TrashModule,
    FavoritesModule,
  ],
  providers: [DbInitService],
})
export class AppModule {}
