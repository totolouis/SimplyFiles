import { Module, Global } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Folder } from '../modules/folders/folder.entity';
import { PathService } from './path.service';

@Global()
@Module({
  imports: [TypeOrmModule.forFeature([Folder])],
  providers: [PathService],
  exports: [PathService],
})
export class PathModule {}
