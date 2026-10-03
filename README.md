# LPM — Local Package Manager

LPM finds `node_modules` folders, reports their disk use, and safely removes selected installations that can be recreated from a supported lockfile. It stores only small metadata records; package files are never backed up.

## Install and run

```sh
npm install
npm run build
node dist/cli.js scan
```

The default scan target is your home directory. Pass a path to limit it:

```sh
lpm scan ~/code
lpm offload ~/code
lpm list
lpm restore
```

`offload` and `restore` are always interactive. LPM supports npm, pnpm, Yarn, and Bun lockfiles. A `node_modules` folder without a supported lockfile is reported but cannot be removed by LPM.

In a terminal, `scan` opens a navigable summary. Use ↑/↓ to select a total and Enter to see parent directory names and reclaimable sizes. Use ↑/↓ to scroll, Escape to return, and `q` or Ctrl+C to exit. The permissions metric displays `N/A`. Same-named directories appear as separate rows; redirect output to retain the full-path report.

LPM uses a Matrix-style green theme, including labeled warnings and errors. Set `NO_COLOR` to disable colors. Redirected output stays plain; `TERM=dumb` also disables the interactive summary. Offload/restore confirmations are unchanged, and package managers control their own install output.

Restoration runs the detected manager in its lockfile-preserving mode. The remote registry must still be reachable and contain the locked packages; LPM does not retain package artifacts.

## Documentation

Press Enter on a folder in the scan table to see its full path, project path, size, package manager, lockfile, and restore command with its working directory. Long details wrap; ↑/↓ scrolls. Escape returns to the same selected folder. Unsupported installations show `N/A` for the restore command. This view only displays information and never runs an install.

- [Implementation plan](docs/implementation-plan.md)
- [`lpm offload` walkthrough](docs/offload-walkthrough.md)
