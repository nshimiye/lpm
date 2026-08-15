#!/usr/bin/env node
import { randomUUID } from "node:crypto";
import { rm, stat, readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { spawn } from "node:child_process";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { formatBytes, lockfileHash, scan } from "./scanner.js";
import { loadRegistry, upsertRecord } from "./state.js";
import type { Candidate, OffloadRecord, PackageManager } from "./types.js";

const HELP = `LPM — reclaim restoreable Node.js dependencies

Usage:
  lpm scan [path]       list node_modules folders (defaults to your home directory)
  lpm offload [path]    select and remove lockfile-backed installations
  lpm list              list LPM offload records
  lpm restore           select an offloaded project and reinstall it
`;

async function main(): Promise<void> {
  const [command, providedPath] = process.argv.slice(2);
  switch (command) {
    case "scan": await scanCommand(providedPath || homedir()); break;
    case "offload": await offloadCommand(providedPath || homedir()); break;
    case "list": await listCommand(); break;
    case "restore": await restoreCommand(); break;
    case "help": case "--help": case "-h": console.log(HELP); break;
    default: console.error(command ? `Unknown command: ${command}\n\n${HELP}` : HELP); process.exitCode = command ? 1 : 0;
  }
}

async function scanCommand(root: string): Promise<void> {
  console.log(`Scanning ${root} …`);
  const result = await scan(root);
  printCandidates(result.candidates);
  printWarnings(result.warnings);
}

async function offloadCommand(root: string): Promise<void> {
  requireInteractive();
  console.log(`Scanning ${root} …`);
  const result = await scan(root);
  const restorable = result.candidates.filter(isRestorable);
  if (restorable.length === 0) {
    console.log("No lockfile-backed node_modules folders were found.");
    printWarnings(result.warnings);
    return;
  }
  console.log("\nRestorable installations:");
  printCandidates(restorable, false);
  const selected = await select(restorable, "Select installations to offload (for example 1,3-5; blank cancels): ");
  if (selected.length === 0) return console.log("No installations selected; nothing changed.");
  console.log(`\nThis will delete ${selected.length} folder(s) and reclaim about ${formatBytes(selected.reduce((sum, item) => sum + item.bytes, 0))}.`);
  if (!await confirm("Continue? [y/N] ")) return console.log("Cancelled; nothing changed.");

  for (const candidate of selected) {
    if (!isRestorable(candidate)) continue;
    try {
      const projectPath = candidate.projectPath;
      const lockfilePath = candidate.lockfilePath;
      const manager = candidate.manager;
      await stat(candidate.modulesPath);
      const hash = await lockfileHash(lockfilePath);
      await rm(candidate.modulesPath, { recursive: true, force: false, maxRetries: 2 });
      await upsertRecord({
        id: randomUUID(), modulesPath: candidate.modulesPath, projectPath,
        lockfilePath, manager, lockfileSha256: hash,
        reclaimedBytes: candidate.bytes, offloadedAt: new Date().toISOString()
      });
      console.log(`Offloaded ${candidate.modulesPath} (${formatBytes(candidate.bytes)}).`);
    } catch (error) {
      console.error(`Could not offload ${candidate.modulesPath}: ${errorMessage(error)}`);
    }
  }
  printWarnings(result.warnings);
}

async function listCommand(): Promise<void> {
  const registry = await loadRegistry();
  if (!registry.records.length) return console.log("No LPM offload records.");
  for (const [index, record] of registry.records.entries()) {
    const [modulesPresent, lockHash] = await Promise.all([exists(record.modulesPath), hashIfPresent(record.lockfilePath)]);
    const status = modulesPresent ? "dependency folder present" : lockHash === record.lockfileSha256 ? "ready to restore" : lockHash ? "lockfile changed" : "lockfile missing";
    console.log(`${index + 1}. ${status} — ${formatBytes(record.reclaimedBytes)} — ${record.modulesPath}`);
  }
}

async function restoreCommand(): Promise<void> {
  requireInteractive();
  const registry = await loadRegistry();
  const candidates = registry.records;
  if (!candidates.length) return console.log("No LPM offload records.");
  console.log("Offloaded installations:");
  candidates.forEach((record, index) => console.log(`${index + 1}. ${record.modulesPath} (${record.manager}, ${formatBytes(record.reclaimedBytes)})`));
  const selected = await select(candidates, "Select one installation to restore (blank cancels): ", true);
  if (!selected.length) return console.log("Nothing selected.");
  const record = selected[0];
  if (await exists(record.modulesPath)) return console.error("node_modules already exists at this path; LPM will not overwrite it.");
  const currentHash = await hashIfPresent(record.lockfilePath);
  if (!currentHash) return console.error(`Lockfile is missing: ${record.lockfilePath}`);
  if (currentHash !== record.lockfileSha256) {
    console.log("The lockfile changed after offload. LPM has no copy of the original lockfile, so the original dependency graph cannot be restored.");
    if (!await confirm("Install the current lockfile's dependency graph instead? [y/N] ")) return console.log("Cancelled.");
  }
  const command = await installCommand(record);
  console.log(`LPM will run in ${record.projectPath}:\n  ${command.executable} ${command.args.join(" ")}`);
  if (!await confirm("Run this install? [y/N] ")) return console.log("Cancelled.");
  await run(command.executable, command.args, record.projectPath);
  record.restoredAt = new Date().toISOString();
  await upsertRecord(record);
  console.log(`Restored ${record.modulesPath}.`);
}

function printCandidates(candidates: Candidate[], includeUnsafe = true): void {
  if (!candidates.length) return console.log("No node_modules folders found.");
  for (const [index, candidate] of candidates.entries()) {
    const label = isRestorable(candidate) ? `${candidate.manager} (${candidate.lockfilePath})` : "non-restorable: no supported lockfile";
    if (includeUnsafe || isRestorable(candidate)) console.log(`${index + 1}. ${formatBytes(candidate.bytes)}  ${candidate.modulesPath}\n   ${label}`);
  }
  console.log(`\nTotal: ${formatBytes(candidates.reduce((sum, item) => sum + item.bytes, 0))} across ${candidates.length} folder(s).`);
}

function printWarnings(warnings: string[]): void {
  if (!warnings.length) return;
  console.error(`\nScan warnings (${warnings.length}):`);
  for (const warning of warnings.slice(0, 20)) console.error(`- ${warning}`);
  if (warnings.length > 20) console.error(`- … ${warnings.length - 20} more`);
}

function isRestorable(candidate: Candidate): candidate is Candidate & { projectPath: string; lockfilePath: string; manager: PackageManager } {
  return Boolean(candidate.projectPath && candidate.lockfilePath && candidate.manager);
}

async function select<T>(items: T[], prompt: string, single = false): Promise<T[]> {
  const answer = await ask(prompt);
  const indices = parseSelection(answer, items.length, single);
  if (!indices.length) return [];
  return indices.map((index) => items[index - 1]);
}

function parseSelection(value: string, length: number, single: boolean): number[] {
  if (!value.trim()) return [];
  const chosen = new Set<number>();
  for (const part of value.split(",")) {
    const match = /^\s*(\d+)(?:\s*-\s*(\d+))?\s*$/.exec(part);
    if (!match) throw new Error(`Invalid selection: ${part}`);
    const from = Number(match[1]), to = Number(match[2] || match[1]);
    if (from < 1 || to < from || to > length || (single && (from !== to || chosen.size))) throw new Error("Selection is out of range.");
    for (let index = from; index <= to; index++) chosen.add(index);
  }
  return [...chosen].sort((a, b) => a - b);
}

async function installCommand(record: OffloadRecord): Promise<{ executable: string; args: string[] }> {
  if (record.manager === "npm") return { executable: "npm", args: ["ci"] };
  if (record.manager === "pnpm") return { executable: "pnpm", args: ["install", "--frozen-lockfile"] };
  if (record.manager === "bun") return { executable: "bun", args: ["install", "--frozen-lockfile"] };
  const packageJson = await readFile(`${record.projectPath}/package.json`, "utf8").catch(() => "{}");
  const yarnVersion = (JSON.parse(packageJson) as { packageManager?: string }).packageManager;
  return { executable: "yarn", args: ["install", yarnVersion?.startsWith("yarn@1") ? "--frozen-lockfile" : "--immutable"] };
}

async function run(executable: string, args: string[], cwd: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(executable, args, { cwd, stdio: "inherit" });
    child.once("error", (error) => reject(new Error(`Could not start ${executable}: ${error.message}`)));
    child.once("exit", (code) => code === 0 ? resolve() : reject(new Error(`${executable} exited with status ${code}`)));
  });
}

function requireInteractive(): void { if (!stdin.isTTY || !stdout.isTTY) throw new Error("This command requires an interactive terminal."); }
async function ask(question: string): Promise<string> { const rl = createInterface({ input: stdin, output: stdout }); try { return await rl.question(question); } finally { rl.close(); } }
async function confirm(question: string): Promise<boolean> { return (await ask(question)).trim().toLowerCase() === "y"; }
async function exists(path: string): Promise<boolean> { try { await stat(path); return true; } catch { return false; } }
async function hashIfPresent(path: string): Promise<string | null> { try { return await lockfileHash(path); } catch { return null; } }
function errorMessage(error: unknown): string { return error instanceof Error ? error.message : String(error); }

main().catch((error) => { console.error(`LPM error: ${errorMessage(error)}`); process.exitCode = 1; });
