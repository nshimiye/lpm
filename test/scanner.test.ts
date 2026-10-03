import assert from "node:assert/strict";
import { chmod, mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
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

test("skips an unreadable folder and continues scanning readable siblings", async (t) => {
  const root = await fixture();
  const blocked = join(root, "blocked");
  try {
    await mkdir(blocked);
    await mkdir(join(root, "app", "node_modules"), { recursive: true });
    await writeFile(join(root, "app", "node_modules", "payload"), "x");
    await chmod(blocked, 0o000);
    const result = await scan(root);
    if (result.skippedFolders === 0) return t.skip("filesystem permissions are bypassed in this test environment");
    assert.equal(result.skippedFolders, 1);
    assert.deepEqual(result.candidates.map((item) => item.modulesPath), [join(root, "app", "node_modules")]);
    assert.ok(result.warnings.some((warning) => warning.startsWith(`${blocked}:`)));
  } finally {
    await chmod(blocked, 0o700).catch(() => undefined);
    await rm(root, { recursive: true, force: true });
  }
});

test("skips an unreadable node_modules folder instead of reporting partial space", async (t) => {
  const root = await fixture();
  const blocked = join(root, "blocked", "node_modules");
  try {
    await mkdir(blocked, { recursive: true });
    await writeFile(join(blocked, "payload"), "x");
    await chmod(blocked, 0o000);
    const result = await scan(root);
    if (result.skippedFolders === 0) return t.skip("filesystem permissions are bypassed in this test environment");
    assert.equal(result.candidates.length, 0);
    assert.equal(result.skippedFolders, 1);
    assert.ok(result.warnings.some((warning) => warning.startsWith(`${blocked}:`)));
  } finally {
    await chmod(blocked, 0o700).catch(() => undefined);
    await rm(root, { recursive: true, force: true });
  }
});
