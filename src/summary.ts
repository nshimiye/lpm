import { formatBytes } from "./scanner.js";
import type { Candidate, PackageManager } from "./types.js";

export function formatScanSummary(candidates: Candidate[], skippedFolders: number): string {
  const withLockfiles = candidates.filter(isRestorable).reduce((sum, item) => sum + item.bytes, 0);
  const withoutLockfiles = candidates.filter((candidate) => !isRestorable(candidate)).reduce((sum, item) => sum + item.bytes, 0);
  const rows = [
    ["Space to claim with lockfiles", formatBytes(withLockfiles)],
    ["Space to claim without lockfiles", formatBytes(withoutLockfiles)],
    ["Skipped folders due to read permissions", String(skippedFolders)]
  ];
  const labelWidth = Math.max(...rows.map(([label]) => label.length));
  return [
    "\nScan summary:",
    `  ${"Metric".padEnd(labelWidth)}  Total`,
    ...rows.map(([label, value]) => `  ${label.padEnd(labelWidth)}  ${value}`)
  ].join("\n");
}

export function isRestorable(candidate: Candidate): candidate is Candidate & { projectPath: string; lockfilePath: string; manager: PackageManager } {
  return Boolean(candidate.projectPath && candidate.lockfilePath && candidate.manager);
}