# Attractap Hardware

PCB designs for the Attractap V2 modular hardware platform. Boards are authored
in [tscircuit](https://tscircuit.com) (TypeScript / React) and built via nx.

## Toolchain

| Tool | Version | Pinned |
|------|---------|--------|
| `tscircuit` | `0.0.1774` | 2026-05-21 |
| `@tscircuit/cli` | `0.1.1399` | 2026-05-21 |

Each board project under `apps/attractap/hardware/<board>/` is a pnpm
workspace member (see root `pnpm-workspace.yaml`) and pins these two
packages in its own `package.json`. The workspace boundary isolates
tscircuit's `zod@3`-based transitive deps from the rest of the repo, which
runs on `zod@4`. Bump both pins together when upgrading and update the date
above.

The Node-friendly entrypoint is `tscircuit-cli` (from `@tscircuit/cli`); the
shorter `tsci` bin in the `tscircuit` wrapper uses `#!/usr/bin/env bun` and
is therefore avoided in CI. `tscircuit-cli` falls back to `tsx` automatically
when `bun` is absent, so every board pins `tsx` too.

## Layout

```
apps/attractap/hardware/
  README.md                    # this file
  scripts/
    render-png.mjs             # shared SVG → PNG converter
  _placeholder/                # one-LED smoke-test board (remove once Beeper lands)
    index.tsx                  # tscircuit JSX entry
    project.json               # nx targets
    package.json               # project marker
    tsconfig.json
  <board>/                     # one directory per real board (Phase 1.5+)
```

The connector pinouts and JLC-parts wrappers shared by every board live in
`libs/attractap-hw-shared/` (Phase 1 P1-SharedLib ticket — not part of this
bootstrap).

## nx targets (per board)

Every board exposes the same four targets. Run any of them with
`pnpm nx run attractap-hw-<board>:<target>`.

| Target | Command | Output |
|--------|---------|--------|
| `build` | `tscircuit-cli export -f circuit-json` | `<board>/dist/build/<board>.circuit.json` |
| `export` | `tscircuit-cli export -f gerbers` | `<board>/dist/export/<board>-gerbers.zip` (gerbers, drill, `bom.csv`, `pick_and_place.csv` — drop-in JLCPCB SMT order) |
| `render` | `tscircuit-cli export -f pcb-svg/schematic-svg/assembly-svg` + `sharp` | `<board>/dist/render/<board>-{pcb,schematic,assembly}.{svg,png}` |
| `lint` | `tscircuit-cli build --ignore-warnings` | DRC + ERC; non-zero exit on violation |

Run all boards at once:

```bash
pnpm nx run-many -t lint,build,export,render --projects=tag:scope:hardware
```

Affected only (mirrors CI):

```bash
pnpm nx affected -t lint,build,export,render
```

## Adding a new board

1. Create `apps/attractap/hardware/<board>/`.
2. Copy `_placeholder/{project.json,package.json,tsconfig.json,index.tsx}` and
   rename:
   - `package.json` `name` → `@attraccess/attractap-hw-<board>`.
   - `project.json` `name` → `attractap-hw-<board>`, `sourceRoot` →
     `apps/attractap/hardware/<board>`, each `cwd` → same path.
   - swap every `_placeholder` filename token for `<board>`.
3. Tag the project with `scope:hardware` and `type:board`. Add `type:hw-lib`
   instead if you're authoring a library, not a fabricated board.
4. Run `pnpm install` once so pnpm picks up the new workspace member.
5. Edit `index.tsx`: import from `@attraccess/attractap-hw-shared` for
   connector pinouts and JLC-parts wrappers (Phase 1 P1-SharedLib ticket).
6. Run `pnpm nx run attractap-hw-<board>:lint` locally to confirm DRC/ERC are
   green.
7. Push — `hardware.yml` will produce gerber ZIP + render PNGs on the PR.

## JLCPCB upload workflow

1. Open the PR and download the `gerbers` artifact from the `hardware`
   workflow run.
2. Unzip — the archive contains:
   - `*.gbr` / `*.gtl` / `*.gbl` / etc. — gerber layers.
   - `drill.drl` / `drill_npth.drl` — Excellon drill files.
   - `bom.csv` — JLC-format BOM (LCSC PNs in the `LCSC Part #` column).
   - `pick_and_place.csv` — CPL pick-and-place file.
3. On [jlcpcb.com](https://jlcpcb.com), upload the full ZIP as the gerber
   bundle. JLC auto-detects the BOM/CPL inside.
4. Pick the JLC 2-layer default ruleset unless the board sheet explicitly
   opts into 4 layers.

## DRC ruleset

Boards default to the JLC 2-layer ruleset. Boards needing 4 layers (Core, PoE,
Touchscreen) override the DRC config in their own board directory — see the
per-board ticket for the override pattern.

## Local prerequisites

- Node + pnpm via the repo root (`pnpm install`).
- No extra toolchain — `tsci` ships as part of the `tscircuit` package.
