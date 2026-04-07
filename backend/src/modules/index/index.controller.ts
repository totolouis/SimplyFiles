import { Controller, Get, Post, Body } from '@nestjs/common';
import { IndexService } from './index.service';

@Controller('index')
export class IndexController {
  constructor(private readonly indexService: IndexService) {}

  @Get('stats')
  getStats() {
    return this.indexService.getStats();
  }

  @Post('reindex-missing')
  reindexMissing() {
    return this.indexService.reindexMissing();
  }

  @Post('import-folder')
  importFolder(@Body('folderId') folderId: string | null) {
    return this.indexService.importFolder(folderId || null);
  }

  @Post('sync')
  sync(@Body('folderId') folderId: string | null) {
    return this.indexService.sync(folderId || null);
  }

  @Get('sync-reports')
  listReports() {
    return this.indexService.listReports();
  }
}
