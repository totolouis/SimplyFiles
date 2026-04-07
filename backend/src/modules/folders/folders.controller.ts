import {
  Controller,
  Get,
  Post,
  Delete,
  Patch,
  Body,
  Param,
  ParseUUIDPipe,
  HttpCode,
  HttpStatus,
} from "@nestjs/common";
import { FoldersService } from "./folders.service";
import { CreateFolderDto } from "./dto/create-folder.dto";
import { RenameFolderDto } from "./dto/rename-folder.dto";
import { MoveFolderDto } from "./dto/move-folder.dto";
import { SearchGotoDto } from "./dto/search-goto.dto";

@Controller("folders")
export class FoldersController {
  constructor(private readonly foldersService: FoldersService) {}

  @Get()
  findAll() {
    return this.foldersService.findAll();
  }

  @Get("root")
  getRootContents() {
    return this.foldersService.getRootContents();
  }

  @Get(":id")
  findById(@Param("id", new ParseUUIDPipe()) id: string) {
    return this.foldersService.findById(id);
  }

  @Post()
  create(@Body() dto: CreateFolderDto) {
    return this.foldersService.create(dto.name, dto.parentId ?? null);
  }

  @Patch(":id")
  rename(
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body() dto: RenameFolderDto,
  ) {
    return this.foldersService.rename(id, dto.name);
  }

  @Patch(":id/move")
  move(
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body() dto: MoveFolderDto,
  ) {
    return this.foldersService.move(id, dto.parentId ?? null);
  }

  @Delete(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  delete(@Param("id", new ParseUUIDPipe()) id: string) {
    return this.foldersService.delete(id);
  }

  @Post("search-goto")
  searchGoto(@Body() dto: SearchGotoDto) {
    return this.foldersService.searchGotoFolders(
      dto.query,
      dto.page ?? 0,
      dto.limit ?? 20,
    );
  }
}
