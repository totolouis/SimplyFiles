import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  ParseUUIDPipe,
  HttpCode,
  HttpStatus,
} from "@nestjs/common";
import { FavoritesService } from "./favorites.service";
import { ItemType } from "../../common/item-type.enum";

@Controller("favorites")
export class FavoritesController {
  constructor(private readonly favoritesService: FavoritesService) {}

  @Get()
  list() {
    return this.favoritesService.list();
  }

  @Post()
  add(@Body() body: { itemType: ItemType; itemId: string }) {
    return this.favoritesService.add(body.itemType, body.itemId);
  }

  @Delete(":itemType/:itemId")
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @Param("itemType") itemType: ItemType,
    @Param("itemId", new ParseUUIDPipe()) itemId: string,
  ) {
    return this.favoritesService.remove(itemType, itemId);
  }

  @Get("check/:itemType/:itemId")
  check(
    @Param("itemType") itemType: ItemType,
    @Param("itemId", new ParseUUIDPipe()) itemId: string,
  ) {
    return this.favoritesService.check(itemType, itemId);
  }
}
