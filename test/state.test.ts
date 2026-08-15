import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { loadRegistry, upsertRecord } from "../src/state.js";

test("upserts cleanup records by dependency path", async () => {
  const root = await mkdtemp(join(tmpdir(), "lpm-state-test-"));
  const previous = process.env.LPM_HOME;
  process.env.LPM_HOME = root;
  try {
    const record = { id: "first", modulesPath: "/project/node_modules", projectPath: "/project", lockfilePath: "/project/package-lock.json", manager: "npm" as const, lockfileSha256: "abc", reclaimedBytes: 42, offloadedAt: "2026-01-01T00:00:00.000Z" };
    await upsertRecord(record);
    await upsertRecord({ ...record, id: "second", reclaimedBytes: 84 });
    const registry = await loadRegistry();
    assert.equal(registry.records.length, 1);
    assert.equal(registry.records[0].id, "second");
    assert.equal(registry.records[0].reclaimedBytes, 84);
  } finally {
    if (previous === undefined) delete process.env.LPM_HOME; else process.env.LPM_HOME = previous;
    await rm(root, { recursive: true, force: true });
  }
});
