import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { scan } from "../src/scanner.js";

async function fixture(): Promise<string> { return mkdtemp(join(tmpdir(), "lpm-test-")); }

test("associates a node_modules folder with its nearest supported lockfile", async () => {
  const root = await fixture();
  try {
    await mkdir(join(root, "app", "node_modules"), { recursive: true });
    await writeFile(join(root, "app", "pnpm-lock.yaml"), "lockfileVersion: '9.0'\n");
    await writeFile(join(root, "app", "node_modules", "payload"), "x");
    const result = await scan(root);
    assert.equal(result.candidates.length, 1);
    assert.equal(result.candidates[0].manager, "pnpm");
    assert.equal(result.candidates[0].projectPath, join(root, "app"));
    assert.equal(result.candidates[0].lockfilePath, join(root, "app", "pnpm-lock.yaml"));
    assert.ok(result.candidates[0].bytes > 0);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("does not separately list node_modules nested inside an installation", async () => {
  const root = await fixture();
  try {
    await mkdir(join(root, "app", "node_modules", "dependency", "node_modules"), { recursive: true });
    await writeFile(join(root, "app", "package-lock.json"), "{}\n");
    await writeFile(join(root, "app", "node_modules", "dependency", "node_modules", "payload"), "x");
    const result = await scan(root);
    assert.deepEqual(result.candidates.map((item) => item.modulesPath), [join(root, "app", "node_modules")]);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("reports an installation without a lockfile as non-restorable", async () => {
  const root = await fixture();
  try {
    await mkdir(join(root, "app", "node_modules"), { recursive: true });
    const result = await scan(root);
    assert.equal(result.candidates[0].manager, null);
    assert.equal(result.candidates[0].lockfilePath, null);
  } finally { await rm(root, { recursive: true, force: true }); }
});
