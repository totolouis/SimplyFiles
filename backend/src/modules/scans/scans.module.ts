import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { ScansController } from './scans.controller';
import { ScansService } from './scans.service';
import { FilesModule } from '../files/files.module';
import { File } from '../files/file.entity';
import { Folder } from '../folders/folder.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([File, Folder]),
    FilesModule,
    ScheduleModule.forRoot(),
  ],
  controllers: [ScansController],
  providers: [ScansService],
  exports: [ScansService],
})
export class ScansModule {}
