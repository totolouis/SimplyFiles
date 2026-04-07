import { IsString, IsNotEmpty, MaxLength } from 'class-validator';

export class RenameFileDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name!: string;
}
