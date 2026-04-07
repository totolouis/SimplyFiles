import { IsOptional, IsUUID } from 'class-validator';

export class MoveFileDto {
  @IsOptional()
  @IsUUID('4')
  folderId?: string | null;
}
