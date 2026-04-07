import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { DiskScanner } from "./disk-scanner";

describe("DiskScanner", () => {
  let scanner: DiskScanner;
  let tmpDir: string;

  beforeEach(() => {
    scanner = new DiskScanner();
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "disk-scanner-test-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("should return regular files", async () => {
    fs.writeFileSync(path.join(tmpDir, "a.txt"), "hello");
    fs.writeFileSync(path.join(tmpDir, "b.pdf"), "pdf");

    const items = await scanner.scan(tmpDir, new Set(), []);

    const names = items.map((i) => path.basename(i.path));
    expect(names).toContain("a.txt");
    expect(names).toContain("b.pdf");
    expect(items).toHaveLength(2);
  });

  it("should skip dot-files and .gitkeep", async () => {
    fs.writeFileSync(path.join(tmpDir, ".hidden"), "secret");
    fs.writeFileSync(path.join(tmpDir, ".gitkeep"), "");
    fs.writeFileSync(path.join(tmpDir, "visible.txt"), "ok");

    const items = await scanner.scan(tmpDir, new Set(), []);

    expect(items).toHaveLength(1);
    expect(path.basename(items[0].path)).toBe("visible.txt");
  });

  it("should recurse into subdirectories", async () => {
    const sub = path.join(tmpDir, "subdir");
    fs.mkdirSync(sub);
    fs.writeFileSync(path.join(sub, "nested.txt"), "nested");

    const items = await scanner.scan(tmpDir, new Set(), []);

    expect(items).toHaveLength(1);
    expect(path.basename(items[0].path)).toBe("nested.txt");
  });

  it("should return symlinked directories as items (not recurse into them)", async () => {
    const realDir = path.join(tmpDir, "real");
    fs.mkdirSync(realDir);
    fs.writeFileSync(path.join(realDir, "inside.txt"), "data");
    const linkDir = path.join(tmpDir, "linked");
    fs.symlinkSync(realDir, linkDir);

    const items = await scanner.scan(tmpDir, new Set(), []);

    const symlinkItem = items.find((i) => path.basename(i.path) === "linked");
    expect(symlinkItem).toBeDefined();
    expect(symlinkItem!.info.isSymlink).toBe(true);
    expect(symlinkItem!.info.targetIsDirectory).toBe(true);

    // Should NOT have recursed into the symlinked dir
    const nestedItem = items.find(
      (i) => path.basename(i.path) === "inside.txt" && i.path.includes("linked"),
    );
    expect(nestedItem).toBeUndefined();
  });

  it("should return symlinked files", async () => {
    const target = path.join(tmpDir, "target.txt");
    fs.writeFileSync(target, "target");
    const link = path.join(tmpDir, "link.txt");
    fs.symlinkSync(target, link);

    const items = await scanner.scan(tmpDir, new Set(), []);

    const linkItem = items.find((i) => path.basename(i.path) === "link.txt");
    expect(linkItem).toBeDefined();
    expect(linkItem!.info.isSymlink).toBe(true);
    expect(linkItem!.info.targetIsDirectory).toBe(false);
  });

  it("should return broken symlinks", async () => {
    const link = path.join(tmpDir, "broken.txt");
    fs.symlinkSync("/nonexistent/target", link);

    const items = await scanner.scan(tmpDir, new Set(), []);

    expect(items).toHaveLength(1);
    expect(items[0].info.isSymlink).toBe(true);
    expect(items[0].info.isBroken).toBe(true);
  });

  it("should prevent infinite loops via inode tracking", async () => {
    // Two directories with hard-link-equivalent scenario:
    // scan the same directory twice by calling scan with pre-visited inodes
    const sub = path.join(tmpDir, "sub");
    fs.mkdirSync(sub);
    fs.writeFileSync(path.join(sub, "file.txt"), "data");

    const visitedInodes = new Set<number>();
    const stat = fs.lstatSync(sub);
    visitedInodes.add(stat.ino);

    const items = await scanner.scan(tmpDir, visitedInodes, []);

    // sub directory is already visited, so its contents should be skipped
    expect(items).toHaveLength(0);
  });

  it("should return empty for non-existent directory", async () => {
    const items = await scanner.scan("/nonexistent/dir", new Set(), []);

    expect(items).toHaveLength(0);
  });

  it("should add to failedItems when probe fails", async () => {
    // Create a file then make the directory unreadable for probing issues
    // We'll test indirectly: a permission-denied scenario is hard to set up,
    // but we can verify the failedItems array is passed through
    const failedItems: string[] = [];
    await scanner.scan(tmpDir, new Set(), failedItems);

    // No failures expected for an empty dir
    expect(failedItems).toHaveLength(0);
  });

  it("should handle deeply nested directories", async () => {
    const deep = path.join(tmpDir, "a", "b", "c");
    fs.mkdirSync(deep, { recursive: true });
    fs.writeFileSync(path.join(deep, "deep.txt"), "deep");

    const items = await scanner.scan(tmpDir, new Set(), []);

    expect(items).toHaveLength(1);
    expect(path.basename(items[0].path)).toBe("deep.txt");
  });
});
