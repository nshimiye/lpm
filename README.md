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

Restoration runs the detected manager in its lockfile-preserving mode. The remote registry must still be reachable and contain the locked packages; LPM does not retain package artifacts.

## Documentation

- [Implementation plan](docs/implementation-plan.md)
- [`lpm offload` walkthrough](docs/offload-walkthrough.md)
