import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { File } from '../files/file.entity';
import { Folder } from '../folders/folder.entity';
import { SymlinksController } from './symlinks.controller';
import { SymlinksService } from './symlinks.service';
import { FileSymlinkCreator } from './file-symlink-creator';
import { FolderSymlinkCreator } from './folder-symlink-creator';

@Module({
  imports: [TypeOrmModule.forFeature([File, Folder])],
  controllers: [SymlinksController],
  providers: [SymlinksService, FileSymlinkCreator, FolderSymlinkCreator],
})
export class SymlinksModule {}
