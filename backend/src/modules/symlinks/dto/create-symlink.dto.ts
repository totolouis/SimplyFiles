import { IsUUID, IsOptional, IsNotEmpty, IsEnum } from 'class-validator';
import { ItemType } from '../../../common/item-type.enum';

export class CreateSymlinkDto {
  @IsUUID('4')
  @IsNotEmpty()
  targetId!: string;

  @IsEnum(ItemType)
  targetType!: ItemType;

  @IsOptional()
  @IsUUID('4')
  destinationFolderId?: string | null;
}
