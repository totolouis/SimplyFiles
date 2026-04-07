import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository, DataSource, IsNull } from "typeorm";
import { Folder } from "./folder.entity";
import { PathService } from "../../common/path.service";
import { SearchGotoResponse } from "./dto/search-goto.dto";
import * as fsp from "fs/promises";
import * as path from "path";

@Injectable()
export class FoldersService {
  private readonly logger = new Logger(FoldersService.name);

  constructor(
    @InjectRepository(Folder) private foldersRepo: Repository<Folder>,
    private pathService: PathService,
    private dataSource: DataSource,
  ) {}

  async create(name: string, parentId: string | null): Promise<Folder> {
    const folder = this.foldersRepo.create({ name, parentId });
    await this.foldersRepo.save(folder);

    // Create the directory on disk
    const dir = await this.pathService.folderFsPath(folder.id);
    this.pathService.ensureDir(dir);
    this.logger.log(`Created folder dir: ${dir}`);

    return folder;
  }

  async findAll(): Promise<Folder[]> {
    return this.foldersRepo.find({ order: { name: "ASC" } });
  }

  async findById(
    id: string,
  ): Promise<{ folder: Folder; folders: Folder[]; files: unknown[] }> {
    const folder = await this.foldersRepo.findOne({ where: { id } });
    if (!folder) throw new NotFoundException("Folder not found");

    // For symlink folders, resolve to the target folder's contents
    const effectiveFolderId =
      folder.isSymlink && folder.symlinkTargetId ? folder.symlinkTargetId : id;

    const folders = await this.foldersRepo.find({
      where: { parentId: effectiveFolderId },
      order: { name: "ASC" },
    });
    const files = await this.findFilesInFolder(effectiveFolderId);

    return { folder, folders, files };
  }

  async getRootContents(): Promise<{ folders: Folder[]; files: unknown[] }> {
    const folders = await this.foldersRepo.find({
      where: { parentId: IsNull() },
      order: { name: "ASC" },
    });
    const files = await this.findFilesInFolder(null);
    return { folders, files };
  }

  private async findFilesInFolder(folderId: string | null): Promise<unknown[]> {
    const condition = folderId !== null ? "f.folder_id = $1" : "f.folder_id IS NULL";
    const params = folderId !== null ? [folderId] : [];
    return this.dataSource.query(
      `SELECT f.id, f.filename, f.folder_id AS "folderId", f.mime_type AS "mimeType",
              f.size, f.storage_path AS "storagePath", f.created_at AS "createdAt",
              f.is_symlink AS "isSymlink",
              CASE
                WHEN NOT EXISTS (SELECT 1 FROM file_index_chunks c WHERE c.file_id = f.id) THEN 'pending'
                WHEN EXISTS (SELECT 1 FROM file_index_chunks c WHERE c.file_id = f.id AND c.content_text != '') THEN 'indexed'
                ELSE 'no_content'
              END AS "indexStatus"
       FROM files f WHERE ${condition} AND f.deleted_at IS NULL ORDER BY f.created_at DESC`,
      params,
    );
  }

  async rename(id: string, name: string): Promise<Folder> {
    const folder = await this.foldersRepo.findOne({ where: { id } });
    if (!folder) throw new NotFoundException("Folder not found");

    const oldDir = await this.pathService.folderFsPath(id);
    folder.name = name;
    await this.foldersRepo.save(folder);
    const newDir = await this.pathService.folderFsPath(id);

    // Move the directory on disk (rename on a symlink renames the symlink node)
    try {
      await fsp.access(oldDir);
      if (oldDir !== newDir) {
        await fsp.mkdir(path.dirname(newDir), { recursive: true });
        await fsp.rename(oldDir, newDir);
        this.logger.log(`Renamed folder: ${oldDir} → ${newDir}`);

        // Symlinked folders have no child file records — skip path update
        if (!folder.isSymlink) {
          await this.updateStoragePathsUnder(id, oldDir, newDir);
        }
      }
    } catch {}

    return folder;
  }

  async move(id: string, parentId: string | null): Promise<Folder> {
    const folder = await this.foldersRepo.findOne({ where: { id } });
    if (!folder) throw new NotFoundException("Folder not found");

    // Cannot move a folder into itself or its descendants
    if (parentId === id) {
      throw new BadRequestException("Cannot move a folder into itself");
    }

    if (parentId !== null) {
      // Use a recursive CTE to get all descendant folder IDs in one query
      const descendants: Array<{ id: string }> = await this.dataSource.query(
        `WITH RECURSIVE tree AS (
           SELECT id FROM folders WHERE parent_id = $1
           UNION ALL
           SELECT f.id FROM folders f INNER JOIN tree t ON f.parent_id = t.id
         )
         SELECT id FROM tree`,
        [id],
      );
      const descendantIds = new Set(descendants.map((d) => d.id));
      if (descendantIds.has(parentId)) {
        throw new BadRequestException(
          "Cannot move a folder into its own subfolder",
        );
      }
    }

    const oldDir = await this.pathService.folderFsPath(id);
    folder.parentId = parentId;
    await this.foldersRepo.save(folder);
    const newDir = await this.pathService.folderFsPath(id);

    // Move the directory on disk
    try {
      await fsp.access(oldDir);
      if (oldDir !== newDir) {
        await fsp.mkdir(path.dirname(newDir), { recursive: true });
        await fsp.rename(oldDir, newDir);
        this.logger.log(`Moved folder: ${oldDir} → ${newDir}`);

        // Update storage_path for all files under this folder (recursively)
        await this.updateStoragePathsUnder(id, oldDir, newDir);
      }
    } catch {}

    return folder;
  }

  async delete(id: string): Promise<void> {
    const folder = await this.foldersRepo.findOne({ where: { id } });
    if (!folder) throw new NotFoundException("Folder not found");
    this.logger.log(`Soft-deleting folder: "${folder.name}" (id=${id})`);

    const now = new Date();

    // Soft-delete all descendant folders and their files using a recursive CTE
    await this.dataSource.query(
      `WITH RECURSIVE tree AS (
         SELECT id FROM folders WHERE id = $1
         UNION ALL
         SELECT f.id FROM folders f INNER JOIN tree t ON f.parent_id = t.id
         WHERE f.deleted_at IS NULL
       )
       UPDATE folders SET deleted_at = $2 WHERE id IN (SELECT id FROM tree)`,
      [id, now],
    );

    // Soft-delete all files under the folder tree
    await this.dataSource.query(
      `WITH RECURSIVE tree AS (
         SELECT id FROM folders WHERE id = $1
         UNION ALL
         SELECT f.id FROM folders f INNER JOIN tree t ON f.parent_id = t.id
       )
       UPDATE files SET deleted_at = $2 WHERE folder_id IN (SELECT id FROM tree)`,
      [id, now],
    );
  }

  async permanentDelete(id: string): Promise<void> {
    const folder = await this.foldersRepo.findOne({
      where: { id },
      withDeleted: true,
    });
    if (!folder) return;

    const dir = await this.pathService.folderFsPath(id, true);

    await this.foldersRepo.remove(folder);

    try {
      if (folder.isSymlink) {
        await fsp.lstat(dir);
        await fsp.unlink(dir);
        this.logger.log(`Removed symlink folder: ${dir}`);
      } else {
        await fsp.access(dir);
        await fsp.rm(dir, { recursive: true, force: true });
        this.logger.log(`Removed folder dir: ${dir}`);
      }
    } catch {}
  }

  /**
   * After a rename/move, update storage_path in the DB for every file
   * that lives under the renamed directory (any depth).
   * Uses a recursive CTE to find all descendant folders in one query,
   * then batch-updates all affected files with a single UPDATE statement.
   */
  private async updateStoragePathsUnder(
    folderId: string,
    oldBase: string,
    newBase: string,
  ): Promise<void> {
    // Single query: update all files under this folder tree whose path starts with oldBase
    await this.dataSource.query(
      `WITH RECURSIVE tree AS (
         SELECT id FROM folders WHERE id = $1
         UNION ALL
         SELECT f.id FROM folders f INNER JOIN tree t ON f.parent_id = t.id
       )
       UPDATE files
       SET storage_path = $3 || substr(storage_path, $4::int)
       WHERE folder_id IN (SELECT id FROM tree)
         AND storage_path LIKE $2 || '%'`,
      [folderId, oldBase, newBase, oldBase.length + 1],
    );
  }

  async searchGotoFolders(
    query: string,
    page: number = 0,
    limit: number = 20,
  ): Promise<SearchGotoResponse> {
    // Get all folders
    const allFolders = await this.foldersRepo.find();

    // Build a map of folder id to folder
    const folderMap = new Map<string, Folder>();
    for (const folder of allFolders) {
      folderMap.set(folder.id, folder);
    }

    // Build full paths for each folder
    const foldersWithPaths: Array<{
      folder: Folder;
      fullPath: string;
      depth: number;
    }> = [];
    for (const folder of allFolders) {
      const pathParts: string[] = [];
      let current: Folder | null = folder;
      let depth = 0;

      while (current) {
        pathParts.unshift(current.name);
        depth++;
        if (current.parentId) {
          current = folderMap.get(current.parentId) || null;
        } else {
          current = null;
        }
      }

      foldersWithPaths.push({
        folder,
        fullPath: "/" + pathParts.join("/"),
        depth,
      });
    }

    // Filter based on query
    let filtered = foldersWithPaths;

    if (query.includes(",")) {
      // Sequence mode: split by comma, trim, filter empty
      const tokens = query
        .split(",")
        .map((t) => t.trim())
        .filter((t) => t.length > 0);

      if (tokens.length > 0) {
        // Build regex pattern: token1.*token2.*token3 (case-insensitive)
        const escapedTokens = tokens.map((t) => this.escapeRegex(t));
        const pattern = new RegExp(escapedTokens.join(".*"), "i");

        filtered = foldersWithPaths.filter(({ fullPath }) =>
          pattern.test(fullPath),
        );
      }
    } else {
      // Text mode: search folder names (case-insensitive)
      const searchTerm = query.toLowerCase();
      filtered = foldersWithPaths.filter(({ folder }) =>
        folder.name.toLowerCase().includes(searchTerm),
      );
    }

    // Sort by depth (ascending)
    filtered.sort((a, b) => a.depth - b.depth);

    // Pagination
    const total = filtered.length;
    const totalPages = Math.ceil(total / limit);
    const start = page * limit;
    const end = start + limit;
    const paginated = filtered.slice(start, end);

    return {
      results: paginated.map(({ folder, fullPath, depth }) => ({
        id: folder.id,
        name: folder.name,
        fullPath,
        depth,
      })),
      total,
      page,
      totalPages,
    };
  }

  private escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }
}
