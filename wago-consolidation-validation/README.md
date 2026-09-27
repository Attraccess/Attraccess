# Wago consolidation validation evidence

The pre-consolidation comparison used `54d2d508c2644eca90d02194a3da4199881a4008`. The refreshed package and image checks were run from the assigned `attraccess` workspace at PR head `f231f3cc720be654fb02db8d0f9849c169ace64b`.

## Nx discovery and targets

`nx-project.json` records `pnpm nx show project plugin-wago --json`; it discovers the single Wago project and the prefixed CC100 targets. `plugin-root-checks.log` records the workspace-root `lint,test,typecheck,build` run: Nx succeeded, lint accepted 247 Wago files and four negative boundary probes, and Jest reported 1,363 passing tests. `cc100-checks.log` records an uncached run of CC100 runtime lint/test/typecheck/build, simulator build, and simulator integration: Nx succeeded, 256 runtime tests and eight integration tests passed.

## Package comparison

`npm-pack-comparison.json` retains both 14-file npm pack inventories, sizes, SHA-256 hashes, and the normalized file-by-file comparison. The refreshed PR-head tarball has SHA-1 `f361163525949d88cf28d6941f129fd11ca73e20`, matching the compared current tarball, and every packed file hash matches its prior current inventory. `compare-npm-packs.mjs` documents the comparison. It normalizes only dependency paths from the detached worktree's `node_modules` symlink and Vite's content-hashed JS filenames/references; all normalized file contents match. Pack logs are `baseline-pack.log`, `current-pack.log`, and the PR-head output in `../.rocky-evidence/attraccess-pr-head-plugin-and-cc100.log`.

## Runtime image comparison

`baseline-image-build.log`, `current-image-build.log`, and `../.rocky-evidence/attraccess-cc100-image-build-pr-head.log` retain successful Buildx builds requested for `linux/arm/v7`. The fresh PR-head build has different OCI manifest/config digests from the earlier build. Direct comparison of the PR-head image and retained baseline image confirms the same ARMv7 platform, user `runtime`, workdir `/app`, command `node main.cjs`, entrypoint, volume `/var/lib/attraccess-wago`, and identical SHA-256 hashes for all four `/app` files. These results are recorded in `image-comparison.json` and `../.rocky-evidence/attraccess-image-comparison-pr-head.json`.

The PR-head image build and package pack succeeded. The runtime comparison inspects both images and compares their `/app` file hashes; the simulator integration passed 8 tests. The Wago workflow source continues to request `linux/arm/v7` and tags `ghcr.io/attraccess/wago-cc100-runtime:${{ github.sha }}` on pushes to `main`.
