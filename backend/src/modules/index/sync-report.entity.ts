import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
} from "typeorm";

@Entity("sync_reports")
export class SyncReport {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ name: "folder_id", type: "uuid", nullable: true })
  folderId!: string | null;

  @Column({ type: "jsonb" })
  operations!: Array<{ label: string; items: string[] }>;

  @CreateDateColumn({ name: "created_at" })
  createdAt!: Date;
}
