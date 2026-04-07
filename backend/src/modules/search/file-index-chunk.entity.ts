import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  Unique,
  Index,
} from "typeorm";
import { File } from "../files/file.entity";

@Entity("file_index_chunks")
@Unique(["fileId", "chunkIndex"])
export class FileIndexChunk {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ name: "file_id", type: "uuid" })
  @Index() // index for fast lookups by file_id, e.g. when deleting a file's chunks
  fileId!: string;

  @ManyToOne(() => File, { onDelete: "CASCADE" })
  @JoinColumn({ name: "file_id" })
  file!: File;

  @Column({ name: "chunk_index", type: "int" })
  chunkIndex!: number;

  @Column({ name: "content_text", type: "text", nullable: true })
  contentText!: string | null;

  // tsvector has no native TypeORM type — kept as raw string.
  // Never write to this column via the entity; always use to_tsvector() in raw SQL.
  // GIN index is created via migration / DbInitService (TypeORM @Index creates btree which can't serve @@).
  @Column({
    name: "content_vector",
    type: "tsvector",
    nullable: true,
    select: false, // never pulled into memory accidentally
  })
  contentVector!: string | null;
}
