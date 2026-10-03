import assert from "node:assert/strict";
import test from "node:test";
import { formatScanSummary } from "../src/summary.js";
import type { Candidate } from "../src/types.js";

test("formats separate lockfile and non-lockfile scan totals", () => {
  const candidates: Candidate[] = [
    { modulesPath: "/project/node_modules", projectPath: "/project", lockfilePath: "/project/package-lock.json", manager: "npm", bytes: 2048 },
    { modulesPath: "/other/node_modules", projectPath: null, lockfilePath: null, manager: null, bytes: 1024 }
  ];
  const summary = formatScanSummary(candidates, 3);
  assert.match(summary, /Space to claim with lockfiles\s+2\.00 KiB/);
  assert.match(summary, /Space to claim without lockfiles\s+1\.00 KiB/);
  assert.match(summary, /Skipped folders due to read permissions\s+3/);
});