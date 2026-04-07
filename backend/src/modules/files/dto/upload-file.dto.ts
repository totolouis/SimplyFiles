import { IsOptional, IsUUID } from 'class-validator';

export class UploadFileDto {
  @IsOptional()
  @IsUUID('4')
  folderId?: string | null;
}
