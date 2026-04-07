import { IsString, IsNotEmpty, MaxLength } from 'class-validator';

export class RenameFolderDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name!: string;
}
