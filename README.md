# Wasteland build tools

Fixed FFmpeg tools for development and CI. No game code or game assets are stored here. Binary archives belong in Releases, never Git history. Windows uses WSL2 x64.

Candidate tag: `ffmpeg-8.1-r1`. macOS arm64/x64 use Martin Riedl 8.1.2; Linux x64 uses the BtbN 2026-09-30 GPL build of 8.1.3. Executables are repackaged without modification. `sources.json` records upstream URLs, hashes, build information and the source audit.

## Preparation and verification

Node 22, tar and unzip are required to prepare archives on macOS. No npm packages are needed.

```sh
node scripts/prepare.mjs
node scripts/smoke.mjs dist
```

Preparation accepts an optional directory of previously downloaded upstream archives; each archive is checked against its pinned SHA-256. The generated `dist/manifest.json` contains final archive hashes and executable paths. Publish candidates as a draft and run `Tool portability` on native macOS arm64, macOS x64 and Linux x64 before publication. Anonymous downloads must then be checked against the same hashes.

## Publication gate

**The first candidate is not approved for public binary redistribution yet.** The macOS package contains GPL libraries but does not include corresponding sources. Its x264 recipe downloads floating `master`, and its version report only says `0.165.x`; the exact corresponding revision cannot be proved from those records. A historical build-script revision alone is not a complete source archive.

Before publishing binaries, obtain complete corresponding sources, licenses and build instructions for all bundled libraries, or select an artifact with a complete source record. Record and retain them with the Release. Do not describe partial FFmpeg sources as the complete source bundle.

After both source review and three-platform verification pass, publish the fixed tag. Future upgrades get new tags; preserve previous Releases and do not replace their assets. Never use floating `latest` URLs in consumers.

## Candidate verification (2026-10-06)

[Native portability run](https://github.com/cnImpulse/wasteland-build-tools/actions/runs/37423960399) passed on macOS arm64, macOS x64 and Linux x64. Each platform verifies the archive hash, both executable versions, native dependencies, MP3 encoder and three audio conversion/probe cases. Linux reports the exact version `n8.1.3-9-g29e619e767-20260930`.

The binary candidate remains a draft. This successful run proves portability and audio behavior; the corresponding-source publication gate above is still open.
