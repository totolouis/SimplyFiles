import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  ManyToOne,
  OneToMany,
  JoinColumn,
  UpdateDateColumn,
  Index,
} from "typeorm";

@Entity("folders")
export class Folder {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "text" })
  name!: string;

  @Index()
  @Column({ name: "parent_id", type: "uuid", nullable: true })
  parentId!: string | null;

  @ManyToOne(() => Folder, (folder) => folder.children, {
    nullable: true,
    onDelete: "CASCADE",
  })
  @JoinColumn({ name: "parent_id" })
  parent!: Folder;

  @OneToMany(() => Folder, (folder) => folder.parent)
  children!: Folder[];

  @Column({ name: "is_symlink", type: "boolean", default: false })
  isSymlink!: boolean;

  @Column({ name: "symlink_target_id", type: "uuid", nullable: true })
  symlinkTargetId!: string | null;

  @CreateDateColumn({ name: "created_at" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updated_at" })
  updatedAt!: Date;

  @Index()
  @DeleteDateColumn({ name: "deleted_at" })
  deletedAt!: Date | null;
}
