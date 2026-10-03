import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { PackageManager } from "./types.js";

export async function installCommand(record: { manager: PackageManager; projectPath: string }): Promise<{ executable: string; args: string[] }> {
  if (record.manager === "npm") return { executable: "npm", args: ["ci"] };
  if (record.manager === "pnpm") return { executable: "pnpm", args: ["install", "--frozen-lockfile"] };
  if (record.manager === "bun") return { executable: "bun", args: ["install", "--frozen-lockfile"] };
  const packageJson = await readFile(join(record.projectPath, "package.json"), "utf8").catch(() => "{}");
  const yarnVersion = (JSON.parse(packageJson) as { packageManager?: string }).packageManager;
  return { executable: "yarn", args: ["install", yarnVersion?.startsWith("yarn@1") ? "--frozen-lockfile" : "--immutable"] };
}
