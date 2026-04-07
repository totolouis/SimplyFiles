import {
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
  InternalServerErrorException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { Folder } from '../folders/folder.entity';
import { PathService } from '../../common/path.service';
import { CreateSymlinkDto } from './dto/create-symlink.dto';
import { ItemType } from '../../common/item-type.enum';
import { SymlinkCreator } from './symlink-creator.interface';
import { FileSymlinkCreator } from './file-symlink-creator';
import { FolderSymlinkCreator } from './folder-symlink-creator';
import * as fsp from 'fs/promises';
import * as path from 'path';

@Injectable()
export class SymlinksService {
  private readonly logger = new Logger(SymlinksService.name);
  private readonly creators: Map<ItemType, SymlinkCreator>;

  constructor(
    @InjectRepository(Folder) private foldersRepo: Repository<Folder>,
    private dataSource: DataSource,
    private pathService: PathService,
    private fileCreator: FileSymlinkCreator,
    private folderCreator: FolderSymlinkCreator,
  ) {
    this.creators = new Map<ItemType, SymlinkCreator>([
      [ItemType.File, fileCreator],
      [ItemType.Folder, folderCreator],
    ]);
  }

  async search(q: string | undefined): Promise<any[]> {
    const term = (q || '').trim();
    if (term.length < 2) return [];

    try {
      const results = await this.dataSource.query(
        `WITH RECURSIVE folder_paths AS (
          SELECT id, name, parent_id, CAST(name AS text) AS path FROM folders WHERE parent_id IS NULL AND deleted_at IS NULL
          UNION ALL
          SELECT f.id, f.name, f.parent_id, fp.path || ' / ' || f.name
          FROM folders f
          JOIN folder_paths fp ON f.parent_id = fp.id
          WHERE f.deleted_at IS NULL
        )
        SELECT * FROM (
          SELECT
            f.id,
            f.filename AS name,
            'file' AS type,
            COALESCE(fp.path, 'All Files') AS path,
            f.mime_type AS "mimeType"
          FROM files f
          LEFT JOIN folder_paths fp ON f.folder_id = fp.id
          WHERE f.filename ILIKE '%' || $1 || '%'
            AND f.is_symlink = FALSE
            AND f.deleted_at IS NULL

          UNION ALL

          SELECT
            fo.id,
            fo.name,
            'folder' AS type,
            COALESCE(fp2.path, 'Root') AS path,
            NULL AS "mimeType"
          FROM folders fo
          LEFT JOIN folder_paths fp2 ON fo.parent_id = fp2.id
          WHERE fo.name ILIKE '%' || $1 || '%'
            AND fo.is_symlink = FALSE
            AND fo.deleted_at IS NULL
        ) combined
        ORDER BY type DESC, name ASC
        LIMIT 30`,
        [term],
      );
      return results;
    } catch (e: any) {
      this.logger.error(`Symlink search failed: ${e.message}`);
      return [];
    }
  }

  async fixBroken(): Promise<{ deletedFiles: number; deletedFolders: number }> {
    const deletedFiles = await this.fileCreator.fixBroken();
    const deletedFolders = await this.folderCreator.fixBroken();
    return { deletedFiles, deletedFolders };
  }

  async create(dto: CreateSymlinkDto): Promise<any> {
    const creator = this.creators.get(dto.targetType)!;
    const destinationFolderId = dto.destinationFolderId ?? null;

    // Verify destination folder exists if specified
    if (destinationFolderId !== null) {
      const destFolder = await this.foldersRepo.findOne({ where: { id: destinationFolderId } });
      if (!destFolder) throw new NotFoundException('Destination folder not found');
    }

    // Resolve target
    const target = await creator.resolveTarget(dto.targetId);

    // Verify target exists on disk
    try {
      await fsp.access(target.fsPath);
    } catch {
      throw new UnprocessableEntityException('Symlink target does not exist on disk');
    }

    // Resolve destination directory and create unique symlink path
    const destDir = await this.pathService.folderFsPath(destinationFolderId);
    await this.pathService.ensureDirAsync(destDir);
    const symlinkFsPath = await creator.uniqueSymlinkPath(destDir, target.name);
    const symlinkName = path.basename(symlinkFsPath);

    // Create filesystem symlink
    try {
      await fsp.symlink(target.fsPath, symlinkFsPath);
    } catch (e: any) {
      throw new InternalServerErrorException(`Failed to create symlink on filesystem: ${e.message}`);
    }

    // Create database record
    try {
      return await creator.createRecord({
        name: symlinkName,
        destinationFolderId,
        symlinkFsPath,
        targetId: dto.targetId,
      });
    } catch (e: any) {
      // Best-effort rollback: remove the filesystem symlink
      try { await fsp.unlink(symlinkFsPath); } catch {}
      throw new InternalServerErrorException(`Failed to save symlink record: ${e.message}`);
    }
  }
}
