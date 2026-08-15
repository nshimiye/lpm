# LPM Implementation Plan

## Goal

Create a Node.js CLI that helps developers reclaim disk space by finding local `node_modules` directories, deleting only installations that can be recreated from a lockfile, and restoring those installations later from their package registry.

LPM does not back up package files. An exact restore means reinstalling the dependency graph pinned by the project's lockfile.

## Implemented design

- Build a TypeScript CLI for Node.js 20+ with four commands: `scan`, `offload`, `list`, and `restore`.
- Recursively scan a user-provided directory, defaulting to the home directory, without default directory exclusions.
- Detect top-level `node_modules` directories only; skip nested folders inside an already-found installation so reported sizes are not double-counted.
- Associate each installation with the nearest supported lockfile and package manager:
  - npm: `package-lock.json` or `npm-shrinkwrap.json`
  - pnpm: `pnpm-lock.yaml`
  - Yarn: `yarn.lock`
  - Bun: `bun.lock` or `bun.lockb`
- Report installations without a supported lockfile, but never make them selectable for deletion.
- Require an interactive terminal and explicit confirmation for both destructive deletion and dependency restoration.
- Store only cleanup metadata in `~/.lpm/state.json`: dependency path, project and lockfile paths, detected manager, lockfile SHA-256 fingerprint, reclaimed size, and timestamps.
- Restore with the detected package manager's lockfile-preserving install mode. If the lockfile changed, explain that the original graph cannot be restored without a backup and require confirmation before installing the current locked graph.

## Validation

- Unit tests cover lockfile association, nested-install suppression, non-restorable reporting, and state-record upserts.
- Type checking, production build, CLI scan smoke test, and package dry run must pass.
