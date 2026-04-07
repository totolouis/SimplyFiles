import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { Favorite } from "./favorite.entity";
import { File } from "../files/file.entity";
import { Folder } from "../folders/folder.entity";
import { FavoritesService } from "./favorites.service";
import { FavoritesController } from "./favorites.controller";
import { FileFavoriteResolver } from "./file-favorite-resolver";
import { FolderFavoriteResolver } from "./folder-favorite-resolver";

@Module({
  imports: [TypeOrmModule.forFeature([Favorite, File, Folder])],
  providers: [FavoritesService, FileFavoriteResolver, FolderFavoriteResolver],
  controllers: [FavoritesController],
  exports: [FavoritesService],
})
export class FavoritesModule {}
