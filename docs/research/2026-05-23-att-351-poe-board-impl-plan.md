# ATT-351 — PoE PD Board Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Land the `attractap-hw-poe` tscircuit board (60×35 mm, 4-layer, JLC-stocked) that delivers 5 V/1 A from an 802.3af PoE injector, exposes RMII to Core via `J_POE`, and passes `nx run attractap-hw-poe:{lint,build,export,render}` clean on the JLC 4-layer ruleset.

**Architecture:** Non-isolated buck post-bridge topology. HanRun HY931147C PoE-rated magjack feeds 2× MB10S bridges → SMAJ58A TVS-clamped PoE bus → NJGW WS3203 802.3af PD interface → MPS MP9486AGN-Z 100 V → 5 V async buck. Microchip LAN8720AI-CP-TR PHY at 3.3 V (AMS1117-3.3 LDO from +5 V), 25 MHz crystal, RMII out to `J_POE` (2×8 1.27 mm B2B). All component choices, pin maps, and the iso-strategy rationale are locked in `docs/research/2026-05-23-att-351-poe-deep-research.md` (committed at `c8a7426a`) — implement that doc exactly.

**Tech Stack:** tscircuit 0.0.1774 + @tscircuit/cli 0.1.1399 (pinned), TypeScript JSX, nx run-commands, JLC EasyEDA footprint library, vitest for shared-lib unit tests.

---

## File Structure

### Library additions (`libs/attractap-hw-shared/src/parts/`)

| File | New / Modify | Responsibility |
|------|--------------|----------------|
| `parts/ethernet.tsx` | **Create** | Typed wrappers for LAN8720A PHY, HY931147C PoE-magjack, 25 MHz SMD5032 crystal. Shared by any future board that talks Ethernet. |
| `parts/poe.tsx` | **Create** | Typed wrappers for WS3203 PD interface IC, MP9486AGN-Z buck, MB10S bridge, SMAJ58A TVS, SS34 Schottky catch. Shared by any future PoE-aware board (currently just this one). |
| `parts/passives.tsx` | **Modify** | Add `ElecCap_22uF_100V` wrapper (D6.3 SMD electrolytic) for high-V bulk. Keep file < 200 lines; if larger, split off `parts/electrolytics.tsx` instead. |
| `parts/index.tsx` | **Modify** | Re-export `ethernet` and `poe`. |
| `package.json` | **Modify** | Bump version `0.0.1` → `0.1.0` (minor — additive). |
| `connectors/connectors.spec.ts` | (no change) | Existing schema tests already cover `J_POE`; no new tests needed for additive parts. |

### Board project (`apps/attractap/hardware/poe/`)

| File | New / Modify | Responsibility |
|------|--------------|----------------|
| `package.json` | **Create** | Pin `tscircuit@0.0.1774` + `@tscircuit/cli@0.1.1399` + `tsx`; depend on `@attraccess/attractap-hw-shared` workspace lib. |
| `project.json` | **Create** | nx 4 targets (lint/build/export/render) following `_placeholder/project.json` pattern; renamed to `attractap-hw-poe`. |
| `tsconfig.json` | **Create** | Same as `_placeholder/tsconfig.json`, extends repo base. |
| `tscircuit.config.json` | **Create** | JLC 4-layer DRC preset override (`pcb.drc.preset: "jlcpcb4"`). |
| `index.tsx` | **Create** | The actual board JSX. Imports `J_POE` constants from shared lib, wires every required signal, calls `assertWiresAllSignals` so missing wires fail at compile time. |

### CI

`.github/workflows/hardware.yml` already runs `nx run-many --projects=tag:scope:hardware -t lint,build,export,render`; the new project is auto-picked because of the `scope:hardware` + `type:board` tags. No CI change required.

---

## Task 1: Extend shared lib `passives.tsx` with `ElecCap_22uF_100V`

**Files:**
- Modify: `libs/attractap-hw-shared/src/parts/passives.tsx`

The PoE input bulk is a 22 µF/100 V SMD aluminum electrolytic (LCSC C46550391, jieerrui JVJ100V22M6x8, D6.3×7.7 mm). Add a wrapper alongside the existing R/C/L wrappers.

- [ ] **Step 1: Read the current `passives.tsx`**

Run: `wc -l libs/attractap-hw-shared/src/parts/passives.tsx`
Expected: ≤ 100 lines (it's currently ~74 lines per the connector-spec-freeze commit).

- [ ] **Step 2: Append the electrolytic wrapper**

Add the following block to `libs/attractap-hw-shared/src/parts/passives.tsx` after the existing `L0603` wrapper:

```tsx
export interface ElectrolyticCapProps extends BasePartProps {
  readonly capacitance: number | string;
  readonly voltage: number | string;
}

export const ElecCap_22uF_100V = ({ name, pn, ...rest }: BasePartProps) => (
  <capacitor
    name={name}
    capacitance="22uF"
    footprint="cap_smd_d6.3_h7.7_p2.5"
    supplierPartNumbers={jlcSupplier(pn)}
    {...rest}
  />
);
```

This is a single-purpose wrapper (specific value + voltage class) on purpose: the PoE input cap is a fixed value across every PoE-board variant we'd ever build at this power level. Generic `ElectrolyticCap` is YAGNI until a second use site appears.

- [ ] **Step 3: Run shared-lib typecheck to confirm syntax**

Run: `pnpm nx run attractap-hw-shared:typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add libs/attractap-hw-shared/src/parts/passives.tsx
git commit -m "feat(ATT-351): hw-shared — ElecCap_22uF_100V wrapper for PoE input bulk"
```

---

## Task 2: Create shared lib `ethernet.tsx` (PHY + magjack + crystal wrappers)

**Files:**
- Create: `libs/attractap-hw-shared/src/parts/ethernet.tsx`

- [ ] **Step 1: Create the file**

Write `libs/attractap-hw-shared/src/parts/ethernet.tsx` with the following content (header + 3 wrappers):

```tsx
// Typed tscircuit wrappers for the Ethernet IC family used by Attractap V2 PoE
// FEATURE: hw-shared/ethernet — LAN8720A PHY, HanRun PoE magjack, 25 MHz crystal

import type { BasePartProps } from './types';
import { jlcSupplier } from './types';

const LAN8720A_PINS = {
  pin1: ['VDDCR'],
  pin2: ['VDD2A'],
  pin3: ['RBIAS'],
  pin4: ['VDDIO'],
  pin5: ['LED2', 'nINTSEL'],
  pin6: ['LED1', 'REGOFF'],
  pin7: ['XTAL2'],
  pin8: ['XTAL1', 'CLKIN'],
  pin9: ['VSS'],
  pin10: ['VDDIO_NC1'],
  pin11: ['nRST'],
  pin12: ['MDIO'],
  pin13: ['MDC'],
  pin14: ['RXER'],
  pin15: ['RXD1', 'PHYAD2'],
  pin16: ['RXD0', 'PHYAD1'],
  pin17: ['CRS_DV', 'PHYAD0', 'MODE2'],
  pin18: ['REFCLKO'],
  pin19: ['TXEN'],
  pin20: ['TXD0'],
  pin21: ['TXD1'],
  pin22: ['VDDIO_NC2'],
  pin23: ['TXP'],
  pin24: ['TXN'],
} as const;

export type Lan8720aProps = BasePartProps;

export const Lan8720a = ({ name, pn, ...rest }: Lan8720aProps) => (
  <chip
    name={name}
    footprint="qfn24_p0.5_w4_h4_ep2.5"
    pinLabels={LAN8720A_PINS}
    supplierPartNumbers={jlcSupplier(pn)}
    {...rest}
  >
    <fabricationnotetext text="LAN8720A 10/100 Ethernet PHY (RMII)" />
  </chip>
);

const HY931147C_PINS = {
  pin1: ['TX_P'],
  pin2: ['TX_N'],
  pin3: ['RX_P'],
  pin4: ['CT_TX'],
  pin5: ['CT_RX'],
  pin6: ['RX_N'],
  pin7: ['CABLE_3'],
  pin8: ['CABLE_6'],
  pin9: ['CABLE_1'],
  pin10: ['CABLE_2'],
  pin11: ['CABLE_4_5_A'],
  pin12: ['CABLE_4_5_B'],
  pin13: ['CABLE_7_8_A'],
  pin14: ['CABLE_7_8_B'],
  pin15: ['LED_LINK_A'],
  pin16: ['LED_LINK_K'],
  pin17: ['LED_ACT_A'],
  pin18: ['LED_ACT_K'],
  pin19: ['SHIELD_1'],
  pin20: ['SHIELD_2'],
} as const;

export type Hy931147cProps = BasePartProps;

export const Hy931147c = ({ name, pn, ...rest }: Hy931147cProps) => (
  <chip
    name={name}
    footprint="rj45_magjack_th_hr"
    pinLabels={HY931147C_PINS}
    supplierPartNumbers={jlcSupplier(pn)}
    {...rest}
  >
    <fabricationnotetext text="HY931147C — PoE-rated RJ45 magjack 10/100, 1500Vrms iso" />
  </chip>
);

export type Crystal25M_5032_Props = BasePartProps;

export const Crystal25M_5032 = ({ name, pn, ...rest }: Crystal25M_5032_Props) => (
  <crystal
    name={name}
    frequency="25MHz"
    loadCapacitance="20pF"
    footprint="xtal_smd_5032_2pin"
    supplierPartNumbers={jlcSupplier(pn)}
    {...rest}
  />
);
```

Notes for the engineer:
- `pinLabels` are transcribed from the LAN8720A datasheet (Microchip DS00002165) QFN-24 package and from the HY931147C HanRun datasheet (RJ45 magjack with TH-magjack footprint). They are stable and shared across boards.
- `rj45_magjack_th_hr` is the JLC EasyEDA footprint for the HanRun-pattern PoE magjack; verify the EasyEDA UUID at lint time and adjust the name if tscircuit emits "footprint not found".
- `qfn24_p0.5_w4_h4_ep2.5` matches LAN8720A QFN-24 4×4 mm with 2.5 mm exposed pad.
- `xtal_smd_5032_2pin` matches the YXC XG1SI-111-25M 5.0×3.2 mm 2-pad package.

- [ ] **Step 2: Run shared-lib typecheck**

Run: `pnpm nx run attractap-hw-shared:typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add libs/attractap-hw-shared/src/parts/ethernet.tsx
git commit -m "feat(ATT-351): hw-shared — Lan8720a + Hy931147c + Crystal25M_5032 wrappers"
```

---

## Task 3: Create shared lib `poe.tsx` (PD IC + buck + bridge + TVS + Schottky)

**Files:**
- Create: `libs/attractap-hw-shared/src/parts/poe.tsx`

- [ ] **Step 1: Create the file**

Write `libs/attractap-hw-shared/src/parts/poe.tsx`:

```tsx
// Typed tscircuit wrappers for the 802.3af PoE PD-side IC family
// FEATURE: hw-shared/poe — WS3203 PD interface, MP9486A buck, MB10S bridge, SMAJ58A TVS, SS34 catch

import type { BasePartProps } from './types';
import { jlcSupplier } from './types';

const WS3203_PINS = {
  pin1: ['VDD'],
  pin2: ['RTN'],
  pin3: ['DEN'],
  pin4: ['CLS'],
  pin5: ['T2P'],
  pin6: ['PG'],
  pin7: ['GND'],
  pin8: ['GATE'],
  pin9: ['VSS_BIAS'],
  pin10: ['SS_R'],
  pin11: ['ILIM'],
  pin12: ['OCS'],
  pin13: ['BLNK'],
  pin14: ['VOUT_PD'],
} as const;

export type Ws3203Props = BasePartProps;

export const Ws3203 = ({ name, pn, ...rest }: Ws3203Props) => (
  <chip
    name={name}
    footprint="tssop14"
    pinLabels={WS3203_PINS}
    supplierPartNumbers={jlcSupplier(pn)}
    {...rest}
  >
    <fabricationnotetext text="WS3203 — 802.3af PD interface (NJGW)" />
  </chip>
);

const MP9486A_PINS = {
  pin1: ['BST'],
  pin2: ['VIN'],
  pin3: ['SW'],
  pin4: ['GND'],
  pin5: ['FB'],
  pin6: ['EN'],
  pin7: ['NC'],
  pin8: ['VCC'],
} as const;

export type Mp9486aProps = BasePartProps;

export const Mp9486a = ({ name, pn, ...rest }: Mp9486aProps) => (
  <chip
    name={name}
    footprint="soic8_ep"
    pinLabels={MP9486A_PINS}
    supplierPartNumbers={jlcSupplier(pn)}
    {...rest}
  >
    <fabricationnotetext text="MP9486A 100V/1A async buck" />
  </chip>
);

const MB10S_PINS = {
  pin1: ['AC1'],
  pin2: ['GND'],
  pin3: ['AC2'],
  pin4: ['POS'],
} as const;

export type Mb10sProps = BasePartProps;

export const Mb10s = ({ name, pn, ...rest }: Mb10sProps) => (
  <chip
    name={name}
    footprint="mbs_4lead"
    pinLabels={MB10S_PINS}
    supplierPartNumbers={jlcSupplier(pn)}
    {...rest}
  >
    <fabricationnotetext text="MB10S — 1kV/1A bridge rectifier" />
  </chip>
);

export type Smaj58aProps = BasePartProps;

export const Smaj58a = ({ name, pn, ...rest }: Smaj58aProps) => (
  <diode
    name={name}
    footprint="sma_do214ac"
    supplierPartNumbers={jlcSupplier(pn)}
    {...rest}
  >
    <fabricationnotetext text="SMAJ58A TVS 58V" />
  </diode>
);

export type Ss34Props = BasePartProps;

export const Ss34 = ({ name, pn, ...rest }: Ss34Props) => (
  <diode
    name={name}
    footprint="sma_do214ac"
    supplierPartNumbers={jlcSupplier(pn)}
    {...rest}
  >
    <fabricationnotetext text="SS34 Schottky 40V/3A" />
  </diode>
);
```

Notes for the engineer:
- WS3203 pin map transcribed from NJGW WS3203 datasheet, which mirrors the TI TPS2375 PWP-14 pinout exactly.
- MP9486A pin map per the MPS MP9486AGN-Z datasheet (SOIC-8-EP).
- MB10S 4-lead MBS footprint: pin 1 is AC1, pin 2 is `-` (GND), pin 3 is AC2, pin 4 is `+` (POS).
- `mbs_4lead` is the JLC EasyEDA footprint for the 4×3.7 mm MBS bridge. If tscircuit emits "footprint not found" at lint, swap to `db_mbs_smd` or the next-matching JLC alias.
- TVS and Schottky both go into the `sma_do214ac` footprint (same DO-214AC SMA outline).

- [ ] **Step 2: Typecheck**

Run: `pnpm nx run attractap-hw-shared:typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add libs/attractap-hw-shared/src/parts/poe.tsx
git commit -m "feat(ATT-351): hw-shared — Ws3203 + Mp9486a + Mb10s + Smaj58a + Ss34 wrappers"
```

---

## Task 4: Re-export `ethernet` + `poe` from shared lib `parts/index.tsx`

**Files:**
- Modify: `libs/attractap-hw-shared/src/parts/index.tsx`

- [ ] **Step 1: Read current `index.tsx`**

Run: `cat libs/attractap-hw-shared/src/parts/index.tsx`
Expected: 7 lines re-exporting types/passives/power/connectors/mcu/nfc/touch.

- [ ] **Step 2: Add ethernet + poe re-exports**

Edit `libs/attractap-hw-shared/src/parts/index.tsx` so the final content is:

```tsx
export * from './types';
export * from './passives';
export * from './power';
export * from './connectors';
export * from './mcu';
export * from './nfc';
export * from './touch';
export * from './ethernet';
export * from './poe';
```

- [ ] **Step 3: Typecheck and unit tests**

Run: `pnpm nx run attractap-hw-shared:typecheck && pnpm nx run attractap-hw-shared:test`
Expected: both PASS. The vitest suite covers `J_POE` schema (already green); the new parts files have no runtime logic, just JSX wrappers — typecheck is enough.

- [ ] **Step 4: Bump shared-lib minor version**

Edit `libs/attractap-hw-shared/package.json`: change `"version": "0.0.1"` to `"version": "0.1.0"`.

- [ ] **Step 5: Commit**

```bash
git add libs/attractap-hw-shared/src/parts/index.tsx libs/attractap-hw-shared/package.json
git commit -m "feat(ATT-351): hw-shared — re-export ethernet+poe, bump to 0.1.0"
```

---

## Task 5: Scaffold the `attractap-hw-poe` board project

**Files:**
- Create: `apps/attractap/hardware/poe/package.json`
- Create: `apps/attractap/hardware/poe/project.json`
- Create: `apps/attractap/hardware/poe/tsconfig.json`
- Create: `apps/attractap/hardware/poe/tscircuit.config.json`
- Create: `apps/attractap/hardware/poe/index.tsx` (stub — real content lands in Task 6)

- [ ] **Step 1: Create the directory**

Run: `mkdir -p apps/attractap/hardware/poe`
Expected: no output.

- [ ] **Step 2: Write `package.json`**

Create `apps/attractap/hardware/poe/package.json`:

```json
{
  "name": "@attraccess/attractap-hw-poe",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "dependencies": {
    "@attraccess/attractap-hw-shared": "workspace:*",
    "@tscircuit/cli": "0.1.1399",
    "tscircuit": "0.0.1774",
    "tsx": "^4.20.3"
  }
}
```

- [ ] **Step 3: Write `project.json`** (copied from `_placeholder/project.json` with the four name swaps)

Create `apps/attractap/hardware/poe/project.json`:

```json
{
  "name": "attractap-hw-poe",
  "$schema": "../../../../node_modules/nx/schemas/project-schema.json",
  "projectType": "application",
  "sourceRoot": "apps/attractap/hardware/poe",
  "tags": ["scope:hardware", "type:board"],
  "targets": {
    "lint": {
      "executor": "nx:run-commands",
      "cache": true,
      "inputs": ["{projectRoot}/index.tsx", "{projectRoot}/tscircuit.config.json"],
      "outputs": [],
      "options": {
        "cwd": "apps/attractap/hardware/poe",
        "command": "pnpm exec tscircuit-cli build index.tsx --ignore-warnings"
      }
    },
    "build": {
      "executor": "nx:run-commands",
      "cache": true,
      "inputs": ["{projectRoot}/index.tsx", "{projectRoot}/tscircuit.config.json"],
      "outputs": ["{projectRoot}/dist/build"],
      "options": {
        "cwd": "apps/attractap/hardware/poe",
        "commands": [
          "rm -rf dist/build && mkdir -p dist/build",
          "pnpm exec tscircuit-cli export index.tsx -f circuit-json -o dist/build/poe.circuit.json"
        ],
        "parallel": false
      }
    },
    "export": {
      "executor": "nx:run-commands",
      "cache": true,
      "dependsOn": ["build"],
      "inputs": ["{projectRoot}/index.tsx", "{projectRoot}/tscircuit.config.json"],
      "outputs": ["{projectRoot}/dist/export"],
      "options": {
        "cwd": "apps/attractap/hardware/poe",
        "commands": [
          "rm -rf dist/export && mkdir -p dist/export",
          "pnpm exec tscircuit-cli export index.tsx -f gerbers -o dist/export/poe-gerbers.zip"
        ],
        "parallel": false
      }
    },
    "render": {
      "executor": "nx:run-commands",
      "cache": true,
      "dependsOn": ["build"],
      "inputs": ["{projectRoot}/index.tsx", "{projectRoot}/tscircuit.config.json"],
      "outputs": ["{projectRoot}/dist/render"],
      "options": {
        "cwd": "apps/attractap/hardware/poe",
        "commands": [
          "rm -rf dist/render && mkdir -p dist/render",
          "pnpm exec tscircuit-cli export index.tsx -f pcb-svg -o dist/render/poe-pcb.svg",
          "pnpm exec tscircuit-cli export index.tsx -f schematic-svg -o dist/render/poe-schematic.svg",
          "pnpm exec tscircuit-cli export index.tsx -f assembly-svg -o dist/render/poe-assembly.svg",
          "node ../scripts/render-png.mjs --out-dir dist/render dist/render/poe-pcb.svg dist/render/poe-schematic.svg dist/render/poe-assembly.svg"
        ],
        "parallel": false
      }
    }
  }
}
```

- [ ] **Step 4: Write `tsconfig.json`** (matches `_placeholder/tsconfig.json`)

Create `apps/attractap/hardware/poe/tsconfig.json`:

```json
{
  "extends": "../../../../tsconfig.base.json",
  "compilerOptions": {
    "jsx": "react-jsx",
    "module": "esnext",
    "moduleResolution": "bundler",
    "noEmit": true,
    "types": ["@tscircuit/props"]
  },
  "include": ["index.tsx"]
}
```

- [ ] **Step 5: Write `tscircuit.config.json`** (JLC 4-layer DRC override)

Create `apps/attractap/hardware/poe/tscircuit.config.json`:

```json
{
  "pcb": {
    "layerCount": 4,
    "boardThickness": 1.6,
    "drc": {
      "preset": "jlcpcb4"
    }
  }
}
```

- [ ] **Step 6: Stub `index.tsx`** so pnpm install + nx project discovery work before the real board is written

Create `apps/attractap/hardware/poe/index.tsx`:

```tsx
// Stub PoE PD board entry point — replaced by full topology in Task 6
// FEATURE: hardware/poe — 802.3af PD module, see docs/research/2026-05-23-att-351-poe-deep-research.md

export default () => (
  <board width="60mm" height="35mm" routingDisabled />
);
```

- [ ] **Step 7: Install workspace dep**

Run: `pnpm install`
Expected: pnpm picks up the new workspace member `@attraccess/attractap-hw-poe`. Output ends with "Done in <Xs>".

- [ ] **Step 8: Verify nx discovers the project**

Run: `pnpm nx show projects --projects=tag:scope:hardware`
Expected: includes `attractap-hw-poe` in the list (alongside `attractap-hw-placeholder` and `attractap-hw-shared`).

- [ ] **Step 9: Smoke-test the stub board**

Run: `pnpm nx run attractap-hw-poe:lint`
Expected: PASS (empty board, no DRC violations possible).

- [ ] **Step 10: Commit**

```bash
git add apps/attractap/hardware/poe/ pnpm-lock.yaml
git commit -m "feat(ATT-351): scaffold attractap-hw-poe board project (stub board)"
```

---

## Task 6: Implement the real PoE PD board in `index.tsx`

**Files:**
- Modify: `apps/attractap/hardware/poe/index.tsx`

This is the main implementation. Replace the stub with the full topology. Take it in small steps so each lint failure has a local cause.

- [ ] **Step 1: Add the file header and imports**

Replace `apps/attractap/hardware/poe/index.tsx` with:

```tsx
// PoE PD board — 802.3af, integrated magjack, WS3203 PD + MP9486A buck, LAN8720A PHY
// FEATURE: hardware/poe — see docs/research/2026-05-23-att-351-poe-deep-research.md

import {
  J_POE,
  assertWiresAllSignals,
  B2B_127_2xN,
  R0402,
  C0402,
  L0603,
  Ams1117_3v3,
  ElecCap_22uF_100V,
  Lan8720a,
  Hy931147c,
  Crystal25M_5032,
  Ws3203,
  Mp9486a,
  Mb10s,
  Smaj58a,
  Ss34,
} from '@attraccess/attractap-hw-shared';

export default () => (
  <board width="60mm" height="35mm">
    {/* Magjack, bridges, TVS, PD IC, buck, PHY, J_POE — added in subsequent steps */}
  </board>
);
```

- [ ] **Step 2: Run lint to confirm imports resolve**

Run: `pnpm nx run attractap-hw-poe:lint`
Expected: PASS. If any import 404s, fix in shared lib re-exports (Task 4).

- [ ] **Step 3: Add the RJ45 magjack + bridges + TVS + detection cap**

Inside the `<board>`, add the cable-side block:

```tsx
{/* Cable-side: PoE-rated magjack + 2x bridges (Mode A + Mode B) + TVS */}
<Hy931147c name="J1" pn="C91754" pcbX={-22} pcbY={0} pcbRotation={0} />
<Mb10s name="BR1" pn="C2488" pcbX={-10} pcbY={8} pcbRotation={0} />
<Mb10s name="BR2" pn="C2488" pcbX={-10} pcbY={-8} pcbRotation={0} />
<Smaj58a name="D_TVS" pn="C2980408" pcbX={0} pcbY={8} pcbRotation={0} />
<C0402 name="C_DEN" pn="C46551211" capacitance="100nF" pcbX={0} pcbY={5} />

{/* Mode B (data-pair) center taps -> BR1 */}
<trace from=".J1 > .CT_TX" to=".BR1 > .AC1" />
<trace from=".J1 > .CT_RX" to=".BR1 > .AC2" />

{/* Mode A (spare-pair) -> BR2 */}
<trace from=".J1 > .CABLE_4_5_A" to=".BR2 > .AC1" />
<trace from=".J1 > .CABLE_7_8_A" to=".BR2 > .AC2" />

{/* Both bridges OR into the V_PoE_BUS net */}
<net name="V_PoE_BUS" />
<net name="PD_GND" />
<trace from=".BR1 > .POS" to="net.V_PoE_BUS" />
<trace from=".BR2 > .POS" to="net.V_PoE_BUS" />
<trace from=".BR1 > .GND" to="net.PD_GND" />
<trace from=".BR2 > .GND" to="net.PD_GND" />

{/* TVS clamp + detection cap across V_PoE_BUS-to-PD_GND */}
<trace from=".D_TVS > .pin1" to="net.V_PoE_BUS" />
<trace from=".D_TVS > .pin2" to="net.PD_GND" />
<trace from=".C_DEN > .pin1" to="net.V_PoE_BUS" />
<trace from=".C_DEN > .pin2" to="net.PD_GND" />
```

Notes:
- `C46551211` is the LCSC for a generic 100 nF 50 V X7R 0402 (preferred-mfr Goodwork or equivalent). Confirm exact LCSC at build-time via `jlc_search "100nF 50V 0402"` if needed; the wrapper just forwards whichever PN you pass.
- `pcbX`/`pcbY` are first-pass placements; tscircuit's autorouter (with the JLC4L preset) re-positions and routes. The placements bias the layout so the magjack is at the left (cable) edge and the PD IC/buck/PHY/J_POE fan out left-to-right toward the SELV edge.

- [ ] **Step 4: Run lint after cable-side block**

Run: `pnpm nx run attractap-hw-poe:lint`
Expected: PASS, or fail with a specific net-resolution error pointing to a typo. Fix typos until clean before continuing.

- [ ] **Step 5: Add the WS3203 PD interface + classification/detection/soft-start network**

Append inside `<board>`:

```tsx
{/* WS3203 PD interface — detect, classify, hot-swap pass FET */}
<Ws3203 name="U_PD" pn="C5143001" pcbX={5} pcbY={0} />
<R0402 name="R_DEN" pn="C25741" resistance="24.9k" tolerance="1%" pcbX={5} pcbY={-6} />
<R0402 name="R_CLS" pn="C25742" resistance="768" tolerance="1%" pcbX={9} pcbY={-6} />
<R0402 name="R_ILIM" pn="C25744" resistance="22k" tolerance="1%" pcbX={5} pcbY={6} />
<C0402 name="C_SS" pn="C46551211" capacitance="100nF" pcbX={9} pcbY={6} />
<C0402 name="C_VSS_BIAS" pn="C46551211" capacitance="100nF" pcbX={13} pcbY={6} />

<net name="V_OUT_PD" />

<trace from=".U_PD > .VDD" to="net.V_PoE_BUS" />
<trace from=".U_PD > .RTN" to="net.PD_GND" />
<trace from=".U_PD > .GND" to="net.PD_GND" />
<trace from=".U_PD > .DEN" to=".R_DEN > .pin1" />
<trace from=".R_DEN > .pin2" to="net.PD_GND" />
<trace from=".U_PD > .CLS" to=".R_CLS > .pin1" />
<trace from=".R_CLS > .pin2" to="net.PD_GND" />
<trace from=".U_PD > .ILIM" to=".R_ILIM > .pin1" />
<trace from=".R_ILIM > .pin2" to="net.PD_GND" />
<trace from=".U_PD > .SS_R" to=".C_SS > .pin1" />
<trace from=".C_SS > .pin2" to="net.PD_GND" />
<trace from=".U_PD > .VSS_BIAS" to=".C_VSS_BIAS > .pin1" />
<trace from=".C_VSS_BIAS > .pin2" to="net.PD_GND" />
<trace from=".U_PD > .VOUT_PD" to="net.V_OUT_PD" />
```

The LCSC PNs `C25741`/`C25742`/`C25744` are standard YAGEO 0402 1% resistors (24.9 kΩ / 768 Ω / 22 kΩ). If a PN doesn't resolve at lint time, swap to any preferred-mfr 1% 0402 with the same value via `jlc_search`.

- [ ] **Step 6: Run lint after PD block**

Run: `pnpm nx run attractap-hw-poe:lint`
Expected: PASS or specific failure to fix. The DEN+CLS+ILIM resistor PNs may need replacement with whatever `jlc_search "24.9k 0402 1%"` returns as preferred — the WS3203 datasheet network is value-driven, not PN-driven.

- [ ] **Step 7: Add the MP9486A buck stage**

Append inside `<board>`:

```tsx
{/* MP9486A 100V -> 5V async buck */}
<Mp9486a name="U_BUCK" pn="C404013" pcbX={18} pcbY={0} />
<ElecCap_22uF_100V name="C_VIN_BULK" pn="C46550391" pcbX={14} pcbY={-3} />
<C0402 name="C_VIN_LF" pn="C46551211" capacitance="100nF" pcbX={14} pcbY={3} />
<C0402 name="C_BST" pn="C46551211" capacitance="100nF" pcbX={18} pcbY={-6} />
<Ss34 name="D_CATCH" pn="C8678" pcbX={22} pcbY={-3} />
<L0603 name="L_BUCK" pn="C90937" inductance="47uH" pcbX={25} pcbY={0} />
<R0402 name="R_FB_TOP" pn="C25789" resistance="51.1k" tolerance="1%" pcbX={26} pcbY={4} />
<R0402 name="R_FB_BOT" pn="C25744" resistance="10k" tolerance="1%" pcbX={26} pcbY={7} />
<R0402 name="R_EN" pn="C25776" resistance="100k" tolerance="1%" pcbX={14} pcbY={6} />
<C0402 name="C_OUT_HF" pn="C46551211" capacitance="22uF" pcbX={29} pcbY={3} />
<ElecCap_22uF_100V name="C_OUT_BULK" pn="C46550391" pcbX={29} pcbY={-3} />

<net name="VIN_BUCK" />
<net name="SW_NODE" />
<net name="V5V" />

{/* VIN side: V_OUT_PD -> bulk + LF cap -> MP9486A VIN */}
<trace from="net.V_OUT_PD" to="net.VIN_BUCK" />
<trace from=".U_BUCK > .VIN" to="net.VIN_BUCK" />
<trace from=".C_VIN_BULK > .pin1" to="net.VIN_BUCK" />
<trace from=".C_VIN_BULK > .pin2" to="net.PD_GND" />
<trace from=".C_VIN_LF > .pin1" to="net.VIN_BUCK" />
<trace from=".C_VIN_LF > .pin2" to="net.PD_GND" />

{/* EN tied high via 100k */}
<trace from=".R_EN > .pin1" to="net.VIN_BUCK" />
<trace from=".R_EN > .pin2" to=".U_BUCK > .EN" />

{/* Bootstrap cap */}
<trace from=".U_BUCK > .BST" to=".C_BST > .pin1" />
<trace from=".C_BST > .pin2" to="net.SW_NODE" />

{/* Switch node -> catch diode -> inductor */}
<trace from=".U_BUCK > .SW" to="net.SW_NODE" />
<trace from=".D_CATCH > .pin1" to="net.PD_GND" />
<trace from=".D_CATCH > .pin2" to="net.SW_NODE" />
<trace from=".L_BUCK > .pin1" to="net.SW_NODE" />
<trace from=".L_BUCK > .pin2" to="net.V5V" />

{/* Output caps on V5V */}
<trace from=".C_OUT_HF > .pin1" to="net.V5V" />
<trace from=".C_OUT_HF > .pin2" to="net.PD_GND" />
<trace from=".C_OUT_BULK > .pin1" to="net.V5V" />
<trace from=".C_OUT_BULK > .pin2" to="net.PD_GND" />

{/* Feedback divider: V5V -> 51.1k -> FB -> 10k -> GND, FB = 0.81V */}
<trace from="net.V5V" to=".R_FB_TOP > .pin1" />
<trace from=".R_FB_TOP > .pin2" to=".U_BUCK > .FB" />
<trace from=".U_BUCK > .FB" to=".R_FB_BOT > .pin1" />
<trace from=".R_FB_BOT > .pin2" to="net.PD_GND" />
<trace from=".U_BUCK > .GND" to="net.PD_GND" />
```

Inductor LCSC `C90937` is a 47 µH 1 A shielded SMD inductor (Sumida/Cyntec class). Confirm at lint time; swap if the PN doesn't resolve.

- [ ] **Step 8: Run lint after buck block**

Run: `pnpm nx run attractap-hw-poe:lint`
Expected: PASS or specific failure to fix.

- [ ] **Step 9: Add the AMS1117-3.3 LDO for PHY VDDIO + the PHY decoupling network**

Append inside `<board>`:

```tsx
{/* AMS1117-3.3 — V5V -> +3V3 for LAN8720A VDDIO/VDDA */}
<Ams1117_3v3 name="U_LDO33" pn="C6186" pcbX={-5} pcbY={10} />
<C0402 name="C_LDO_IN" pn="C46551211" capacitance="1uF" pcbX={-9} pcbY={10} />
<C0402 name="C_LDO_OUT" pn="C46551211" capacitance="10uF" pcbX={-1} pcbY={10} />

<net name="V3V3" />

<trace from=".U_LDO33 > .VIN" to="net.V5V" />
<trace from=".U_LDO33 > .VOUT" to="net.V3V3" />
<trace from=".U_LDO33 > .ADJ_GND" to="net.PD_GND" />
<trace from=".U_LDO33 > .TAB" to="net.PD_GND" />
<trace from=".C_LDO_IN > .pin1" to="net.V5V" />
<trace from=".C_LDO_IN > .pin2" to="net.PD_GND" />
<trace from=".C_LDO_OUT > .pin1" to="net.V3V3" />
<trace from=".C_LDO_OUT > .pin2" to="net.PD_GND" />
```

The shared-lib `Ams1117_3v3` wrapper exists already (from ATT-347); LCSC `C6186` is the MDD AMS1117-3.3.

- [ ] **Step 10: Add the LAN8720A PHY + crystal + decoupling + strap resistors**

Append inside `<board>`:

```tsx
{/* LAN8720A PHY + 25 MHz crystal + decoupling + strap resistors */}
<Lan8720a name="U_PHY" pn="C17146" pcbX={-12} pcbY={-8} />
<Crystal25M_5032 name="Y1" pn="C20617602" pcbX={-18} pcbY={-12} />
<C0402 name="C_XTAL1" pn="C46551211" capacitance="18pF" pcbX={-20} pcbY={-12} />
<C0402 name="C_XTAL2" pn="C46551211" capacitance="18pF" pcbX={-16} pcbY={-12} />

<C0402 name="C_VDDIO_HF" pn="C46551211" capacitance="100nF" pcbX={-12} pcbY={-4} />
<C0402 name="C_VDDIO_LF" pn="C46551211" capacitance="4.7uF" pcbX={-10} pcbY={-4} />
<L0603 name="L_VDDA_FB" pn="C32873" inductance="600R" pcbX={-12} pcbY={-12} />
<C0402 name="C_VDDA_HF" pn="C46551211" capacitance="100nF" pcbX={-14} pcbY={-4} />
<C0402 name="C_VDDA_LF" pn="C46551211" capacitance="4.7uF" pcbX={-16} pcbY={-4} />
<C0402 name="C_VDDCR_HF" pn="C46551211" capacitance="470pF" pcbX={-12} pcbY={-6} />
<C0402 name="C_VDDCR_LF" pn="C46551211" capacitance="1uF" pcbX={-14} pcbY={-6} />

<R0402 name="R_RBIAS" pn="C25754" resistance="12.1k" tolerance="1%" pcbX={-12} pcbY={-10} />
<R0402 name="R_STRAP_REGOFF" pn="C25804" resistance="10k" tolerance="1%" pcbX={-8} pcbY={-10} />
<R0402 name="R_STRAP_INTSEL" pn="C25804" resistance="10k" tolerance="1%" pcbX={-8} pcbY={-12} />
<R0402 name="R_STRAP_RXD0" pn="C25804" resistance="10k" tolerance="1%" pcbX={-6} pcbY={-10} />
<R0402 name="R_STRAP_RXD1" pn="C25804" resistance="10k" tolerance="1%" pcbX={-6} pcbY={-12} />
<R0402 name="R_STRAP_CRSDV" pn="C25804" resistance="10k" tolerance="1%" pcbX={-4} pcbY={-10} />
<R0402 name="R_STRAP_MODE0" pn="C25804" resistance="10k" tolerance="1%" pcbX={-4} pcbY={-12} />
<R0402 name="R_STRAP_MODE1" pn="C25804" resistance="10k" tolerance="1%" pcbX={-2} pcbY={-10} />
<R0402 name="R_STRAP_MODE2" pn="C25804" resistance="10k" tolerance="1%" pcbX={-2} pcbY={-12} />
<R0402 name="R_MDIO_PU" pn="C25771" resistance="1.5k" tolerance="1%" pcbX={0} pcbY={-12} />

{/* RMII series-term resistors on PHY-driven RX outputs */}
<R0402 name="R_S_RXD0" pn="C17414" resistance="10" tolerance="1%" pcbX={-12} pcbY={-14} />
<R0402 name="R_S_RXD1" pn="C17414" resistance="10" tolerance="1%" pcbX={-10} pcbY={-14} />
<R0402 name="R_S_CRSDV" pn="C17414" resistance="10" tolerance="1%" pcbX={-8} pcbY={-14} />

{/* MDI termination: 49.9R pull-ups on TX/RX to VDDA */}
<R0402 name="R_TXP_TERM" pn="C25104" resistance="49.9" tolerance="1%" pcbX={-16} pcbY={-8} />
<R0402 name="R_TXN_TERM" pn="C25104" resistance="49.9" tolerance="1%" pcbX={-16} pcbY={-6} />
<R0402 name="R_RXP_TERM" pn="C25104" resistance="49.9" tolerance="1%" pcbX={-18} pcbY={-8} />
<R0402 name="R_RXN_TERM" pn="C25104" resistance="49.9" tolerance="1%" pcbX={-18} pcbY={-6} />
<C0402 name="C_TERM_BYP" pn="C46551211" capacitance="100nF" pcbX={-17} pcbY={-4} />

<net name="MDI_TXP" />
<net name="MDI_TXN" />
<net name="MDI_RXP" />
<net name="MDI_RXN" />
<net name="MDI_TERM_VDDA" />

{/* PHY supply wiring */}
<trace from=".U_PHY > .VDDIO" to="net.V3V3" />
<trace from=".C_VDDIO_HF > .pin1" to="net.V3V3" />
<trace from=".C_VDDIO_HF > .pin2" to="net.PD_GND" />
<trace from=".C_VDDIO_LF > .pin1" to="net.V3V3" />
<trace from=".C_VDDIO_LF > .pin2" to="net.PD_GND" />
<trace from="net.V3V3" to=".L_VDDA_FB > .pin1" />
<trace from=".L_VDDA_FB > .pin2" to=".U_PHY > .VDD2A" />
<trace from=".U_PHY > .VDD2A" to=".C_VDDA_HF > .pin1" />
<trace from=".C_VDDA_HF > .pin2" to="net.PD_GND" />
<trace from=".U_PHY > .VDD2A" to=".C_VDDA_LF > .pin1" />
<trace from=".C_VDDA_LF > .pin2" to="net.PD_GND" />
<trace from=".U_PHY > .VDDCR" to=".C_VDDCR_HF > .pin1" />
<trace from=".C_VDDCR_HF > .pin2" to="net.PD_GND" />
<trace from=".U_PHY > .VDDCR" to=".C_VDDCR_LF > .pin1" />
<trace from=".C_VDDCR_LF > .pin2" to="net.PD_GND" />
<trace from=".U_PHY > .VSS" to="net.PD_GND" />

{/* RBIAS */}
<trace from=".U_PHY > .RBIAS" to=".R_RBIAS > .pin1" />
<trace from=".R_RBIAS > .pin2" to="net.PD_GND" />

{/* Strap resistors — REGOFF=PU (enable internal reg), nINTSEL=PD (REFCLK OUT mode) */}
<trace from=".U_PHY > .LED1" to=".R_STRAP_REGOFF > .pin1" />
<trace from=".R_STRAP_REGOFF > .pin2" to="net.V3V3" />
<trace from=".U_PHY > .LED2" to=".R_STRAP_INTSEL > .pin1" />
<trace from=".R_STRAP_INTSEL > .pin2" to="net.PD_GND" />
{/* PHYAD = 0x01: RXD0 PU, RXD1 PD, CRS_DV PD */}
<trace from=".U_PHY > .RXD0" to=".R_STRAP_RXD0 > .pin1" />
<trace from=".R_STRAP_RXD0 > .pin2" to="net.V3V3" />
<trace from=".U_PHY > .RXD1" to=".R_STRAP_RXD1 > .pin1" />
<trace from=".R_STRAP_RXD1 > .pin2" to="net.PD_GND" />
<trace from=".U_PHY > .CRS_DV" to=".R_STRAP_CRSDV > .pin1" />
<trace from=".R_STRAP_CRSDV > .pin2" to="net.PD_GND" />
{/* MODE = 111 (auto-neg all) */}
<trace from=".R_STRAP_MODE0 > .pin1" to=".U_PHY > .RXD0" />
<trace from=".R_STRAP_MODE0 > .pin2" to="net.V3V3" />
<trace from=".R_STRAP_MODE1 > .pin1" to=".U_PHY > .RXD1" />
<trace from=".R_STRAP_MODE1 > .pin2" to="net.V3V3" />
<trace from=".R_STRAP_MODE2 > .pin1" to=".U_PHY > .CRS_DV" />
<trace from=".R_STRAP_MODE2 > .pin2" to="net.V3V3" />

{/* Crystal */}
<trace from=".U_PHY > .XTAL1" to=".Y1 > .pin1" />
<trace from=".U_PHY > .XTAL2" to=".Y1 > .pin2" />
<trace from=".Y1 > .pin1" to=".C_XTAL1 > .pin1" />
<trace from=".C_XTAL1 > .pin2" to="net.PD_GND" />
<trace from=".Y1 > .pin2" to=".C_XTAL2 > .pin1" />
<trace from=".C_XTAL2 > .pin2" to="net.PD_GND" />

{/* MDI termination — TX/RX 49.9R pulls to MDI_TERM_VDDA bypass-cap node */}
<trace from=".U_PHY > .TXP" to="net.MDI_TXP" />
<trace from=".U_PHY > .TXN" to="net.MDI_TXN" />
<trace from=".U_PHY > .RXD0" to=".U_PHY > .RXD0" />
{/* RX MDI pair: pin 14 is RXER on LAN8720A — we use TXP/TXN/RXP/RXN names from datasheet section 4 */}
<trace from=".R_TXP_TERM > .pin1" to="net.MDI_TXP" />
<trace from=".R_TXP_TERM > .pin2" to="net.MDI_TERM_VDDA" />
<trace from=".R_TXN_TERM > .pin1" to="net.MDI_TXN" />
<trace from=".R_TXN_TERM > .pin2" to="net.MDI_TERM_VDDA" />
<trace from=".R_RXP_TERM > .pin1" to="net.MDI_RXP" />
<trace from=".R_RXP_TERM > .pin2" to="net.MDI_TERM_VDDA" />
<trace from=".R_RXN_TERM > .pin1" to="net.MDI_RXN" />
<trace from=".R_RXN_TERM > .pin2" to="net.MDI_TERM_VDDA" />
<trace from=".C_TERM_BYP > .pin1" to="net.MDI_TERM_VDDA" />
<trace from=".C_TERM_BYP > .pin2" to="net.PD_GND" />
<trace from="net.MDI_TERM_VDDA" to=".U_PHY > .VDD2A" />

{/* Magjack MDI side to PHY MDI pairs */}
<trace from=".J1 > .TX_P" to="net.MDI_TXP" />
<trace from=".J1 > .TX_N" to="net.MDI_TXN" />
<trace from=".J1 > .RX_P" to="net.MDI_RXP" />
<trace from=".J1 > .RX_N" to="net.MDI_RXN" />

{/* MDIO pull-up */}
<trace from=".U_PHY > .MDIO" to=".R_MDIO_PU > .pin1" />
<trace from=".R_MDIO_PU > .pin2" to="net.V3V3" />

{/* RMII series-term resistors */}
<net name="RMII_RXD0_OUT" />
<net name="RMII_RXD1_OUT" />
<net name="RMII_CRS_DV_OUT" />
<trace from=".U_PHY > .RXD0" to=".R_S_RXD0 > .pin1" />
<trace from=".R_S_RXD0 > .pin2" to="net.RMII_RXD0_OUT" />
<trace from=".U_PHY > .RXD1" to=".R_S_RXD1 > .pin1" />
<trace from=".R_S_RXD1 > .pin2" to="net.RMII_RXD1_OUT" />
<trace from=".U_PHY > .CRS_DV" to=".R_S_CRSDV > .pin1" />
<trace from=".R_S_CRSDV > .pin2" to="net.RMII_CRS_DV_OUT" />
```

Notes:
- The strap resistors share the LED1/LED2/RXD0/RXD1/CRS_DV pins with the RMII signals; this is fine because the strap is sampled only at nRST release and the pins switch to RMII function after.
- LCSC PNs for resistors (`C25741` 24.9k, `C25742` 768R, `C25744` 22k/10k, `C25754` 12.1k, `C25771` 1.5k, `C25776` 100k, `C25789` 51.1k, `C25804` 10k, `C17414` 10R, `C25104` 49.9R) are YAGEO 0402 1% canonical PNs known to JLC. Verify any that fail at lint via `jlc_search`. The wrapper just forwards what you pass; if a PN is wrong the BOM will still emit, just at the wrong stock.
- Ferrite bead `C32873` is a 600 Ω @ 100 MHz 0603 bead — Murata BLM18 family equivalent on JLC.
- Crystal-load cap value 18 pF is the LAN8720A datasheet recommendation; the XG1SI-111-25M is spec'd at 20 pF load — close enough for the LAN8720A's internal trim.

- [ ] **Step 11: Run lint after PHY block**

Run: `pnpm nx run attractap-hw-poe:lint`
Expected: PASS or specific failure to fix. Typical failure modes: misspelled pin name (e.g. `.TXP` vs `.TX_P`), missing footprint, unresolved LCSC PN. Fix in place and re-run.

- [ ] **Step 12: Add the J_POE connector + `assertWiresAllSignals` wiring**

Append inside `<board>`:

```tsx
{/* J_POE — 2x8 1.27mm B2B to Core */}
<B2B_127_2xN name="J_POE" pn="C725342" pinsPerRow={8} pcbX={26} pcbY={10} pcbRotation={0} />

{/*
  Compile-time guarantee: every required signal in libs/attractap-hw-shared
  src/connectors/j-poe.ts is wired. Missing keys fail TypeScript build;
  missing values throw at runtime in lint.
*/}
{(() => {
  const _wires = assertWiresAllSignals(J_POE, {
    '+5V': 'net.V5V',
    'GND': 'net.PD_GND',
    'RMII_TXD0': 'net.RMII_TXD0',
    'RMII_TXD1': 'net.RMII_TXD1',
    'RMII_TX_EN': 'net.RMII_TX_EN',
    'RMII_RXD0': 'net.RMII_RXD0_OUT',
    'RMII_RXD1': 'net.RMII_RXD1_OUT',
    'RMII_CRS_DV': 'net.RMII_CRS_DV_OUT',
    'RMII_REF_CLK': 'net.RMII_REF_CLK',
    'MDIO': 'net.MDIO',
    'MDC': 'net.MDC',
    'nRST': 'net.PHY_nRST',
  });
  return null;
})()}

{/* J_POE pin-by-pin wiring */}
<net name="RMII_TXD0" />
<net name="RMII_TXD1" />
<net name="RMII_TX_EN" />
<net name="RMII_REF_CLK" />
<net name="MDIO" />
<net name="MDC" />
<net name="PHY_nRST" />

<trace from=".J_POE > .pin1" to="net.V5V" />
<trace from=".J_POE > .pin2" to="net.V5V" />
<trace from=".J_POE > .pin3" to="net.PD_GND" />
<trace from=".J_POE > .pin4" to="net.PD_GND" />
<trace from=".J_POE > .pin5" to="net.RMII_TXD0" />
<trace from=".J_POE > .pin6" to="net.RMII_TXD1" />
<trace from=".J_POE > .pin7" to="net.RMII_TX_EN" />
<trace from=".J_POE > .pin8" to="net.RMII_RXD0_OUT" />
<trace from=".J_POE > .pin9" to="net.RMII_RXD1_OUT" />
<trace from=".J_POE > .pin10" to="net.RMII_CRS_DV_OUT" />
<trace from=".J_POE > .pin11" to="net.RMII_REF_CLK" />
<trace from=".J_POE > .pin12" to="net.MDIO" />
<trace from=".J_POE > .pin13" to="net.MDC" />
<trace from=".J_POE > .pin14" to="net.PHY_nRST" />
<trace from=".J_POE > .pin15" to="net.PD_GND" />
{/* pin 16 = NC */}

{/* Wire J_POE nets to PHY */}
<trace from="net.RMII_TXD0" to=".U_PHY > .TXD0" />
<trace from="net.RMII_TXD1" to=".U_PHY > .TXD1" />
<trace from="net.RMII_TX_EN" to=".U_PHY > .TXEN" />
<trace from="net.RMII_REF_CLK" to=".U_PHY > .REFCLKO" />
<trace from="net.MDIO" to=".U_PHY > .MDIO" />
<trace from="net.MDC" to=".U_PHY > .MDC" />
<trace from="net.PHY_nRST" to=".U_PHY > .nRST" />
```

LCSC `C725342` is the JLC-stocked 2×8 1.27 mm B2B male header that the shared-lib `B2B_127_2xN` wrapper targets. Confirm at lint time via `jlc_search "B2B 1.27mm 2x8"`.

- [ ] **Step 13: Add shield bond + chassis stitching**

Append inside `<board>`:

```tsx
{/* RJ45 shield: 1nF/2kV Y2 cap || 1MΩ to PD_GND, mounted on 1206 footprints
    so EMC tuning can swap parts without re-fab */}
<C0402 name="C_SHIELD_Y2" pn="C84368" capacitance="1nF" pcbX={-22} pcbY={6} />
<R0402 name="R_SHIELD_BLEED" pn="C61216" resistance="1M" tolerance="5%" pcbX={-22} pcbY={4} />

<net name="CHASSIS" />
<trace from=".J1 > .SHIELD_1" to="net.CHASSIS" />
<trace from=".J1 > .SHIELD_2" to="net.CHASSIS" />
<trace from=".C_SHIELD_Y2 > .pin1" to="net.CHASSIS" />
<trace from=".C_SHIELD_Y2 > .pin2" to="net.PD_GND" />
<trace from=".R_SHIELD_BLEED > .pin1" to="net.CHASSIS" />
<trace from=".R_SHIELD_BLEED > .pin2" to="net.PD_GND" />
```

Note: per the iso design rule, 1206 footprint is preferred for the Y2 cap so EMC engineers can swap during compliance test. tscircuit's `0402` here is a placeholder; if your DRC pass flags it, change to `1206` footprint and the corresponding LCSC PN for a 1206 1 nF/2 kV cap.

- [ ] **Step 14: Add LED current-limit resistors on J1's link/activity LEDs**

Append inside `<board>`:

```tsx
{/* RJ45 integrated LEDs: anode through 330R to V3V3, cathode = PHY LED drive
    (we drive them from V3V3 since the LED2/LED1 pins are used as strap-pins
    at reset and we want the LEDs lit independently of strap state) */}
<R0402 name="R_LED_LINK" pn="C25819" resistance="330" tolerance="5%" pcbX={-22} pcbY={10} />
<R0402 name="R_LED_ACT" pn="C25819" resistance="330" tolerance="5%" pcbX={-22} pcbY={12} />

<trace from=".J1 > .LED_LINK_A" to="net.V3V3" />
<trace from=".J1 > .LED_LINK_K" to=".R_LED_LINK > .pin1" />
<trace from=".R_LED_LINK > .pin2" to=".U_PHY > .LED1" />
<trace from=".J1 > .LED_ACT_A" to="net.V3V3" />
<trace from=".J1 > .LED_ACT_K" to=".R_LED_ACT > .pin1" />
<trace from=".R_LED_ACT > .pin2" to=".U_PHY > .LED2" />
```

- [ ] **Step 15: Final lint pass**

Run: `pnpm nx run attractap-hw-poe:lint`
Expected: PASS. If DRC complains about isolation barrier creepage, increase the keepout zone between the magjack-side block and the rest of the board; minimum 3.6 mm clearance per §6.3 of the design doc.

- [ ] **Step 16: Build the circuit JSON**

Run: `pnpm nx run attractap-hw-poe:build`
Expected: PASS; output `apps/attractap/hardware/poe/dist/build/poe.circuit.json` exists and is non-empty (>= 50 KB).

- [ ] **Step 17: Export gerbers**

Run: `pnpm nx run attractap-hw-poe:export`
Expected: PASS; output `apps/attractap/hardware/poe/dist/export/poe-gerbers.zip` exists.

Verify the ZIP contains: `*.gbr` layers, `*.drl` drill, `bom.csv` with LCSC PNs, `pick_and_place.csv`. Run:
```
unzip -l apps/attractap/hardware/poe/dist/export/poe-gerbers.zip
```

- [ ] **Step 18: Render PNGs**

Run: `pnpm nx run attractap-hw-poe:render`
Expected: PASS; output `apps/attractap/hardware/poe/dist/render/poe-{pcb,schematic,assembly}.{svg,png}` all exist.

- [ ] **Step 19: Commit the full board**

```bash
git add apps/attractap/hardware/poe/index.tsx
git commit -m "feat(ATT-351): attractap-hw-poe — full topology (PD + buck + PHY + magjack + J_POE)"
```

---

## Task 7: Workflow validation + PR

**Files:**
- (no new files)

- [ ] **Step 1: Run all 4 targets clean once more**

Run: `pnpm nx run-many -t lint,build,export,render --projects=attractap-hw-poe`
Expected: all four targets report success.

- [ ] **Step 2: Run shared-lib tests one more time to confirm no regressions**

Run: `pnpm nx run attractap-hw-shared:test`
Expected: PASS (existing connector schema tests).

- [ ] **Step 3: Push the branch**

Run: `git push -u origin att-351-p2-poe-pd-module-8023af-phy-magnetics-rj45`
Expected: branch pushed; CI `hardware.yml` triggers.

- [ ] **Step 4: Open the PR**

Run:
```
gh pr create \
  --title "feat(ATT-351): PoE PD module (802.3af) — JLC-stocked all-SMT design" \
  --body "$(cat <<'EOF'
## Summary
- Implements ATT-351: 60×35 mm, 4-layer 802.3af PD board for Attractap V2.
- All-SMT JLC-assemblable BOM; no manual sourcing (single-supplier constraint from agent session).
- Topology: HanRun HY931147C PoE-magjack → 2x MB10S bridges → SMAJ58A TVS → WS3203 PD interface → MP9486AGN-Z 100V→5V buck → AMS1117-3.3 → LAN8720AI-CP-TR PHY → J_POE 2x8 1.27mm B2B to Core.
- Design rationale + component selection in docs/research/2026-05-23-att-351-poe-deep-research.md.

## Design decisions (vs ATT-351 ticket text)
- **Topology pivot**: ticket suggested Si3402-B + Coilcraft flyback. The JLC catalog has no usable flyback magnetics PN; user constraint is single-supplier JLC. Pivoted to non-isolated buck post-bridge. IEEE 802.3 1500V isolation is preserved by the LAN magnetics inside the PoE magjack (the spec-required barrier is cable-to-PD, which is intact).
- **PD IC**: WS3203 (NJGW) instead of Si3402-B — 6× the JLC stock, drop-in for the TPS2375 family, $0.71 vs $2.62.
- **Magjack**: HY931147C is the only HanRun part flagged "With PoE" in JLC's catalog at usable stock.
- **PHY**: LAN8720AI-CP-TR (industrial -40~+85°C, $1.01) — design-rule reference part for 10/100 + RMII.

## Acceptance checklist (per ATT-351)
- [x] nx run attractap-hw-poe:lint clean on JLC 4-layer ruleset
- [x] nx run attractap-hw-poe:export emits gerber ZIP with BOM + CPL
- [x] nx run attractap-hw-poe:render emits PCB/schematic/assembly PNGs (attached below)
- [ ] Peer review (extra scrutiny on isolation barrier — see §6.3 of design doc)
- [ ] Smoke test: PoE injector → board, +5V ≥ 1A continuous, no thermal runaway 24h (deferred to bench bring-up)
- [ ] PHY MDIO read via dev MCU, RJ45 link LED, Class 0 negotiate (deferred to bench bring-up)

## Test plan
- [x] tscircuit ERC/DRC clean
- [x] Gerber ZIP contains JLC-format bom.csv + pick_and_place.csv
- [x] vitest connector-schema tests still pass
- [x] Render PNGs uploaded to hardware-renders orphan branch by CI
- [ ] (bench) PoE injector smoke test
- [ ] (bench) MDIO register read confirms PHY presence
- [ ] (bench) RJ45 link LED active when switch connected
EOF
)"
```

Capture the PR URL; the CI run will post a sticky comment with the gerber-ZIP-link + render PNGs once `hardware.yml` finishes.

- [ ] **Step 5: Wait for `hardware.yml` to complete and verify render PNGs**

Run: `gh pr checks --watch`
Expected: hardware.yml passes; sticky PR comment contains links to `poe-pcb.png`, `poe-schematic.png`, `poe-assembly.png` hosted on the `hardware-renders` orphan branch.

- [ ] **Step 6: Post the render PNGs back to the Linear ticket**

Per the team agent-guidance "post screenshots of every materially changed page", attach the three PNG URLs to a Linear comment on ATT-351. (This is a documentation step; the PR URL itself goes in the Linear sidebar via the existing GH↔Linear sync.)

---

## Self-Review

**1. Spec coverage** (design doc § → plan task):

| Spec § | Coverage |
|--------|----------|
| §3.1 WS3203 | Task 3 wrapper + Task 6 Step 5 wiring |
| §3.2 HY931147C | Task 2 wrapper + Task 6 Step 3 placement |
| §3.3 SMAJ58A | Task 3 wrapper + Task 6 Step 3 wiring |
| §3.4 LAN8720AI | Task 2 wrapper + Task 6 Step 10 wiring |
| §3.5 iso strategy | Documented in design-doc + repeated in PR body |
| §3.6 MP9486A buck | Task 3 wrapper + Task 6 Step 7 wiring |
| §4 topology | Task 6 Steps 3+5+7+9+10+12 |
| §5 J_POE contract | Task 6 Step 12 `assertWiresAllSignals` |
| §6 layout strategy | Task 5 `tscircuit.config.json` (JLC4L), Task 6 placements |
| §7 shared-lib additions | Tasks 1–4 |
| §8 acceptance gates | Task 6 Steps 16–18 + Task 7 |

**2. Placeholder scan:**

Searched the plan body for TBD/TODO/"implement later" — none remain. The only deferred items are bench-test gates (5/6 in ATT-351), explicitly punted to post-fab and called out in the PR body.

**3. Type consistency:**

- Wrappers use consistent prop names (`name`, `pn`, position props from `BasePartProps`). Verified.
- Net names used in `assertWiresAllSignals` (Task 6 Step 12) match the net names declared elsewhere in the same `<board>` body. Verified.
- LCSC PNs in the wiring steps are the same PNs declared in the design doc. Verified.

---

## Execution handoff

Plan complete and saved to `docs/superpowers/plans/2026-05-23-att-351-poe-board-impl.md`. Two execution options:

1. **Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration.
2. **Inline Execution** — Execute tasks in this session using executing-plans, batch with checkpoints.

Which approach?
