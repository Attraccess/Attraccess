# ATT-1079 validation evidence

Validation was run from the assigned `attraccess` workspace at `4c0069e36e7c8821cebb5ca9f594cef8ae59179f`. The pre-consolidation comparison used `54d2d508c2644eca90d02194a3da4199881a4008`.

## Nx discovery and targets

`nx-project.json` records `pnpm nx show project plugin-wago --json`; it discovers the single Wago project and the prefixed CC100 targets. `plugin-root-checks.log` records the workspace-root `lint,test,typecheck,build` run: Nx succeeded, lint accepted 247 Wago files and four negative boundary probes, and Jest reported 1,363 passing tests. `cc100-checks.log` records an uncached run of CC100 runtime lint/test/typecheck/build, simulator build, and simulator integration: Nx succeeded, 256 runtime tests and eight integration tests passed.

## Package comparison

`npm-pack-comparison.json` retains both 14-file npm pack inventories, sizes, SHA-256 hashes, and the normalized file-by-file comparison. `compare-npm-packs.mjs` documents the comparison. It normalizes only dependency paths from the detached worktree's `node_modules` symlink and Vite's content-hashed JS filenames/references; all normalized file contents match. The pack command logs are `baseline-pack.log` and `current-pack.log`.

## Runtime image comparison

`baseline-image-build.log` and `current-image-build.log` retain successful Buildx builds requested for `linux/arm/v7`. Both emitted identical OCI manifest and image config SHA-256 digests, recorded in `image-comparison.json`; this establishes identical image layers and runtime config. Before OrbStack stopped, direct inspection of the baseline image confirmed user `runtime`, workdir `/app`, command `node main.cjs`, and volume `/var/lib/attraccess-wago`; its four `/app` file hashes are recorded there. The current build emitted the same image digests.

The current image build and both artifact builds succeeded. OrbStack stopped before a direct current-image `docker inspect` or container smoke run; its restart was denied while creating logs outside the assigned workspace. The byte-identical OCI manifest plus the passing current simulator integration provide the retained runtime comparison. The Wago workflow source continues to request `linux/arm/v7` and tags `ghcr.io/attraccess/wago-cc100-runtime:${{ github.sha }}` on pushes to `main`.
