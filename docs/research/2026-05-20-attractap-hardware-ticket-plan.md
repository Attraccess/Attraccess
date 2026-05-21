# Attractap V2 Hardware — Linear Ticket Creation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create 12 Linear issues that turn the approved spec into actionable work — 1 prep child under ATT-343, 1 new implementation parent issue, and 10 children grouped by phase, with `blockedBy` dependencies set per the spec.

**Architecture:** ATT-343 stays as research/prep. A new sibling parent issue "Attractap V2 Hardware Implementation" holds all execution work, broken into Phase 1 (Foundation), Phase 1.5 (Pipeline Proof), Phase 2 (Boards), Phase 3 (Integration). Phase gates enforced by Linear `blockedBy` so the connector spec must freeze before any board pinout work begins.

**Tech Stack:** Linear MCP (`mcp__linear__save_issue`, `mcp__linear__list_teams`, `mcp__linear__list_projects`, `mcp__linear__save_comment`), spec document at `docs/superpowers/specs/2026-05-20-attractap-pcb-tscircuit-design.md`.

---

## Reference Map — Spec → Linear Issue

| # | Title (short) | Parent | Phase | blockedBy | Spec section |
|---|---------------|--------|-------|-----------|--------------|
| T1 | Firmware folder move (`apps/attractap-firmware` → `apps/attractap/firmware`) | ATT-343 | prep | — | §4.2 ATT-343 child |
| T2 | Attractap V2 Hardware Implementation (PARENT) | (project root) | — | — | §4.1 |
| T3 | P1 Bootstrap nx hardware workspace + tscircuit + CI | T2 | 1 | T1 | §4.2 P1-Bootstrap |
| T4 | P1 Shared lib: connector spec freeze + JLC parts + mech envelope | T2 | 1 | T3 | §4.2 P1-SharedLib |
| T5 | P1.5 Beeper board — pipeline proof | T2 | 1.5 | T3, T4 | §4.3 |
| T6 | P2 Core board (ESP32-P4 + C6) | T2 | 2 | T5 | §4.4 |
| T7 | P2 NFC board (PN532 + WS2812 ring) | T2 | 2 | T5 | §4.4 |
| T8 | P2 PoE PD module (802.3af + PHY + magnetics + RJ45) | T2 | 2 | T5 | §4.4 |
| T9 | P2 DC-in module (5–32V buck) | T2 | 2 | T5 | §4.4 |
| T10 | P2 Touchscreen carrier (MIPI-DSI + GT911 + BL boost) | T2 | 2 | T5 | §4.4 |
| T11 | P3 Full-stack bring-up | T2 | 3 | T6, T7, T8, T9, T10 | §4.5 P3-FullStack |
| T12 | P3 Firmware stub — ESP-IDF skeleton for P4+C6 | T2 | 3 | T6 | §4.5 P3-FirmwareStub |

Total = 12 issues. T1 lives under ATT-343. T2 is the new parent. T3–T12 are children of T2.

---

## Linear field defaults

Apply to every issue unless overridden:
- **Team:** same team as ATT-343 (Attraccess workspace). Resolve with `mcp__linear__list_teams` if not known.
- **Project:** same project as ATT-343 (if any). Resolve with `mcp__linear__get_issue` on ATT-343 then re-use `projectId`.
- **Assignee:** unset (let humans claim).
- **Priority:** 3 (Medium) for execution tickets; 2 (High) for the parent T2.
- **Labels:** `hardware`, `tscircuit`. Plus phase-specific label (`phase-1`, `phase-1.5`, `phase-2`, `phase-3`) where applicable. Skip labels that do not exist in the workspace.
- **State:** Backlog.

---

## Task 0: Resolve Linear team + project context

**Files:** none (read-only Linear queries).

- [ ] **Step 1: Load Linear MCP tools**

```
ToolSearch select:mcp__linear__list_teams,mcp__linear__list_projects,mcp__linear__get_issue,mcp__linear__save_issue,mcp__linear__list_issue_labels,mcp__linear__save_comment
```

- [ ] **Step 2: Fetch ATT-343 to learn its `teamId` and `projectId`**

Call `mcp__linear__get_issue` with `id: "ATT-343"`. Capture the returned `team.id`, `team.key`, `project.id` (may be null), `assignee.id`, `state.id` for "Backlog".

- [ ] **Step 3: Look up label IDs**

Call `mcp__linear__list_issue_labels` with `teamId` from step 2. Capture IDs for `hardware`, `tscircuit`, `phase-1`, `phase-1.5`, `phase-2`, `phase-3` if they exist. Note which need creating (out of scope for this plan — skip labels that don't exist; agent doing creation may optionally create them up front).

- [ ] **Step 4: Record context for following tasks**

Write a short note to scratch:

```
TEAM_ID=<from step 2>
PROJECT_ID=<from step 2 or null>
BACKLOG_STATE_ID=<from step 2>
LABEL_HARDWARE=<from step 3 or null>
LABEL_TSCIRCUIT=<from step 3 or null>
LABEL_PHASE_1=<from step 3 or null>
LABEL_PHASE_1_5=<from step 3 or null>
LABEL_PHASE_2=<from step 3 or null>
LABEL_PHASE_3=<from step 3 or null>
```

These IDs feed every subsequent `save_issue` call.

---

## Task 1: Create T1 — Firmware folder move (ATT-343 child)

**Files:** none (Linear API only).

- [ ] **Step 1: Compose the issue body**

```markdown
## Goal

Move `apps/attractap-firmware/` to `apps/attractap/firmware/` so the new hardware nx apps under `apps/attractap/hardware/` can sit alongside the existing firmware under a common `apps/attractap/` umbrella.

## Why this is a prep ticket under ATT-343

ATT-343 is research/prep only. This rename is a low-risk, isolated refactor that must land before the hardware nx workspace bootstrap (T3 in the parent issue), so it belongs here as prep, not under the implementation parent.

## Scope

- `git mv apps/attractap-firmware apps/attractap/firmware`
- Update `apps/attractap/firmware/project.json` (path-sensitive fields).
- Update `platformio.ini` `extra_scripts` paths (e.g. `pre:tools/build_adaptive_certs_wrapper.py`).
- Update `apps/attractap/firmware/build_firmwares.py` if it uses repo-relative paths.
- Update any CI workflow that references `apps/attractap-firmware/**` paths (search `.github/workflows/*.yml`).
- Update doc links: `docs/en/attractap/*.md`, root `README.md`, `apps/attractap/firmware/README.md`.
- Update `nx.json` release projects list if `attractap-firmware` is referenced (it currently is not, per inspection).
- Rename nx project name from `attractap-firmware` to `attractap-firmware` (keep the project key the same to avoid release-config churn) OR to `attractap/firmware` (must update `nx.json release.projects` if so). **Pick whichever causes fewer downstream changes. Document the choice in the PR.**

## Acceptance

- PR opens green CI.
- `pnpm nx run <project>:build` succeeds for all existing PlatformIO envs (`attractap-touch`, `attractap-touch-v2`, `attractap-touch-ethernet`, `attractap-lite-ethernet`).
- No broken links in `docs/en/attractap/*.md` (search for `apps/attractap-firmware` and `attractap-firmware` references).
- `git grep "apps/attractap-firmware"` returns no matches after the move.

## Out of scope

- Splitting the firmware into per-variant nx projects.
- Any source-code change inside the firmware (only paths move).

## Blocks

- T3 (P1 Bootstrap) — the new hardware nx workspace at `apps/attractap/hardware/` should land after this rename so the umbrella folder exists cleanly.
```

- [ ] **Step 2: Create the issue via `mcp__linear__save_issue`**

Arguments:
```json
{
  "teamId": "<TEAM_ID>",
  "title": "Move firmware to apps/attractap/firmware (prep for hardware workspace)",
  "description": "<body from step 1>",
  "parentId": "<ATT-343 issue UUID>",
  "stateId": "<BACKLOG_STATE_ID>",
  "priority": 3,
  "labelIds": ["<LABEL_HARDWARE>"]
}
```

Strip out any null `labelIds`. Use ATT-343's UUID (not its identifier "ATT-343") for `parentId`.

- [ ] **Step 3: Capture the returned issue identifier**

Save the returned `identifier` (e.g. `ATT-XXX`) and `id` (UUID) as `T1_ID` and `T1_UUID`. Needed for T3's `blockedBy`.

---

## Task 2: Create T2 — Parent issue "Attractap V2 Hardware Implementation"

**Files:** none.

- [ ] **Step 1: Compose the issue body**

```markdown
## Goal

Build the next-generation Attractap NFC reader hardware as a modular PCB platform defined in tscircuit (TypeScript PCB-as-code). Replace the current Waveshare ESP32-S3 4" touch dev board + hand-wired PN532 stack with purpose-built, modular, hot-swappable boards.

## Design doc

Approved design lives in this repo at `docs/superpowers/specs/2026-05-20-attractap-pcb-tscircuit-design.md` (local, gitignored under `docs/superpowers/`). See ATT-343 for the research/prep context that produced this design.

## Fixed scope (set in stone)

- ESP32-P4 application MCU + ESP32-C6 networking co-MCU (esp_hosted SDIO link).
- 5–32V DC input + 802.3af PoE, diode-OR on the Core's +5V rail.
- WiFi (via C6).
- PN532 NFC reader + WS2812 RGB LED ring around the antenna.
- Beeper.
- 4" square MIPI-DSI touchscreen (GT911 cap touch), same/similar panel as inside the current Waveshare 4" dev board.
- Modular B2B-connected PCBs, star topology with Core as motherboard.
- Fab via JLCPCB with JLC SMT assembly.

## Out of scope

- 3D-printed case / enclosure CAD.
- Firmware development (its own epic, spawned from T12 P3-FirmwareStub).
- Cost optimization / V2 revisions.
- Regulatory compliance (CE/FCC).

## Child issues by phase

- **Phase 1 (Foundation)** — blocks Phase 1.5 + Phase 2
  - T3 P1 Bootstrap nx hardware workspace + tscircuit toolchain + CI
  - T4 P1 Shared lib: connector spec freeze + JLC parts wrappers + mech envelope
- **Phase 1.5 (Pipeline Proof)** — blocks Phase 2
  - T5 P1.5 Beeper board end-to-end (design → DRC/ERC → JLC order → assemble → smoke)
- **Phase 2 (Boards, parallel after T5)**
  - T6 P2 Core board (ESP32-P4 + C6 + power mux + regulators)
  - T7 P2 NFC board (PN532 + WS2812 ring)
  - T8 P2 PoE PD module (802.3af + PHY + magnetics + RJ45)
  - T9 P2 DC-in module (5–32V wide-input buck)
  - T10 P2 Touchscreen carrier (MIPI-DSI + GT911 + backlight boost)
- **Phase 3 (Integration & Hand-off)**
  - T11 P3 Full-stack bring-up
  - T12 P3 Firmware stub — ESP-IDF skeleton for P4+C6 (likely spawns its own epic)

## Definition of Done

All Phase 1, 1.5, 2, 3 children closed. A physical assembled stack has been demonstrated to power on, read NFC, light the LED ring, drive the panel and touch, and link Ethernet (with PoE installed) or WiFi (with DC-only).

## Conventions for child tickets

- Each board ticket has a rough body now (interface contract + acceptance gates). Detailed sub-tasks (schematic, layout, BOM review, fab order, smoke/functional test) are drafted lazily in a per-board "deep-ticket-drafting research" sub-issue spawned under ATT-343 at the time that board is picked up.
- Acceptance gates per board (full detail in spec §4.4):
  1. `nx run <board>:lint` — ERC + DRC pass on JLC ruleset.
  2. `nx run <board>:export` — gerber + JLC BOM + CPL emitted, no missing footprints, no unsourced parts.
  3. `nx run <board>:render` — PCB top/bottom + schematic PNGs attached to PR.
  4. Peer review on PR (schematic + layout walkthrough).
  5. Smoke test post-fab (24h power, rails ±5%, no thermal runaway).
  6. Functional test per spec §5.1.
```

- [ ] **Step 2: Create the parent issue**

Arguments:
```json
{
  "teamId": "<TEAM_ID>",
  "title": "Attractap V2 Hardware Implementation",
  "description": "<body from step 1>",
  "projectId": "<PROJECT_ID or null>",
  "stateId": "<BACKLOG_STATE_ID>",
  "priority": 2,
  "labelIds": ["<LABEL_HARDWARE>", "<LABEL_TSCIRCUIT>"]
}
```

- [ ] **Step 3: Capture identifier**

Save `T2_ID` and `T2_UUID`.

---

## Task 3: Create T3 — P1 Bootstrap

**Files:** none.

- [ ] **Step 1: Compose body**

```markdown
## Goal

Stand up the nx hardware workspace at `apps/attractap/hardware/`, pick a tscircuit version, configure per-board nx targets, and wire CI so PRs touching hardware code produce gerber ZIPs + PCB/schematic render PNGs as artifacts and PR comments.

## Why this is Phase 1

The connector spec (T4) and every board ticket (T5–T10) depend on this scaffolding existing. Frozen first so downstream work has a stable foundation.

## Scope

- Create `apps/attractap/hardware/` directory.
- Pick tscircuit version pin (latest stable at ticket pick-up time). Document the pinned version in `apps/attractap/hardware/README.md` with the date.
- Add nx generator or template for a hardware board project. Each board project under `apps/attractap/hardware/<name>/` must support these nx targets:
  - `build` — compile the tscircuit JSX into the tscircuit intermediate representation.
  - `export` — emit gerber ZIP + JLC-format BOM (LCSC part numbers in the LCSC column) + CPL pick-place file, ready for direct upload to JLCPCB.
  - `render` — emit PCB top + PCB bottom + schematic as PNG (and SVG if cheap) into `dist/apps/attractap/hardware/<board>/render/`.
  - `lint` — DRC (JLC 2-layer ruleset by default) + ERC.
- Build a one-LED placeholder board under `apps/attractap/hardware/_placeholder/` to validate the toolchain end-to-end. Remove or skip from CI once T5 (Beeper) lands.
- Add `.github/workflows/hardware.yml`:
  - Trigger on PRs touching `apps/attractap/hardware/**` or `libs/attractap-hw-shared/**`.
  - Step: pnpm install, `pnpm nx affected -t lint,build,export,render`.
  - Upload `dist/apps/attractap/hardware/**/*.zip` and `**/render/*.png` as workflow artifacts.
  - Post the render PNGs as a sticky PR comment (use `marocchino/sticky-pull-request-comment` or similar already in use).
- Update root `.gitignore` if needed (`dist/`, JLC export caches).
- Update `apps/attractap/hardware/README.md` with: tscircuit version, how to add a new board, how to run targets locally, JLC upload workflow.

## Blocked by

T1 (firmware folder move) — the parent folder `apps/attractap/` should be created cleanly by the rename PR before this scaffolds its hardware sibling.

## Acceptance

- A throw-away PR demonstrates the placeholder board producing gerber ZIP + PNG previews via CI.
- The PR shows the render PNG sticky comment populated.
- `pnpm nx run-many -t lint,build,export,render --projects=tag:scope:hardware` runs locally and passes.
- README explains the workflow such that a new contributor can add a board in under 30 minutes.

## Out of scope

- Any real-board design (handled by T5 + T6–T10).
- 4-layer DRC ruleset (default to 2-layer; specific boards opt into 4-layer in their own ticket).
- nx release pipeline for boards (boards do not auto-release).

## References

Design spec §3 (Repo Layout & Tooling).
```

- [ ] **Step 2: Create**

```json
{
  "teamId": "<TEAM_ID>",
  "title": "P1 Bootstrap nx hardware workspace + tscircuit toolchain + CI",
  "description": "<body>",
  "parentId": "<T2_UUID>",
  "stateId": "<BACKLOG_STATE_ID>",
  "priority": 3,
  "labelIds": ["<LABEL_HARDWARE>", "<LABEL_TSCIRCUIT>", "<LABEL_PHASE_1>"]
}
```

- [ ] **Step 3: Set blockedBy**

After creation, save the issue again with `relations` adding a `blocks` from T1 → this issue (or a `blockedBy` from this issue → T1, depending on which direction `mcp__linear__save_issue` accepts via its `relations` shape). If the save tool does not accept relations, fall back to two `save_comment` calls noting the dependency, and follow up in the Linear UI once the agent finishes.

- [ ] **Step 4: Capture identifier**

Save `T3_ID`, `T3_UUID`.

---

## Task 4: Create T4 — P1 Shared lib

**Files:** none.

- [ ] **Step 1: Compose body**

```markdown
## Goal

Land `libs/attractap-hw-shared/` containing the frozen interconnect spec, JLC parts wrappers, and mechanical envelope document. Every board ticket (T5–T10) imports from here.

## Why this is Phase 1

The connector pinouts are the contract every board must obey. Freezing them before any board pinout work prevents an N-board re-spin when a pin moves.

## Scope

### Connector spec
Create `libs/attractap-hw-shared/src/connectors/index.ts` exporting typed pinout constants for:

- `J_POE` (2×8 1.27mm B2B, ~16 pins) — +5V×2, GND×3, RMII_TXD0, RMII_TXD1, RMII_TX_EN, RMII_RXD0, RMII_RXD1, RMII_CRS_DV, RMII_REF_CLK (50MHz), MDIO, MDC, nRST.
- `J_PWR_DC` (4P 1.25mm) — +5V×2, GND×2.
- `J_NFC` (2×5 1.27mm B2B) — +3V3, GND×2, I2C_SDA, I2C_SCL, IRQ, RSTPDN, LED_DATA (WS2812), +5V (ring), NC.
- `J_BEEP` (3P 1.25mm) — +5V, GND, PWM.
- `J_DISP` (2×10 0.5mm B2B or FFC) — MIPI-DSI D0±, D1±, CLK±, RESET, BL_PWM, BL_EN, +5V, +3V3, GND×N, TOUCH_I2C_SDA, TOUCH_I2C_SCL, TOUCH_INT, TOUCH_RST.

Each connector is a `{ name, footprint, pins: { [pinNumber]: { signal, direction, voltage?, notes? } } }` shape. Add a TypeScript type guard so a board project gets a compile error if it omits a required signal.

Add vitest unit tests verifying:
- No duplicate pin numbers per connector.
- Every signal has a direction (`in` / `out` / `bidir` / `power` / `gnd`).
- Power and ground pin counts match the §2.3 table.

### JLC parts wrappers
Create `libs/attractap-hw-shared/src/parts/` containing typed React (tscircuit JSX) wrappers for the most-used parts. Initial set:
- Passive families: `R0402`, `R0603`, `C0402`, `C0603`, `L0603`.
- Common LDOs / bucks (placeholder PNs, refined per board): `AMS1117-3.3`, `LM74700` (ideal-diode), `MP2315` (buck).
- Connectors: B2B 1.27mm 2×N (parameterized N), JST PH 1.25mm 3P/4P, FFC 0.5mm 30P.
- MCU footprints: ESP32-P4-MINI-1, ESP32-C6-MINI-1.
- NFC: PN532 module footprint.
- Touch: GT911 footprint.
Each wrapper takes a JLCPCB part number prop and emits the matching footprint via tscircuit's JLC integration.

### Mechanical envelope doc
Create `libs/attractap-hw-shared/mech-envelope.md` containing:
- Per-board outline footprint (length × width × height budget).
- Per-board mounting hole pattern (count, M3 clearance ⌀3.2mm by default, positions to be filled per board).
- Stack-up height budget (sum of all module heights + B2B connector mated heights ≤ enclosure internal height — TBD per case CAD, document the assumed envelope ≤25mm internal as a working number).
- Antenna keep-out for the NFC board (no copper / LED traces within X mm of the PN532 antenna footprint — pin down X during T7).

### Auto-generated docs
Add an nx target `pnpm nx run attractap-hw-shared:doc-gen` that emits a markdown table of every connector + pin assignment into `libs/attractap-hw-shared/CONNECTORS.md`. Commit the generated file; CI checks it stays in sync with the TS source.

## Blocked by

T3 (P1 Bootstrap) — needs the nx workspace and tooling first.

## Acceptance

- All five connectors from the spec §2.3 table are in code with passing pin-schema tests.
- JLC parts wrapper list covers the parts list above; each compiles standalone.
- `mech-envelope.md` covers all six boards (Core, NFC, Beeper, PoE, DC-in, Touchscreen).
- `CONNECTORS.md` is generated and checked-in; CI fails if the TS source and the generated markdown drift.
- Once merged, this becomes the freeze point: any future pin reassignment requires a semver-major bump and is called out in PR description.

## Out of scope

- Per-board pin maps inside the Core MCU (lives in T6).
- 4-layer DRC ruleset.
- Mechanical CAD (case design).

## References

Design spec §2.3 (Interconnect contract), §2.4 (Mechanical envelope).
```

- [ ] **Step 2: Create**

```json
{
  "teamId": "<TEAM_ID>",
  "title": "P1 Shared lib — connector spec freeze + JLC parts + mech envelope",
  "description": "<body>",
  "parentId": "<T2_UUID>",
  "stateId": "<BACKLOG_STATE_ID>",
  "priority": 3,
  "labelIds": ["<LABEL_HARDWARE>", "<LABEL_TSCIRCUIT>", "<LABEL_PHASE_1>"]
}
```

- [ ] **Step 3: Set blockedBy = T3**

- [ ] **Step 4: Capture `T4_ID`, `T4_UUID`**

---

## Task 5: Create T5 — P1.5 Beeper (pipeline proof)

**Files:** none.

- [ ] **Step 1: Compose body**

```markdown
## Goal

Drive the entire toolchain — tscircuit → DRC/ERC → JLC fab + assembly → physical board in hand — on the smallest, lowest-risk board (Beeper) BEFORE any of the larger boards start, so toolchain pain shows up on a $50 board instead of on five $300+ boards.

## Why Phase 1.5 (gate before Phase 2)

Catches problems that only appear at fab/assembly time: missing footprints, BOM column mismatches, JLC SMT rejection (e.g. wrong CPL format), forgotten board cutouts. Cheaper to fix once on Beeper than five times in parallel.

## Interface contract

- Uses `J_BEEP` from the shared lib (3P 1.25mm: +5V, GND, PWM).
- Outline ≤ 25×25mm.
- Stack-up height ≤ stack envelope from `mech-envelope.md`.
- Mounting holes per `mech-envelope.md` Beeper entry.

## Scope

- Schematic in `apps/attractap/hardware/beeper/index.tsx`:
  - N-channel logic-level MOSFET (e.g. AO3400) gated by PWM.
  - Piezo buzzer to +5V, MOSFET drain to piezo low side.
  - 100Ω gate resistor + 10kΩ gate-to-GND pulldown.
  - TVS or flyback diode across piezo if it is a coil-type buzzer (note in the schematic comment whether the chosen part is piezo or magnetic).
  - J_BEEP connector at the board edge.
- Layout: single-sided SMT, 4 corner mounting holes, ground pour both sides.
- Run `nx run beeper:lint` (DRC/ERC) until clean.
- Run `nx run beeper:export`, hand-verify the JLC BOM and CPL look right, place a JLCPCB order (1–5 boards, SMT assembly enabled).
- When boards arrive, smoke test on bench supply: 5V applied, PWM 2–5kHz from a dev MCU, confirm audible output.

## Phase 1.5 lessons-learned write-up

Post a comment on T2 (parent) summarizing:
- Which tscircuit features worked, which fell short.
- Any manual BOM/CPL edits needed before JLC accepted the order.
- Total wall-time from `nx run beeper:export` to physical board.
- Cost per board.

These lessons feed the Phase 2 ticket bodies (deep-research sub-issues under ATT-343).

## Blocked by

T3 (P1 Bootstrap), T4 (P1 Shared lib).

## Acceptance

- ERC + DRC clean on JLC ruleset.
- JLC accepted the order without manual format intervention (any required tweaks documented in lessons-learned).
- Physical board(s) received, beeper produces audible output ≥ 70 dB SPL at 10cm (or whatever the chosen part rates).
- Lessons-learned comment posted on T2.

## Out of scope

- Louder H-bridge variant.
- Multi-frequency tone generation library on the MCU side.

## References

Design spec §4.3 (Phase 1.5), §5.1 (Beeper smoke checklist).
```

- [ ] **Step 2: Create**

```json
{
  "teamId": "<TEAM_ID>",
  "title": "P1.5 Beeper board — pipeline proof (smallest board end-to-end)",
  "description": "<body>",
  "parentId": "<T2_UUID>",
  "stateId": "<BACKLOG_STATE_ID>",
  "priority": 3,
  "labelIds": ["<LABEL_HARDWARE>", "<LABEL_TSCIRCUIT>", "<LABEL_PHASE_1_5>"]
}
```

- [ ] **Step 3: Set blockedBy = T3 and T4**

- [ ] **Step 4: Capture `T5_ID`, `T5_UUID`**

---

## Task 6: Create T6 — P2 Core board

**Files:** none.

- [ ] **Step 1: Compose body**

```markdown
## Goal

Design and fabricate the Core motherboard PCB: ESP32-P4 + ESP32-C6 + power mux + 3v3 regulator + the five daughter connectors (`J_POE`, `J_PWR_DC`, `J_NFC`, `J_BEEP`, `J_DISP`).

## Interface contract

Provides:
- `J_POE` (consumes +5V, RMII bus, MDIO/MDC from PoE module → ESP32-P4 EMAC).
- `J_PWR_DC` (consumes +5V from DC-in module).
- `J_NFC` (provides +3V3, +5V, I2C, IRQ, RSTPDN, LED_DATA).
- `J_BEEP` (provides +5V, GND, PWM).
- `J_DISP` (provides +5V, +3V3, MIPI-DSI, BL control, touch I2C, touch INT/RST).

Diode-OR between `J_POE.+5V` and `J_PWR_DC.+5V` onto a single internal +5V rail. ESP32-C6 reachable from ESP32-P4 over SDIO (esp_hosted convention).

## Scope (rough — deeper sub-tasks drafted in a per-board deep-research sub-issue under ATT-343)

- Schematic blocks: power-input mux, 3V3 regulator, ESP32-P4 + decoupling + boot strapping + PSRAM + flash, ESP32-C6 + SDIO bus to P4, antenna feed for C6 (PCB antenna or u.FL), USB-C for P4 (programming + power for bench bring-up), JTAG header, all five daughter connectors at board-edge locations matching `mech-envelope.md`.
- Layout: 4-layer (P4 fan-out and MIPI-DSI routing demand it). Controlled-impedance constraints documented for the MIPI-DSI lanes on `J_DISP` and the RMII traces from `J_POE` to the P4 EMAC pins.
- Power budget: rails sized for worst-case (panel + LED ring + NFC active + WiFi RX-Tx peak via C6).
- ESD protection on USB-C and on all externally-touchable signals.

## Acceptance gates (per spec §4.4)

1. `nx run core:lint` — ERC + DRC pass on JLC 4-layer ruleset.
2. `nx run core:export` — gerber + JLC BOM (with LCSC PNs) + CPL emitted; no missing footprints, no unsourced parts.
3. `nx run core:render` — PCB top/bottom + schematic PNGs attached to PR.
4. Peer review on PR.
5. Smoke test (Core functional checklist from spec §5.1): +5V and +3V3 rails within ±5% under 1A load, P4 enters bootloader over USB, C6 reachable via SDIO probe.
6. Functional bring-up handled in T11 (full-stack).

## Blocked by

T5 (Phase 1.5 pipeline proof).

## When picked up

Open a deep-research sub-issue under ATT-343 titled "Core board deep-ticket-drafting research" that produces the detailed schematic-, layout-, BOM-, and bring-up-task list. The spec §5.3 open-questions list for Core is the starting point for that research.

## Out of scope (defer to deep-research sub-issue)

- Exact PSRAM/flash sizing.
- Exact P4 pin map.
- Oscillator strategy.
- Antenna implementation choice for C6.
- Bootloader strap detail.

## References

Design spec §2 (Architecture), §4.4 (Phase 2 acceptance skeleton), §5.1 (Core smoke checklist), §5.3 (Core open questions).
```

- [ ] **Step 2: Create**

```json
{
  "teamId": "<TEAM_ID>",
  "title": "P2 Core board (ESP32-P4 + C6 + power mux + regulators)",
  "description": "<body>",
  "parentId": "<T2_UUID>",
  "stateId": "<BACKLOG_STATE_ID>",
  "priority": 3,
  "labelIds": ["<LABEL_HARDWARE>", "<LABEL_TSCIRCUIT>", "<LABEL_PHASE_2>"]
}
```

- [ ] **Step 3: Set blockedBy = T5**

- [ ] **Step 4: Capture `T6_ID`, `T6_UUID`**

---

## Task 7: Create T7 — P2 NFC board

**Files:** none.

- [ ] **Step 1: Compose body**

```markdown
## Goal

Design and fab the NFC reader board: PN532 NFC front-end + 24× WS2812 LED ring around the antenna footprint + the `J_NFC` connector to the Core.

## Interface contract

Consumes via `J_NFC`: +3V3 (logic), +5V (LED ring), GND×2, I2C (SDA/SCL), IRQ, RSTPDN, LED_DATA.

Provides: NFC card reads to the Core MCU over I2C.

## Scope (rough)

- Schematic: PN532 module footprint (per JLC catalog), I2C pull-ups, antenna matching network (initial values per PN532 datasheet, tunable per enclosure window during bring-up), WS2812 ring (24 LEDs, parameterizable), `J_NFC` connector.
- Layout: antenna footprint sized for the NFC tap window in the enclosure (target ~30×30mm or similar — pin down in deep-research). Antenna keep-out from `mech-envelope.md`. WS2812 ring around the antenna footprint, LED_DATA daisy-chained.
- EMI mitigation: ground-plane cut between antenna loop and LED ring traces, series resistor (33Ω) in LED_DATA at the first WS2812, LC filter on the +5V LED supply branch, decoupling per LED.
- 2-layer for cost (JLC default). Confirm during DRC pass that this is still tractable; bump to 4-layer if antenna matching needs it.

## Acceptance gates

1. `nx run nfc:lint` clean on JLC ruleset (2- or 4-layer, document the choice).
2. `nx run nfc:export` clean.
3. `nx run nfc:render` PNGs in PR.
4. Peer review.
5. Smoke test: +5V applied via J_NFC, LED ring lights all 24 pixels through a colour sweep driven by a dev MCU; I2C reachable; PN532 returns its firmware version.
6. Functional: reads a known MIFARE Classic and NTAG card via I2C from a dev MCU.

## Blocked by

T5.

## When picked up

Open a deep-research sub-issue under ATT-343 to pin down: antenna geometry (matched to the enclosure window cutout in the case CAD project), Q-factor tuning component values, and RF shielding strategy. Spec §5.3 NFC entries are the starting point.

## Out of scope

- Antenna for the final case (case CAD is its own epic).
- Multi-protocol RF (only ISO-14443A via PN532).

## References

Design spec §2.3 (J_NFC pinout), §4.4 (Phase 2 acceptance), §5.1 (NFC smoke), §5.2 R5 (RF/EMI mitigations), §5.3 (NFC open questions).
```

- [ ] **Step 2: Create**

```json
{
  "teamId": "<TEAM_ID>",
  "title": "P2 NFC board (PN532 + WS2812 ring)",
  "description": "<body>",
  "parentId": "<T2_UUID>",
  "stateId": "<BACKLOG_STATE_ID>",
  "priority": 3,
  "labelIds": ["<LABEL_HARDWARE>", "<LABEL_TSCIRCUIT>", "<LABEL_PHASE_2>"]
}
```

- [ ] **Step 3: Set blockedBy = T5**

- [ ] **Step 4: Capture `T7_ID`, `T7_UUID`**

---

## Task 8: Create T8 — P2 PoE PD module

**Files:** none.

- [ ] **Step 1: Compose body**

```markdown
## Goal

Design and fab the PoE PD module: RJ45 jack + magnetics + Ethernet PHY + 802.3af PD controller + isolated 5V buck. Self-contained — passes only +5V and the RMII bus (with MDIO/MDC) back to the Core via `J_POE`.

## Interface contract

Provides via `J_POE` (2×8 1.27mm B2B, ~16 pins): +5V×2, GND×3, RMII_TXD0, RMII_TXD1, RMII_TX_EN, RMII_RXD0, RMII_RXD1, RMII_CRS_DV, RMII_REF_CLK (50MHz, must drive this from the PHY's REF_CLK output), MDIO, MDC, nRST.

Consumes: 802.3af PoE on the RJ45 jack (Class 0 negotiation, ~13W max).

## Scope (rough)

- Schematic blocks: integrated-magnetics RJ45 jack (or discrete jack + magnetics), 802.3af PD controller (Si3402-B or equivalent — confirm in deep-research), full-wave bridge, transient suppression, isolated 5V buck output, 100Mbit Ethernet PHY (e.g. LAN8720A or similar — confirm in deep-research), 25MHz crystal for the PHY, MDIO pull-ups, J_POE connector.
- Layout: galvanic isolation barrier between cable-side (high-voltage, ~57V at PSE end) and SELV-side (everything past the buck output). Document the barrier creepage on the silkscreen.
- Differential pair routing for the Ethernet TX±/RX± lines kept short on the cable-side; only RMII (single-ended) crosses J_POE.
- 4-layer with continuous ground plane (PoE switching noise + Ethernet differential pairs both want it).

## Acceptance gates

1. `nx run poe:lint` clean on JLC 4-layer ruleset.
2. `nx run poe:export` clean.
3. `nx run poe:render` PNGs in PR.
4. Peer review (extra scrutiny on isolation barrier).
5. Smoke test: PoE injector → board, +5V output measured under 1A continuous, no thermal runaway over 24h.
6. Functional: PHY register read via MDIO from a dev MCU; RJ45 link LED active when a switch is connected; Class 0 negotiated correctly.

## Blocked by

T5.

## When picked up

Open a deep-research sub-issue under ATT-343 to pin down: PD controller exact PN, magnetics PN (integrated vs discrete), transient suppression rating, PHY exact PN, REF_CLK source/direction strategy.

## Out of scope

- 802.3at (PoE+) — explicitly af only per spec.
- Passive PoE.

## References

Design spec §2 (Architecture), §2.3 (J_POE pinout), §4.4, §5.1 (PoE smoke), §5.3 (PoE open questions).
```

- [ ] **Step 2: Create**

```json
{
  "teamId": "<TEAM_ID>",
  "title": "P2 PoE PD module (802.3af + PHY + magnetics + RJ45)",
  "description": "<body>",
  "parentId": "<T2_UUID>",
  "stateId": "<BACKLOG_STATE_ID>",
  "priority": 3,
  "labelIds": ["<LABEL_HARDWARE>", "<LABEL_TSCIRCUIT>", "<LABEL_PHASE_2>"]
}
```

- [ ] **Step 3: Set blockedBy = T5**

- [ ] **Step 4: Capture `T8_ID`, `T8_UUID`**

---

## Task 9: Create T9 — P2 DC-in module

**Files:** none.

- [ ] **Step 1: Compose body**

```markdown
## Goal

Design and fab the DC-in module: 5–32V wide-input buck → 5V regulated output via `J_PWR_DC`. Includes DC barrel jack + screw terminal block + reverse-polarity protection + TVS suppression.

## Interface contract

Provides via `J_PWR_DC` (4P 1.25mm): +5V×2, GND×2.

Consumes: DC barrel jack (centre-positive, typical 5.5×2.1mm) OR 2-pin screw terminal — both populated in parallel, both reverse-polarity protected.

## Scope (rough)

- Schematic: input MOSFET reverse-polarity protection (P-channel high-side), TVS clamp (SMBJ rated for 32V working / 40V+ clamp), wide-input synchronous buck IC (e.g. MP2315 or MP2480 — confirm in deep-research) configured for 5V/2A continuous, input/output ceramics + bulk electrolytic, input fuse (resettable polyfuse, 2A hold).
- Layout: 2-layer fine for this current/voltage range. Star-ground at the buck IC. Thermal copper pour for the buck IC pad.

## Acceptance gates

1. `nx run power:lint` clean on JLC 2-layer ruleset.
2. `nx run power:export` clean.
3. `nx run power:render` PNGs in PR.
4. Peer review.
5. Smoke test (per spec §5.1): accept 5V, 12V, 24V, 32V input → +5V at ≥1A continuous on J_PWR_DC; rails within ±5%; no smoke on reverse polarity at 24V.
6. 24h soak at 24V input, 1A load.

## Blocked by

T5.

## When picked up

Open a deep-research sub-issue under ATT-343 to pin down: buck IC PN (sync vs async), screw terminal type (Phoenix Contact MC vs JST-VH), exact TVS PN.

## Out of scope

- USB-C PD input.
- Battery backup.

## References

Design spec §2 (Architecture), §2.3 (J_PWR_DC pinout), §4.4, §5.1 (DC-in smoke), §5.3 (DC-in open questions).
```

- [ ] **Step 2: Create**

```json
{
  "teamId": "<TEAM_ID>",
  "title": "P2 DC-in module (5–32V wide-input buck)",
  "description": "<body>",
  "parentId": "<T2_UUID>",
  "stateId": "<BACKLOG_STATE_ID>",
  "priority": 3,
  "labelIds": ["<LABEL_HARDWARE>", "<LABEL_TSCIRCUIT>", "<LABEL_PHASE_2>"]
}
```

- [ ] **Step 3: Set blockedBy = T5**

- [ ] **Step 4: Capture `T9_ID`, `T9_UUID`**

---

## Task 10: Create T10 — P2 Touchscreen carrier

**Files:** none.

- [ ] **Step 1: Compose body**

```markdown
## Goal

Design and fab the touchscreen carrier PCB: MIPI-DSI panel FFC connector + GT911 touch FFC connector + backlight boost driver + level shifting + the `J_DISP` connector to the Core.

The carrier hosts the connectors and drive electronics; the actual 4" panel and touch overlay are sourced as a panel module (raw panel from a vendor like Topfoison/DJN/Wisecoco, or the Adafruit drop-in fallback that uses essentially the same panel as the Waveshare 4" module).

## Interface contract

Consumes via `J_DISP` (2×10 0.5mm B2B or FFC): MIPI-DSI D0±, D1±, CLK±, RESET, BL_PWM, BL_EN, +5V, +3V3, GND×N, TOUCH_I2C_SDA, TOUCH_I2C_SCL, TOUCH_INT, TOUCH_RST.

Provides: panel FFC + touch FFC.

## Scope (rough)

- Schematic: MIPI-DSI panel FFC connector (lane count and pinout chosen in deep-research per the candidate panel list), GT911 touch FFC connector with I2C pull-ups, backlight boost driver IC (handles LED string ~25V at ~20mA — exact part chosen with panel), backlight enable and PWM control, RESET signal handling, optional level shifters on touch I2C if the panel module runs at 1.8V touch logic.
- Layout: controlled-impedance differential pairs on the MIPI-DSI lanes (90Ω diff). Length-match the three MIPI pairs to within ~1mm. 4-layer to give a clean reference plane for MIPI-DSI.

## Acceptance gates

1. `nx run touchscreen:lint` clean on JLC 4-layer ruleset.
2. `nx run touchscreen:export` clean.
3. `nx run touchscreen:render` PNGs in PR.
4. Peer review (extra scrutiny on MIPI routing and panel pinout).
5. Smoke test: +5V/+3V3 applied via J_DISP, no thermal runaway, panel-side connector pinout cross-checked against the panel datasheet with a multimeter.
6. Functional bring-up in T11 (full-stack).

## Blocked by

T5.

## When picked up

Open a deep-research sub-issue under ATT-343 to:
1. Shortlist 2–3 candidate 4" square MIPI-DSI panels with bonded GT911 (Topfoison, DJN, Wisecoco) + the Adafruit off-the-shelf fallback.
2. Pin down panel FFC pinout, lane count, BL string Vf, level-shifter need on touch I2C.
3. Document the FFC adapter strategy if Adafruit fallback is needed.

## Out of scope

- Custom panel design.
- Capacitive touch IC selection (GT911 fixed per spec).

## References

Design spec §2.3 (J_DISP pinout), §4.4, §5.1 (Touchscreen smoke), §5.2 R3 (panel sourcing risk + Adafruit fallback), §5.3 (Touchscreen open questions).
```

- [ ] **Step 2: Create**

```json
{
  "teamId": "<TEAM_ID>",
  "title": "P2 Touchscreen carrier (MIPI-DSI + GT911 + backlight boost)",
  "description": "<body>",
  "parentId": "<T2_UUID>",
  "stateId": "<BACKLOG_STATE_ID>",
  "priority": 3,
  "labelIds": ["<LABEL_HARDWARE>", "<LABEL_TSCIRCUIT>", "<LABEL_PHASE_2>"]
}
```

- [ ] **Step 3: Set blockedBy = T5**

- [ ] **Step 4: Capture `T10_ID`, `T10_UUID`**

---

## Task 11: Create T11 — P3 Full-stack bring-up

**Files:** none.

- [ ] **Step 1: Compose body**

```markdown
## Goal

Take one of each board (Core, PoE, DC-in, NFC, Beeper, Touchscreen), assemble the full stack, power it on, and prove that every interface defined in the connector spec actually works in the assembled product.

## Scope

- Order 1 of each Phase 2 board (if not already ordered for individual smoke tests).
- Bench-assemble the stack: Core + PoE + NFC + Beeper + Touchscreen. Verify all B2B connectors mate cleanly (no force, no skew).
- Power up first via DC-in only (safer for initial bring-up), then via PoE injector.
- Verify the diode-OR rail stays steady when both PoE and DC are present.
- Load a minimal ESP-IDF firmware (from T12) onto the Core's ESP32-P4. Confirm boot via USB serial.
- Bring up ESP32-C6 via SDIO link from the P4 (esp_hosted handshake).
- Bring up Ethernet via the PoE module's PHY: link LED active on the RJ45 jack, ping successful from a switch.
- Bring up WiFi via the C6: scan, connect to a test SSID.
- Bring up NFC: P4 → I2C → PN532 firmware version readable; tap a known card → UID returned.
- Bring up LED ring: WS2812 colour sweep visible.
- Bring up beeper: PWM at 2–5kHz produces audible tone.
- Bring up display: MIPI-DSI panel init sequence runs, test pattern (e.g. colour bars) visible on the panel.
- Bring up touch: GT911 reports touch coordinates over I2C; touch point overlays correctly on the displayed test pattern.

## Acceptance

- Photos of the assembled stack from multiple angles.
- A short (under 60s) video showing all of the above functional checks in sequence.
- A summary comment on T2 (parent) noting any rework needed on any Phase 2 board (e.g. mechanical clearance issues, signal-integrity surprises). Rework spawns follow-up tickets, not blockers on this T11.

## Blocked by

T6, T7, T8, T9, T10.

## Out of scope

- Final-case integration (case CAD is a future epic).
- Production-quality firmware (T12 stub is enough).
- Cost optimization.

## References

Design spec §4.5 (Phase 3), §5.1 (all per-board smoke checklists).
```

- [ ] **Step 2: Create**

```json
{
  "teamId": "<TEAM_ID>",
  "title": "P3 Full-stack bring-up (all 6 boards assembled and functional)",
  "description": "<body>",
  "parentId": "<T2_UUID>",
  "stateId": "<BACKLOG_STATE_ID>",
  "priority": 3,
  "labelIds": ["<LABEL_HARDWARE>", "<LABEL_PHASE_3>"]
}
```

- [ ] **Step 3: Set blockedBy = T6, T7, T8, T9, T10**

- [ ] **Step 4: Capture `T11_ID`, `T11_UUID`**

---

## Task 12: Create T12 — P3 Firmware stub

**Files:** none.

- [ ] **Step 1: Compose body**

```markdown
## Goal

Land an ESP-IDF skeleton project that targets the new ESP32-P4 Core board, drives the ESP32-C6 over SDIO via `esp_hosted` for WiFi, and does the minimum MIPI-DSI panel init so T11 (full-stack bring-up) has something to load.

This is explicitly a STUB. Full firmware port is its own future epic, spawned from this ticket once the stub boots cleanly.

## Scope

- New nx project at `apps/attractap/firmware-v2/` (alongside the existing `apps/attractap/firmware/`, not replacing it — the existing firmware still serves the in-field Touch v1/v2 and Lite variants and must keep building).
- ESP-IDF (not Arduino) project targeting `esp32p4`.
- Minimum boot path: serial "Attractap V2 firmware boot OK" log line, FreeRTOS up.
- `esp_hosted` SDIO link to ESP32-C6, WiFi scan + connect demo.
- MIPI-DSI driver init for the panel chosen in T10 deep-research; display a static test pattern.
- Document how to flash via USB-C and how to attach the JTAG debugger.

## Acceptance

- `pnpm nx run attractap-firmware-v2:build` succeeds (or whatever target name lands in the nx project).
- On the assembled stack (T11), flashing the binary produces:
  - Serial log "Attractap V2 firmware boot OK"
  - C6 link up, WiFi scan returns a list
  - Display shows a static test pattern via MIPI-DSI
- README in the project explains how to extend the stub.

## Blocked by

T6 (Core board needed before firmware can be flashed). NOT blocked by T11 — this stub is what T11 USES; it must exist before T11 can run its functional checks. Recommended sequencing: T6 lands → T12 starts in parallel with T7–T10 → T11 picks up once all Phase 2 boards + T12 are ready.

## Out of scope (defer to follow-up epic spawned from this ticket)

- NFC card-read logic.
- LED ring animations.
- Beeper drive code.
- Touch input handling.
- Network protocol to the Attraccess backend.
- OTA updates.

## References

Design spec §4.5 (Phase 3), §1 (ESP32-P4 + C6 fixed).
```

- [ ] **Step 2: Create**

```json
{
  "teamId": "<TEAM_ID>",
  "title": "P3 Firmware stub — ESP-IDF skeleton for P4 + C6 (esp_hosted)",
  "description": "<body>",
  "parentId": "<T2_UUID>",
  "stateId": "<BACKLOG_STATE_ID>",
  "priority": 3,
  "labelIds": ["<LABEL_HARDWARE>", "<LABEL_PHASE_3>"]
}
```

- [ ] **Step 3: Set blockedBy = T6**

- [ ] **Step 4: Capture `T12_ID`, `T12_UUID`**

---

## Task 13: Post a summary comment on ATT-343

**Files:** none.

- [ ] **Step 1: Compose comment body**

```markdown
## Tickets created for Attractap V2 hardware work

Design doc: `docs/superpowers/specs/2026-05-20-attractap-pcb-tscircuit-design.md` (local, gitignored — repo convention).

### Under ATT-343 (research/prep)
- **<T1_ID>** Firmware folder move (prep, blocks T3 below)

### Implementation parent
- **<T2_ID> Attractap V2 Hardware Implementation** — new sibling of ATT-343 with 10 children:
  - Phase 1 (Foundation)
    - <T3_ID> Bootstrap nx hardware workspace + tscircuit + CI
    - <T4_ID> Shared lib (connector spec + JLC parts + mech envelope)
  - Phase 1.5 (Pipeline Proof)
    - <T5_ID> Beeper board end-to-end
  - Phase 2 (Boards, parallel)
    - <T6_ID> Core (ESP32-P4 + C6)
    - <T7_ID> NFC (PN532 + WS2812 ring)
    - <T8_ID> PoE PD module
    - <T9_ID> DC-in module
    - <T10_ID> Touchscreen carrier
  - Phase 3 (Integration & Hand-off)
    - <T11_ID> Full-stack bring-up
    - <T12_ID> Firmware stub (ESP-IDF for P4+C6)

### Notes
- Per-board deep-ticket-drafting research sub-issues under ATT-343 are NOT created upfront. Each board ticket says "open a deep-research sub-issue under ATT-343 when picked up". Avoids dead planning.
- `blockedBy` chain enforces phase order in Linear.
- ATT-343 can move to Done once this comment is posted.
```

- [ ] **Step 2: Post the comment**

Call `mcp__linear__save_comment` on ATT-343 with the body. Substitute the captured IDs.

- [ ] **Step 3: Move ATT-343 to "In Review" or appropriate "ready to close" state**

Use `mcp__linear__save_issue` to update ATT-343 state to the workspace's "In Review" or "Done" state, whichever is correct for completed-prep work (resolve with `mcp__linear__list_issue_statuses`).

---

## Self-Review

**Spec coverage check (spec sections → tasks):**
- §1 Goal & Constraints → covered in T2 body.
- §2 Architecture (topology, power tree, interconnect, mech) → T2 body + T4 (connector spec + mech-envelope.md).
- §3 Repo layout & tooling → T3 (Bootstrap).
- §4.1 Linear hierarchy → all tasks T1–T13.
- §4.2 Foundation tickets → T1 (firmware move under ATT-343), T3 (Bootstrap), T4 (Shared lib).
- §4.3 Pipeline proof → T5 (Beeper).
- §4.4 Phase 2 boards → T6 (Core), T7 (NFC), T8 (PoE), T9 (DC-in), T10 (Touchscreen).
- §4.5 Phase 3 → T11 (Full-stack), T12 (Firmware stub).
- §5 Validation → embedded in each board ticket's acceptance gates.
- §6 DoD for ATT-343 → T13 (summary comment on ATT-343 + state transition).

No spec section unmapped.

**Placeholder scan:** searched the plan body for TBD/TODO/"implement later". The remaining occurrences are intentional — they live inside the ticket bodies as "pin down in deep-research" markers, which IS the spec's deferral pattern (per-board open questions punted to lazy deep-research sub-issues). These are not plan failures.

**ID consistency:** every `<Tn_UUID>` / `<Tn_ID>` placeholder is defined by the preceding task's "Capture identifier" step. The cross-references in T13's summary comment all use captured IDs.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-05-20-attractap-hardware-tickets.md`.

Two execution options:

1. **Subagent-Driven (recommended)** — I dispatch a fresh subagent per Linear-issue creation task, review between tasks, fast iteration.
2. **Inline Execution** — Execute Task 0 → Task 13 in this session using `executing-plans`, with checkpoints at the end of each Phase block.

Recommend **Inline** for this plan: each task is a single Linear API call (no code to compile, no tests to run), and the cross-task dependencies (capturing UUIDs for `blockedBy`) are easier to thread in-session than across subagents.
