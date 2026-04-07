import { IsOptional, IsUUID } from 'class-validator';

export class MoveFolderDto {
  @IsOptional()
  @IsUUID('4')
  parentId?: string | null;
}
