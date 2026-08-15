export type PackageManager = "npm" | "pnpm" | "yarn" | "bun";

export interface Candidate {
  modulesPath: string;
  projectPath: string | null;
  lockfilePath: string | null;
  manager: PackageManager | null;
  bytes: number;
}

export interface OffloadRecord {
  id: string;
  modulesPath: string;
  projectPath: string;
  lockfilePath: string;
  manager: PackageManager;
  lockfileSha256: string;
  reclaimedBytes: number;
  offloadedAt: string;
  restoredAt?: string;
}

export interface Registry {
  version: 1;
  records: OffloadRecord[];
}
