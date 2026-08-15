# `lpm offload` Walkthrough

`lpm offload` safely reclaims space from installed Node dependencies. It deletes selected `node_modules` folders; it does not move or archive their contents.

## 1. Start a scan

When the user runs:

```sh
lpm offload
```

LPM scans the user's home directory. A narrower scan can be requested with a path:

```sh
lpm offload ~/code
```

The scan walks readable directories, finds `node_modules` folders, calculates their disk use, and omits nested `node_modules` folders inside a discovered installation. This prevents selecting a parent and one of its dependencies separately.

## 2. Determine which folders are safe to remove

For every discovered installation, LPM searches upward for the nearest supported lockfile. It supports npm, pnpm, Yarn, and Bun lockfiles.

Only folders with a supported lockfile appear in the interactive selection list. Folders without one may be shown by `lpm scan`, but LPM will not delete them because it cannot promise a reproducible reinstall.

## 3. Select installations and confirm

LPM prints the restorable installations with numbered entries and their approximate sizes. The user selects one or more entries, for example:

```text
Select installations to offload (for example 1,3-5; blank cancels): 1,3
```

It then displays the number of folders and total expected reclaimed space. Nothing is deleted until the user confirms with `y`. A blank response or any answer other than `y` cancels the operation.

## 4. Delete and record metadata

Immediately before deletion, LPM checks that the selected directory and lockfile still exist and calculates a SHA-256 fingerprint of the lockfile. It removes the selected `node_modules` directory and then saves a record in:

```text
~/.lpm/state.json
```

`~/.lpm/state.json` contains metadata only, not package tarballs, lockfile copies, or dependency files. Each record includes:

- the deleted `node_modules` path;
- the project and lockfile paths;
- the detected package manager;
- the lockfile fingerprint;
- reclaimed disk size; and
- offload and restoration timestamps.

The file is written atomically and with owner-only permissions where supported.

## 5. Restore later

Run `lpm list` to see offloaded installations and whether their lockfiles still match. Then run:

```sh
lpm restore
```

After the user chooses a record, LPM verifies that `node_modules` is still absent and that the lockfile exists. It shows the package-manager command it will run and asks for confirmation.

If the fingerprint matches, LPM runs the appropriate reproducible install command: `npm ci`, pnpm frozen-lockfile install, Yarn frozen/immutable install, or Bun frozen-lockfile install. If the lockfile changed, LPM cannot restore the original graph because it intentionally keeps no backup. It clearly warns the user and requires a separate confirmation before installing the current locked graph.

Restoration still depends on the configured public or private registry being available and retaining the locked package versions.
