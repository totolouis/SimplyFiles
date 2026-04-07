import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  ParseUUIDPipe,
  HttpCode,
  HttpStatus,
} from "@nestjs/common";
import { TrashService } from "./trash.service";

@Controller("trash")
export class TrashController {
  constructor(private readonly trashService: TrashService) {}

  @Get()
  list() {
    return this.trashService.list();
  }

  @Post("files/:id/restore")
  @HttpCode(HttpStatus.NO_CONTENT)
  restoreFile(@Param("id", new ParseUUIDPipe()) id: string) {
    return this.trashService.restoreFile(id);
  }

  @Post("folders/:id/restore")
  @HttpCode(HttpStatus.NO_CONTENT)
  restoreFolder(@Param("id", new ParseUUIDPipe()) id: string) {
    return this.trashService.restoreFolder(id);
  }

  @Delete("files/:id")
  @HttpCode(HttpStatus.NO_CONTENT)
  permanentDeleteFile(@Param("id", new ParseUUIDPipe()) id: string) {
    return this.trashService.permanentDeleteFile(id);
  }

  @Delete("folders/:id")
  @HttpCode(HttpStatus.NO_CONTENT)
  permanentDeleteFolder(@Param("id", new ParseUUIDPipe()) id: string) {
    return this.trashService.permanentDeleteFolder(id);
  }

  @Delete()
  emptyTrash() {
    return this.trashService.emptyTrash();
  }

  @Post("purge-expired")
  purgeExpired() {
    return this.trashService.purgeExpired();
  }
}
