import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from "typeorm";
import { Folder } from "../folders/folder.entity";

@Entity("files")
export class File {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "text" })
  filename!: string;

  @Index()
  @Column({ name: "folder_id", type: "uuid", nullable: true })
  folderId!: string | null;

  @ManyToOne(() => Folder, { nullable: true, onDelete: "CASCADE" })
  @JoinColumn({ name: "folder_id" })
  folder!: Folder;

  @Column({ name: "mime_type", type: "text" })
  mimeType!: string;

  @Column({
    type: "bigint",
    transformer: {
      to: (value: number): number => value,
      from: (value: string | number): number =>
        typeof value === "string" ? parseInt(value, 10) : value,
    },
  })
  size!: number;

  @Column({ name: "storage_path", type: "text" })
  storagePath!: string;

  @Index()
  @Column({ name: "content_hash", type: "text", nullable: true })
  contentHash!: string | null;

  @Column({ name: "is_symlink", type: "boolean", default: false })
  isSymlink!: boolean;

  @CreateDateColumn({ name: "created_at" })
  createdAt!: Date;

  @Index()
  @DeleteDateColumn({ name: "deleted_at" })
  deletedAt!: Date | null;
}
