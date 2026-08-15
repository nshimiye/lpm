  # LPM: Reclaim and Restore Node Dependencies

  ## Summary

  Build LPM as a TypeScript/Node CLI that scans the user’s entire home directory for installed Node dependency trees,
  reports their disk use, interactively deletes selected restorable installations, and later reinstalls the exact locked
  dependency graph from the project’s existing lockfile.

  LPM stores metadata only; it never backs up node_modules contents.

  ## Key Changes

  - Implement lpm scan [path]:
      - Default to the user’s home directory; accept an explicit directory to narrow scanning.
      - Recursively find node_modules folders, calculate each folder’s on-disk size, and show a size-ranked table.
      - Do not apply default exclusions; report unreadable paths as scan warnings.
      - Suppress node_modules folders nested under another discovered node_modules so sizes are not double-counted.
      - Map each candidate to its nearest project lockfile. Support npm (package-lock.json/npm-shrinkwrap.json), pnpm, Yarn,
        and Bun.

      - Mark entries without a supported lockfile as non-restorable and never offer them for deletion.

  - Implement an interactive lpm offload [path] workflow:
      - Run the same discovery, present only restorable top-level installations for multi-selection, and show total
        reclaimable space.

      - Before deleting, revalidate that the selected node_modules directory and lockfile still exist, then require explicit
        terminal confirmation.

      - Delete only the selected node_modules directories; no force or non-interactive deletion mode in v1.
      - Save a cleanup record in ~/.lpm, atomically, containing the project path, deleted directory path, size reclaimed,
        detected package manager, lockfile path, lockfile SHA-256, and timestamps.

  - Implement lpm list and lpm restore:
      - list shows active offload records and whether the project, lockfile, and dependency directory still match
        expectations.

      - restore lets the user select an offloaded record, verifies its lockfile fingerprint, displays the planned package-
        manager command, and requires confirmation before running it.

      - Run the manager’s lockfile-preserving install mode: npm ci, pnpm frozen-lockfile install, Yarn’s appropriate frozen/
        immutable mode, or Bun frozen-lockfile install.

      - If the lockfile changed, refuse normal restoration and clearly explain that LPM has no backup of the original state;
        allow only an explicit confirmation to install the project’s current locked dependency graph.

      - Preserve the offload record if installation fails; mark it restored only after a successful install.

  - Package the CLI for Node 20+ with a documented install/run path and clear errors for unavailable package-manager
    executables, failed registry access, private-registry authentication, and unsupported project layouts.

  ## Test Plan

  - Unit-test lockfile and package-manager detection, nearest-project association, nested-folder suppression, disk-size
    aggregation, and cleanup-registry read/write/fingerprint behavior.

  - Integration-test scan, selection eligibility, confirmed deletion, cancellation, unreadable directories, missing
    lockfiles, stale paths, and changed lockfiles using temporary fixtures.

  - Stub each package-manager command to verify LPM invokes the correct immutable/frozen install command only after
    confirmation.

  - Verify that a lockfile-identical project can be offloaded and restored, while a changed lockfile is blocked unless the
    user explicitly chooses to rebuild the current locked state.

  ## Assumptions

  - “Exact restore” means recreating the dependency graph pinned in the project’s current lockfile; it cannot guarantee
    availability of packages removed from remote/private registries.

  - Whole-home scanning includes hidden directories and tool caches when readable, as requested.
  - LPM does not copy lockfiles or package artifacts, and ~/.lpm contains metadata only.