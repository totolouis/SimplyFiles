import { IsArray, IsNumberString, IsOptional, IsString } from "class-validator";

export enum ScanStatus {
  PENDING = "PENDING",
  STARTED = "STARTED",
  COMPLETED = "COMPLETED",
  FAILED = "FAILED",
}

export interface ScanResult {
  file_id: string;
  filename: string;
  path: string;
  title: string;
  created: string;
  correspondent: string | null;
  document_type: string | null;
  tags: string[];
  archive_serial_number: string | null;
}

export interface ProcessingTask {
  task_id: string;
  status: ScanStatus;
  result?: ScanResult;
  error?: string;
  created: string;
  started?: string;
  completed?: string;
}

export class UploadDocumentDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  created?: string;

  @IsOptional()
  @IsNumberString()
  correspondent?: string;

  @IsOptional()
  @IsNumberString()
  document_type?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @IsOptional()
  @IsString()
  archive_serial_number?: string;
}
