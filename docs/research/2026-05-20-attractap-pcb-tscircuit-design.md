# Attractap V2 Hardware — tscircuit-based Modular PCB Platform

- Linear prep ticket: [ATT-343](https://linear.app/attraccess/issue/ATT-343/prepare-tickets-for-attractap-pcb-design-using-tscircuit)
- Date: 2026-05-20
- Status: Design approved, pending implementation tickets

## 1. Goal & Constraints

Build the next-generation Attractap NFC reader hardware as a modular PCB platform defined in [tscircuit](https://tscircuit.com) (TypeScript PCB-as-code). The current product is a Waveshare ESP32-S3 4" touch dev board + a hand-wired PN532 NFC module in a 3D-printed case; the V2 effort replaces this with purpose-built, modular, hot-swappable boards.

**Fixed requirements (set in stone, not negotiable):**
- ESP32-P4 as application MCU (MIPI-DSI display, more RAM/perf).
- ESP32-C6 as networking co-MCU (WiFi 6 + BLE 5 via `esp_hosted` to P4).
- DC input 5–32V.
- 802.3af PoE.
- WiFi (via C6).
- PN532 NFC reader.
- Beeper.
- WS2812 RGB LED ring around the PN532 antenna for user feedback.
- Modular PCBs with B2B connectors so individual boards can be replaced when damaged.
- 4" square touchscreen, same/similar to the panel inside the current Waveshare ESP32-S3 4" dev board.

**Out of scope for this plan:**
- 3D-printed case / enclosure CAD.
- Firmware development for the new platform (its own epic, spawned from Phase 3).
- Cost optimization / V2 revisions.
- Regulatory compliance (CE/FCC) — flagged as a future epic.

## 2. Architecture

### 2.1 Topology

Star topology with the Core acting as a motherboard. Daughter modules plug into the Core via dedicated, keyed B2B connectors — each module type has a unique pinout so wrong-module plug-in is physically prevented.

```
                      ┌─────────────────────────────────────────────┐
                      │                   Core                       │
                      │  ESP32-P4 + ESP32-C6 + PSRAM/Flash + diode-OR│
                      └──┬───────┬───────┬───────┬─────────┬────────┘
                  J_POE  │   J_PWR_DC  J_NFC  J_BEEP   J_DISP
                         │       │       │       │         │
                      ┌──┴──┐ ┌──┴──┐ ┌──┴──┐ ┌──┴──┐ ┌────┴────┐
                      │ PoE │ │ DC  │ │ NFC │ │Beep │ │Touchscr.│
                      │     │ │     │ │+LED │ │     │ │ carrier │
                      └─────┘ └─────┘ └─────┘ └─────┘ └─────────┘
```

The PoE module is self-contained: it owns the RJ45 jack, magnetics, Ethernet PHY, PD controller and 5V buck. Only "useful" signals cross J_POE to the Core: +5V power and the RMII bus (Ethernet data, logic-level, 7 signals + MDIO/MDC).

The DC-in module owns the DC barrel jack / screw terminal and the 5–32V wide-input buck. Only +5V/GND cross J_PWR_DC to the Core.

PoE and DC-in can be installed simultaneously; the Core's diode-OR merges both +5V outputs onto a single main rail. DC-in-only builds run WiFi-only via the C6 (no Ethernet).

### 2.2 Power tree

```
J_POE.+5V ──┐
            ├── diode-OR (Schottky or LM74700-style ideal-diode) ── +5V main rail
J_PWR_DC.+5V ┘                                                    │
                                                                  ├── +5V to LED ring, beeper, backlight boost, panel logic
                                                                  └── +3V3 LDO/buck (Core) ── ESP32-P4, ESP32-C6, PN532, GT911, IO
```

### 2.3 Interconnect contract (frozen in shared lib)

| Connector | Module          | Pins                  | Signals                                                                                                                                                    |
|-----------|-----------------|-----------------------|------------------------------------------------------------------------------------------------------------------------------------------------------------|
| J_POE     | PoE PD          | 2×8 1.27mm B2B (~16)  | +5V×2, GND×3, RMII_TXD0, RMII_TXD1, RMII_TX_EN, RMII_RXD0, RMII_RXD1, RMII_CRS_DV, RMII_REF_CLK (50MHz), MDIO, MDC, nRST                                  |
| J_PWR_DC  | DC-in           | 4P 1.25mm             | +5V×2, GND×2                                                                                                                                              |
| J_NFC     | NFC + LED ring  | 2×5 1.27mm B2B        | +3V3, GND×2, I2C_SDA, I2C_SCL, IRQ, RSTPDN, LED_DATA (WS2812), +5V (ring), NC                                                                              |
| J_BEEP    | Beeper          | 3P 1.25mm             | +5V, GND, PWM                                                                                                                                              |
| J_DISP    | Touchscreen     | 2×10 0.5mm B2B (or FFC) | MIPI-DSI D0± D1± CLK±, RESET, BL_PWM, BL_EN, +5V, +3V3, GND×N, TOUCH_I2C_SDA, TOUCH_I2C_SCL, TOUCH_INT, TOUCH_RST                                          |

Pinouts live in `libs/attractap-hw-shared/src/connectors/` as TypeScript constants. An auto-generated markdown table in the same lib is the human-readable single source of truth. Any pin reassignment after Phase 1 freeze = semver major bump → all consuming boards re-spin.

### 2.4 Mechanical envelope (not full case CAD)

Form factor matches the existing teal case (see ATT-343 attached photos): rectangular tall enclosure, ~100mm wide × ~180mm tall × ~30–40mm deep. Touchscreen on the top face. NFC + LED ring on the bottom face (parallel to the user-tap surface). Other modules stacked between. Terminals/connectors at the rear.

The shared lib carries a `mech-envelope.md` document listing each board's outline (DXF/STEP exported from tscircuit), mounting hole pattern (3.2mm M3 clearance, positions TBD per board), and stack-up height budget. Actual case CAD is a future Linear epic, not part of this plan.

## 3. Repository Layout & Tooling

```
apps/attractap/
  firmware/                      # moved from apps/attractap-firmware via separate prep PR
  hardware/
    core/                        # nx app, tscircuit project — motherboard
    nfc/                         # PN532 + WS2812 LED ring
    beeper/                      # pipeline-prove board (Phase 1.5)
    poe/                         # 802.3af PD + magnetics + PHY + RJ45
    power/                       # 5–32V DC-in
    touchscreen/                 # MIPI-DSI carrier + GT911 + backlight boost
libs/
  attractap-hw-shared/           # connector pinouts, JLC parts wrappers, helpers, mech-envelope.md
```

### 3.1 Per-board nx project shape

Each `apps/attractap/hardware/<board>/` is an nx project containing:
- `tscircuit.config.ts`, `index.tsx` (top-level `<board>` JSX).
- per-subcircuit files (power, MCU, IO, connectors).
- nx targets:
  - `build` — compile circuit.
  - `export` — emit gerber + JLC-format BOM (with LCSC PNs) + CPL pick-place ZIP for the JLC fab/SMT pipeline.
  - `render` — emit PCB top/bottom + schematic PNG/SVG for PR previews.
  - `lint` — DRC (design rule check, JLC 2-layer ruleset by default; 4-layer for Core/PoE/Touchscreen if needed) + ERC (electrical rule check).
  - `test` — vitest for shared lib unit tests; no per-board unit tests expected.

Artifacts land in `dist/apps/attractap/hardware/<board>/`.

### 3.2 Nx project graph

Nx tags: `scope:hardware`, `type:board`, `type:hw-lib`. Lint rule enforces that only `libs/attractap-hw-shared` may be imported across boards (no board-to-board imports).

### 3.3 CI

New workflow `.github/workflows/hardware.yml`:
- Trigger: PRs that touch `apps/attractap/hardware/**` or `libs/attractap-hw-shared/**`.
- Steps: install pnpm deps, run `nx affected -t lint,build,export,render`.
- Upload gerber ZIPs + render PNGs as workflow artifacts.
- Post render PNGs (PCB top/bottom + schematic) as a sticky PR comment for human review.

### 3.4 Release

Hardware boards are **not** part of `nx.json` `release.projects`. Each board ships under manual git tags `hw/<board>/v<major>.<minor>` when a physical board is ordered. The tag matches the gerber ZIP filename used for fab orders.

### 3.5 Fab & assembly

JLCPCB for fab + JLC SMT assembly. tscircuit's JLC Parts integration provides automatic footprint resolution from JLCPN numbers. The shared lib wraps the most-used JLC parts (passives, regulators, MCUs, connectors) as typed React components so BOM mistakes get caught at compile time.

## 4. Phased Ticket Plan

### 4.1 Linear hierarchy

```
ATT-343 (research/prep, existing — this design lives here)
  ├── ATT-XXX  Firmware folder move (prep) — apps/attractap-firmware → apps/attractap/firmware
  │             (blocks the new parent's Phase 1 Bootstrap)
  └── (lazy, spawned per board when work picks up) ATT-XXX  Deep-ticket-drafting research for <board>
ATT-XXY  NEW PARENT — "Attractap V2 Hardware Implementation"
  ├── Phase 1 (Foundation) — blocks Phase 1.5 + Phase 2
  │   ├── ATT-XXX  Bootstrap nx hardware workspace + tscircuit toolchain + CI
  │   └── ATT-XXX  Shared lib: connector spec freeze + JLC parts wrappers + mech-envelope.md
  ├── Phase 1.5 (Pipeline Proof) — blocks Phase 2
  │   └── ATT-XXX  Beeper board end-to-end: design → DRC/ERC → JLC order → assemble → smoke test
  ├── Phase 2 (Boards, parallel after Phase 1.5)
  │   ├── ATT-XXX  Core board (ESP32-P4 + C6 + power mux + regulators)
  │   ├── ATT-XXX  NFC board (PN532 + WS2812 ring)
  │   ├── ATT-XXX  PoE PD module (802.3af + PHY + magnetics + RJ45)
  │   ├── ATT-XXX  DC-in module (5–32V wide-input buck)
  │   └── ATT-XXX  Touchscreen carrier (MIPI-DSI + GT911 + backlight boost)
  └── Phase 3 (Integration & Hand-off)
      ├── ATT-XXX  Full-stack bring-up (all 6 boards assembled, power-on, link, NFC read, display init, touch)
      └── ATT-XXX  Firmware port stub — ESP-IDF skeleton for P4+C6 (likely spawns its own epic)
```

**Total tickets created in Linear: 12** (1 ATT-343 child + 1 new parent + 2 Phase 1 + 1 Phase 1.5 + 5 Phase 2 + 2 Phase 3).

### 4.2 ATT-343 child + Phase 1 — Foundation (full detail in tickets)

These tickets receive the most detailed body content. They lock in tool-chain decisions and inter-board contracts. The firmware-folder-move sits under ATT-343 as a prep ticket and blocks P1-Bootstrap.

**ATT-343 child: FirmwareMove (prep, blocks P1-Bootstrap):**
- `git mv apps/attractap-firmware apps/attractap/firmware` (single atomic PR).
- Update `project.json` paths, PlatformIO `extra_scripts`, any CI workflow paths, docs links in `docs/en/attractap/*.md`, README references.
- Verify `pnpm nx run attractap-firmware:build` still works (or rename project to `attractap/firmware`).
- Acceptance: PR shows green CI, no broken doc links, firmware still builds via existing PlatformIO env list.

**P1-Bootstrap:**
- Create the directory layout above.
- Pick the tscircuit version pin (latest stable as of ticket pick-up time; document in `apps/attractap/hardware/README.md`).
- Configure nx targets per board (`build`, `export`, `render`, `lint`).
- Wire `.github/workflows/hardware.yml` with `nx affected` + artifact upload + PR comment.
- Add `.gitignore` entries for `dist/`, `node_modules/`, JLC export caches.
- Smoke-test by creating a one-LED placeholder board and confirming gerbers + PNGs come out the other end. No fab order yet.
- Acceptance: PR demonstrates a placeholder board producing gerber ZIP + PNG previews via CI on a throw-away PR.

**P1-SharedLib:**
- `libs/attractap-hw-shared/src/connectors/` — TypeScript constants for J_POE, J_PWR_DC, J_NFC, J_BEEP, J_DISP per the table in §2.3.
- `libs/attractap-hw-shared/src/parts/` — typed React wrappers around the most-used JLC parts (0402/0603 resistor and capacitor families, common LDOs, 100Mbit Ethernet PHY shortlist, USB-C connector, PN532 module footprint, ESP32-P4 + ESP32-C6 footprints, common B2B connectors).
- `libs/attractap-hw-shared/mech-envelope.md` — board outline + mounting hole pattern per board, stack-up height budget.
- Vitest unit tests for connector pinout schema validation (no duplicate pin numbers, every signal listed has a direction).
- Acceptance: every connector spec from §2.3 is in code; mech doc covers all 6 boards; unit tests green.

### 4.3 Phase 1.5 — Pipeline Proof (Beeper)

Smallest, lowest-risk board. Picked deliberately as the first board through the whole pipeline so that toolchain breakage shows up before five other boards are in flight.

- Schematic: N-channel MOSFET driving a piezo, 100Ω current limit, optional H-bridge variant noted but not built.
- Layout: ~25×25mm, single-sided SMT, 4 mounting holes, J_BEEP connector matching shared lib.
- DRC/ERC clean on JLC 2-layer ruleset.
- Place a real JLCPCB SMT order (1–5 units).
- Assemble (or receive assembled), apply 5V on bench supply, drive PWM from a dev board, confirm audible output.
- Capture lessons-learned (tscircuit pain points, JLC BOM gotchas) as a comment on the new parent issue. This learning feeds the Phase 2 tickets.
- Acceptance: physical board in hand, beep produced, parts-list cost recorded, blockers documented.

### 4.4 Phase 2 — Boards (rough acceptance only)

Each board ticket has the same skeleton:
- **Interface contract:** connector(s) used, signals consumed/provided, board outline, stack-up constraints from `mech-envelope.md`.
- **Acceptance gates:**
  1. `nx run <board>:lint` — ERC + DRC pass on JLC ruleset.
  2. `nx run <board>:export` — gerber + JLC BOM + CPL emitted, no missing footprints, no unsourced parts.
  3. `nx run <board>:render` — PCB top/bottom + schematic PNGs committed/attached to PR.
  4. Peer review on PR (schematic walkthrough + layout walkthrough).
  5. Physical: smoke test — 24h continuous power, voltage rails within ±5%, no thermal runaway, intended I/O toggles cleanly.
  6. Functional: per-board test from §5.1.
- **Subtask checklist** (added when ticket is picked up, drafted in the ATT-343 deep-research sub-issue spawned at that time):
  - schematic
  - layout
  - DRC iteration
  - BOM review (LCSC stock + price sanity check)
  - render artifacts to PR
  - peer review
  - fab order placed
  - assembled board received
  - smoke + functional test signed off

Open per-board design questions intentionally NOT answered in this spec — they live in the deep-research sub-issue spawned per board when work begins. See §6.

### 4.5 Phase 3 — Integration & Hand-off

**P3-FullStack:**
- Order 1 of each board.
- Assemble stack: Core + PoE (or DC-in) + NFC + Beeper + Touchscreen.
- Power-on with PoE injector → verify diode-OR holds rail steady.
- Bring up ESP32-P4 with placeholder ESP-IDF "hello" firmware.
- Confirm: Ethernet link comes up via PHY on PoE module, NFC reads a known MIFARE card via I2C, beeper beeps, LED ring lights, panel shows a test pattern via MIPI-DSI, touch reports coordinates via GT911.
- Acceptance: video recording + photos of full stack working.

**P3-FirmwareStub:**
- ESP-IDF skeleton project under `apps/attractap/firmware-v2/` (alongside the existing Arduino firmware, not replacing it).
- Builds for ESP32-P4 target.
- Drives ESP32-C6 via `esp_hosted` SDIO link for WiFi.
- Includes minimum MIPI-DSI driver init for chosen panel.
- Acceptance: serial log shows "Attractap V2 firmware boot OK" with C6 link up.
- This ticket likely spawns its own Linear epic for the actual firmware port.

## 5. Validation Strategy

### 5.1 Per-board acceptance gates

Repeated from §4.4 acceptance gates. CI enforces the design-side gates (lint, export, render). Manual sign-off on physical gates (smoke, functional).

Per-board functional smoke checklist:
- **Core:** +5V and +3V3 rails within ±5% under 1A load, P4 enters bootloader over USB, C6 reachable via SDIO probe.
- **NFC:** Reads a known MIFARE Classic / NTAG card via I2C from a dev MCU; LED ring lights all 24 pixels through a colour sweep.
- **PoE:** Negotiates Class 0 (or 1/2 if rating drops), delivers +5V at ≥1A continuous, RMII bus toggles via PHY register read from a dev MCU.
- **DC-in:** Accepts 5V, 12V, 24V, 32V input, delivers +5V at ≥1A continuous, reverse-polarity protected on screw terminal (no smoke when miswired).
- **Touchscreen:** Panel shows a test pattern under MIPI-DSI driver init; GT911 reports touch coordinates over I2C.
- **Beeper:** Audible beep at PWM 2–5kHz.

### 5.2 Top risks & mitigations

- **R1 — tscircuit maturity.** tscircuit is young; fab-quality DRC and MIPI-DSI controlled-impedance routing may not be production-ready. Mitigation: Phase 1.5 pipeline proof on the simplest board catches this. Fallback: export tscircuit netlist → KiCad for final routing on the high-speed boards (Core, PoE, Touchscreen) only.
- **R2 — ESP32-P4 availability.** Released late 2024; LCSC stock + lead times are tight. Mitigation: dual-source via LCSC + direct Espressif distributor (Mouser, Digikey, LCSC). Accept lead-time risk. **No S3 fallback — P4 is fixed.**
- **R3 — MIPI-DSI panel sourcing.** 4" square MIPI-DSI panel with bonded GT911 has MOQ risk from low-volume suppliers. Mitigation: pick 2–3 candidate panels during touchscreen carrier deep-research; **fallback = off-the-shelf Adafruit panel module that carries essentially the same panel/touch as the Waveshare 4" square module** — the carrier PCB exposes the matching FFC connector either way.
- **R4 — Connector spec churn.** A bad pinout = up to 5 board re-spins. Mitigation: Phase 1 freeze + semver bump rule; named B2B mating-key prevents physical miswire.
- **R5 — RF / EMI on NFC with adjacent WS2812 switching.** PWM noise from the LED ring can couple into the PN532 13.56MHz front-end. Mitigation: series resistor on LED data line, ground-plane cut between antenna and LED ring, LED supply behind an LC filter, antenna keep-out documented in `mech-envelope.md`.

### 5.3 Open per-board questions

Punted into the per-board deep-research sub-issues (spawned lazily under ATT-343 when each board picks up):

- **Core:** PSRAM size, flash size, exact P4 pin map, oscillator strategy, USB-C OTG + JTAG header, button/LED for boot mode.
- **NFC:** Antenna geometry (matched to enclosure window), Q-factor tuning, RF shielding.
- **PoE:** PD controller exact PN (Si3402-B vs MP8007 vs Ag5300), magnetics PN, transient suppression rating.
- **DC-in:** Buck topology (sync vs async), screw terminal type, reverse-polarity protection, TVS rating.
- **Touchscreen:** Panel candidate list, backlight LED string voltage, BL driver IC, level-shifter need on touch I2C, MIPI-DSI lane count (1 or 2).
- **Beeper:** Piezo PN, drive topology (direct PWM vs H-bridge for louder output).

## 6. Definition of Done for ATT-343

- This design doc committed to `docs/superpowers/specs/2026-05-20-attractap-pcb-tscircuit-design.md`.
- Linear: new parent issue "Attractap V2 Hardware Implementation" created in the Attraccess workspace, with the 12 child issues listed in §4.1 attached and `blockedBy` relationships set per phase.
- Linear: ATT-343 has one child issue for the firmware folder move; per-board deep-research sub-issues are NOT created upfront — they spawn lazily when each board picks up.
- ATT-343 itself moves to Done once the parent + children are in place.
