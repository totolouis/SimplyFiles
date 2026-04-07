import { IsString, IsNotEmpty, IsInt, IsOptional, Min } from 'class-validator';

export class SearchGotoDto {
  @IsString()
  @IsNotEmpty()
  query!: string;

  @IsInt()
  @Min(0)
  @IsOptional()
  page?: number = 0;

  @IsInt()
  @Min(1)
  @IsOptional()
  limit?: number = 20;
}

export interface GotoFolderResult {
  id: string;
  name: string;
  fullPath: string;
  depth: number;
}

export interface SearchGotoResponse {
  results: GotoFolderResult[];
  total: number;
  page: number;
  totalPages: number;
}
