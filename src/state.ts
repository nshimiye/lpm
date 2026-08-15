import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import type { OffloadRecord, Registry } from "./types.js";

function statePath(): string {
  return join(process.env.LPM_HOME || join(homedir(), ".lpm"), "state.json");
}

export async function loadRegistry(): Promise<Registry> {
  try {
    const registry = JSON.parse(await readFile(statePath(), "utf8")) as Registry;
    if (registry.version !== 1 || !Array.isArray(registry.records)) throw new Error("unsupported registry format");
    return registry;
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return { version: 1, records: [] };
    throw new Error(`Cannot read LPM state at ${statePath()}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export async function saveRegistry(registry: Registry): Promise<void> {
  const path = statePath();
  await mkdir(join(path, ".."), { recursive: true });
  const temporary = `${path}.${process.pid}.tmp`;
  await writeFile(temporary, `${JSON.stringify(registry, null, 2)}\n`, { mode: 0o600 });
  await rename(temporary, path);
}

export async function upsertRecord(record: OffloadRecord): Promise<void> {
  const registry = await loadRegistry();
  registry.records = registry.records.filter((item) => item.modulesPath !== record.modulesPath);
  registry.records.push(record);
  await saveRegistry(registry);
}
