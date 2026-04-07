import { SymlinkInfo } from "./probe-entry";

export interface ImportItemResult {
  type: "file" | "folder";
  name: string;
}

export interface ImportItemHandler {
  canHandle(info: SymlinkInfo): boolean;
  handle(
    itemPath: string,
    folderId: string | null,
    info: SymlinkInfo,
    existingPaths: Set<string>,
  ): Promise<ImportItemResult | null>;
}

export const IMPORT_ITEM_HANDLERS = "IMPORT_ITEM_HANDLERS";
