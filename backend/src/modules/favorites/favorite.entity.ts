import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Unique,
  Index,
} from "typeorm";
import { ItemType } from "../../common/item-type.enum";

@Entity("favorites")
@Unique("UQ_favorites_item", ["itemType", "itemId"])
export class Favorite {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Index()
  @Column({ name: "item_type", type: "text" })
  itemType!: ItemType;

  @Index()
  @Column({ name: "item_id", type: "uuid" })
  itemId!: string;

  @CreateDateColumn({ name: "created_at" })
  createdAt!: Date;
}
