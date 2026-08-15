import { createHash } from "node:crypto";
import { access, lstat, readdir, readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import type { Candidate, PackageManager } from "./types.js";

const LOCKFILES: Array<{ file: string; manager: PackageManager }> = [
  { file: "pnpm-lock.yaml", manager: "pnpm" },
  { file: "package-lock.json", manager: "npm" },
  { file: "npm-shrinkwrap.json", manager: "npm" },
  { file: "yarn.lock", manager: "yarn" },
  { file: "bun.lockb", manager: "bun" },
  { file: "bun.lock", manager: "bun" }
];

export interface ScanResult {
  candidates: Candidate[];
  warnings: string[];
}

export async function scan(root: string): Promise<ScanResult> {
  const candidates: Candidate[] = [];
  const warnings: string[] = [];
  const rootPath = resolve(root);

  async function walk(directory: string): Promise<void> {
    let entries;
    try {
      entries = await readdir(directory, { withFileTypes: true });
    } catch (error) {
      warnings.push(`${directory}: ${message(error)}`);
      return;
    }
    for (const entry of entries) {
      const entryPath = join(directory, entry.name);
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) {
        if (entry.name === "node_modules") {
          const bytes = await directorySize(entryPath, warnings);
          const project = await findProject(directory, rootPath);
          candidates.push({ modulesPath: entryPath, bytes, ...project });
          continue; // Avoid listing nested dependency node_modules separately.
        }
        await walk(entryPath);
      }
    }
  }

  await walk(rootPath);
  candidates.sort((a, b) => b.bytes - a.bytes || a.modulesPath.localeCompare(b.modulesPath));
  return { candidates, warnings };
}

async function findProject(start: string, scanRoot: string): Promise<Pick<Candidate, "projectPath" | "lockfilePath" | "manager">> {
  let current = start;
  while (true) {
    const locks = await Promise.all(LOCKFILES.map(async ({ file, manager }) => ({
      file, manager, exists: await exists(join(current, file))
    })));
    const selected = locks.find((lock) => lock.exists);
    if (selected) return { projectPath: current, lockfilePath: join(current, selected.file), manager: selected.manager };
    if (current === scanRoot || dirname(current) === current) break;
    current = dirname(current);
  }
  return { projectPath: null, lockfilePath: null, manager: null };
}

export async function lockfileHash(path: string): Promise<string> {
  return createHash("sha256").update(await readFile(path)).digest("hex");
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KiB", "MiB", "GiB", "TiB"];
  let value = bytes;
  let index = -1;
  do { value /= 1024; index += 1; } while (value >= 1024 && index < units.length - 1);
  return `${value.toFixed(value >= 10 ? 1 : 2)} ${units[index]}`;
}

async function directorySize(directory: string, warnings: string[]): Promise<number> {
  let total = 0;
  async function visit(path: string): Promise<void> {
    let info;
    try { info = await lstat(path); } catch (error) { warnings.push(`${path}: ${message(error)}`); return; }
    if (info.isSymbolicLink()) return;
    if (!info.isDirectory()) { total += info.blocks ? info.blocks * 512 : info.size; return; }
    let entries;
    try { entries = await readdir(path); } catch (error) { warnings.push(`${path}: ${message(error)}`); return; }
    await Promise.all(entries.map((entry) => visit(join(path, entry))));
  }
  await visit(directory);
  return total;
}

async function exists(path: string): Promise<boolean> {
  try { await access(path); return true; } catch { return false; }
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
