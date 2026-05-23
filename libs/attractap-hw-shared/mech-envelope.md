# Attractap V2 Mechanical Envelope

This document is the per-board mechanical contract. Each Phase-2 board
ticket is bound to the outline, mounting-hole pattern, and stack-up
budget in its row; any change requires a hardware design review and a
semver bump on this library.

> All measurements are in millimetres. Mounting holes are M3 unless
> stated otherwise (M3 clearance ⌀3.2 mm by default).

## 1. Per-board outlines

| Board | Outline (L × W) | Max component height (top) | Max component height (bottom) | Notes |
|-------|-----------------|----------------------------|-------------------------------|-------|
| Core (MCU)   | 50.0 × 35.0 | 3.0 | 1.5 | Carries ESP32-P4-MINI-1 module (highest part) |
| NFC          | 50.0 × 50.0 | 6.0 | 1.0 | Antenna keep-out applies — see §4 |
| Beeper       | 15.0 × 15.0 | 9.0 | — (1L bottom-free) | Magnetic buzzer dominates height |
| PoE          | 60.0 × 35.0 | 8.0 | 1.5 | RJ45 magjack drives the height budget |
| DC-in        | 30.0 × 20.0 | 5.0 | 1.0 | JST PH 1.25 4P inlet |
| Touchscreen  | 80.0 × 50.0 | 1.5 | 1.5 | Display sits above on its own carrier; this is the controller-only board |

Outline tolerance: ±0.15 mm (JLC 2-layer default). Boards listed at the
top of the enclosure stack get their length-axis aligned with the case
long axis — see §3.

## 2. Per-board mounting hole pattern

All holes are M3 clearance (⌀3.2 mm) with a 6 mm copper-free annular
keep-out. Origin (0, 0) is the bottom-left corner of the board outline.

| Board       | Hole count | Hole positions (mm) |
|-------------|------------|---------------------|
| Core        | 4 | (3.0, 3.0), (47.0, 3.0), (3.0, 32.0), (47.0, 32.0) |
| NFC         | 4 | (3.0, 3.0), (47.0, 3.0), (3.0, 47.0), (47.0, 47.0) |
| Beeper      | 2 | (3.0, 3.0), (12.0, 12.0) |
| PoE         | 4 | (3.0, 3.0), (57.0, 3.0), (3.0, 32.0), (57.0, 32.0) |
| DC-in       | 2 | (3.0, 3.0), (27.0, 17.0) |
| Touchscreen | 4 | (3.0, 3.0), (77.0, 3.0), (3.0, 47.0), (77.0, 47.0) |

The Touchscreen board pattern mirrors the off-the-shelf MIPI-DSI panel
carrier; the four-corner M3 spacing is fixed by the panel vendor and
must not move.

## 3. Stack-up height budget

Working assumption: the V2 enclosure has **≤ 25.0 mm internal height**.
This number is a TBD pending case-CAD selection (Phase 3 ticket); update
it here once the case is locked. Until then, all sub-budgets in this
section assume 25.0 mm and any board that breaks the budget gets called
out in PR review.

```
Enclosure interior height (TBD ≤ 25 mm)
├── Top component layer:   board.max_top + connector_mated_height
├── Board thickness:       1.6 mm (JLC 2L default, 1.6 mm assumed for all boards)
└── Bottom component layer: board.max_bottom
```

| Component | Mated height (mm) |
|-----------|-------------------|
| B2B 1.27 mm 2×N (J_POE, J_NFC) | 4.0 (3.5–4.5 vendor range) |
| B2B 0.5 mm 2×10 (J_DISP)       | 1.5 (FFC alternate: 0.6 mm cable run-out) |
| JST PH 1.25 mm 3P / 4P         | 5.0 (PH-S vertical) |
| ESP32-P4-MINI-1 module         | 3.0 |
| ESP32-C6-MINI-1 module         | 3.0 |
| PN532 module (bare chip on flex) | 0.8 |
| GT911 (QFN)                     | 0.85 |
| WS2812 5050                     | 1.6 |
| RJ45 magjack (PoE board)        | 13.5 |
| Magnetic buzzer (Beeper)        | 9.0 |
| Display + carrier (above Touchscreen) | reserved — case-CAD ticket |

The **dominant** boards for the stack-up are the PoE board (RJ45) and
the Beeper (buzzer). If they share an internal compartment they must
not stack — assume side-by-side placement.

Per-board total budget (rough, until case CAD lands):

| Board       | Stack-up worst case (board + tallest top + mated B2B) |
|-------------|------------------------------------------------------|
| Core        | 1.6 + 3.0 (P4-MINI) + 4.0 (B2B mated) = **8.6 mm** |
| NFC         | 1.6 + 0.85 (PN532) + 4.0 (B2B) = **6.45 mm** |
| Beeper      | 1.6 + 9.0 (buzzer) + 5.0 (JST PH mated) = **15.6 mm** |
| PoE         | 1.6 + 13.5 (RJ45) + 4.0 (B2B) = **19.1 mm** |
| DC-in       | 1.6 + 5.0 (PH mated) = **6.6 mm** |
| Touchscreen | 1.6 + 1.5 (B2B) + display stack (reserved) |

Two-board stacks (Core + NFC via J_NFC):
`Core_total + B2B_gap + NFC_total ≈ 8.6 + 0 + 6.45 ≈ 15.05 mm` — fits.
Three-board stacks are not supported in V2; if a board needs more, it
gets cabled instead of B2B-stacked.

## 4. NFC antenna keep-out (J_NFC consumers)

The PN532-driven NFC ring is sensitive to nearby copper and to the WS2812
LED data switching. The keep-out rule applies to **the NFC board only**;
no other board sits inside this exclusion volume.

- **No copper** (no pours, no tracks, no GND fill) within **`X` mm** of
  the PN532 antenna footprint outline. `X` is **TBD — locked during the
  NFC board ticket** but the working number is `X ≥ 5 mm`.
- **No LED data trace routing** inside the same exclusion zone — the
  `LED_DATA` signal arrives at the WS2812 ring through a slot in the
  antenna keep-out, not by crossing the antenna loop.
- **No mounting hole** inside the antenna keep-out — the four M3 holes
  on the NFC board sit at corners by design.
- The **back side** of the NFC board within the keep-out must be left
  free of components and free of solid copper (hatched GND is OK at the
  pin-down NFC ticket's discretion).

If the case has a metal bezel within the NFC keep-out radius, the NFC
board ticket must add a parallel ticket to revisit antenna tuning.
