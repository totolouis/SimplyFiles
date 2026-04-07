import {
  Controller,
  Get,
  Post,
  Delete,
  Patch,
  Param,
  Body,
  Res,
  UploadedFile,
  UseInterceptors,
  ParseUUIDPipe,
  HttpCode,
  HttpStatus,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import type { Response } from "express";
import { FilesService } from "./files.service";
import { MoveFileDto } from "./dto/move-file.dto";
import { RenameFileDto } from "./dto/rename-file.dto";
import { UploadFileDto } from "./dto/upload-file.dto";

@Controller("files")
export class FilesController {
  constructor(private readonly filesService: FilesService) {}

  @Post("upload")
  @UseInterceptors(FileInterceptor("file"))
  async upload(
    @UploadedFile() file: Express.Multer.File,
    @Body() dto: UploadFileDto,
  ) {
    // Normalize filename to NFC to handle macOS NFD encoding
    const normalizedName = file.originalname.normalize("NFC");
    return this.filesService.upload(
      normalizedName,
      file.buffer,
      dto.folderId ?? null,
      file.mimetype,
    );
  }

  // Re-index all files that haven't been indexed yet
  @Post("reindex")
  reindexAll() {
    return this.filesService.reindexAll();
  }

  @Get(":id")
  findById(@Param("id", new ParseUUIDPipe()) id: string) {
    return this.filesService.findById(id);
  }

  @Get(":id/download")
  async download(
    @Param("id", new ParseUUIDPipe()) id: string,
    @Res() res: Response,
  ) {
    const { file, stream } = await this.filesService.stream(id);
    // RFC 8187 / RFC 5987 encoding for Unicode filenames
    const encodedFilename = encodeURIComponent(file.filename);
    res.set({
      "Content-Type": file.mimeType,
      "Content-Disposition": `attachment; filename*=UTF-8''${encodedFilename}`,
      "Content-Length": String(file.size),
    });
    stream.pipe(res);
  }

  @Get(":id/stream")
  async stream(
    @Param("id", new ParseUUIDPipe()) id: string,
    @Res() res: Response,
  ) {
    const { file, stream } = await this.filesService.stream(id);
    // RFC 8187 / RFC 5987 encoding for Unicode filenames
    const encodedFilename = encodeURIComponent(file.filename);
    res.set({
      "Content-Type": file.mimeType,
      "Content-Disposition": `inline; filename*=UTF-8''${encodedFilename}`,
      "Content-Length": String(file.size),
    });
    stream.pipe(res);
  }

  // Re-index a single file (useful for PDFs uploaded before pdf-parse was added)
  @Post(":id/reindex")
  reindex(@Param("id", new ParseUUIDPipe()) id: string) {
    return this.filesService.reindex(id);
  }

  @Patch(":id/rename")
  rename(
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body() dto: RenameFileDto,
  ) {
    return this.filesService.rename(id, dto.name);
  }

  @Patch(":id/move")
  move(@Param("id", new ParseUUIDPipe()) id: string, @Body() dto: MoveFileDto) {
    return this.filesService.move(id, dto.folderId ?? null);
  }

  @Delete(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  delete(@Param("id", new ParseUUIDPipe()) id: string) {
    return this.filesService.delete(id);
  }
}
