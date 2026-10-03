import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { installCommand } from "../src/install-command.js";
import { folderInfo } from "../src/summary-view.js";

test("shared commands cover npm, pnpm and Bun", async () => {
  for (const manager of ["npm", "pnpm", "bun"] as const) {
    assert.deepEqual(await installCommand({ manager, projectPath: "/unused" }), {
      executable: manager, args: manager === "npm" ? ["ci"] : ["install", "--frozen-lockfile"]
    });
  }
});

test("Yarn preview handles both versions, missing metadata and invalid metadata", async () => {
  const projectPath = await mkdtemp(join(tmpdir(), "lpm-command-"));
  try {
    const candidate = { manager: "yarn" as const, projectPath, modulesPath: join(projectPath, "node_modules"), lockfilePath: join(projectPath, "yarn.lock"), bytes: 1 };
    assert.deepEqual((await installCommand(candidate)).args, ["install", "--immutable"]);
    for (const version of ["yarn@1.22.22", "yarn@4.0.0"]) {
      await writeFile(join(projectPath, "package.json"), JSON.stringify({ packageManager: version }));
      const flag = version.startsWith("yarn@1") ? "--frozen-lockfile" : "--immutable";
      assert.deepEqual((await installCommand(candidate)).args, ["install", flag]);
      assert.ok((await folderInfo(candidate)).includes(`Restore command: yarn install ${flag}`));
    }
    await writeFile(join(projectPath, "package.json"), "invalid json");
    await assert.rejects(installCommand(candidate));
    assert.match((await folderInfo(candidate)).join("\n"), /Restore command: unavailable/);
  } finally { await rm(projectPath, { recursive: true, force: true }); }
});
