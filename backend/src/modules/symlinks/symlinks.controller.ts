import { Controller, Get, Post, Query, Body, HttpCode, HttpStatus } from '@nestjs/common';
import { SymlinksService } from './symlinks.service';
import { CreateSymlinkDto } from './dto/create-symlink.dto';

@Controller('symlinks')
export class SymlinksController {
  constructor(private readonly symlinksService: SymlinksService) {}

  @Get('search')
  search(@Query('q') q: string) {
    return this.symlinksService.search(q);
  }

  @Post('fix')
  @HttpCode(HttpStatus.OK)
  fix() {
    return this.symlinksService.fixBroken();
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Body() dto: CreateSymlinkDto) {
    return this.symlinksService.create(dto);
  }
}
