# ATT-349 Core board — PCB stack-up

## Layer choice — JLC04161H (4-layer, 1.6 mm)

The Core board is one of the three V2 boards that require 4 layers (the
others are PoE and Touchscreen). The trigger is **MIPI-DSI + RMII signal
integrity**: routing 90 Ω differential lanes inside the 50 × 35 mm outline
without ground references next to every pair is not possible on 2 layers,
and the same is true for RMII length-matching at 50 MHz.

JLC's pinned 4-layer stack-up is **JLC04161H**:

| Layer | Function | Copper | Dielectric |
|-------|----------|--------|------------|
| L1 (top)    | Signal + components       | 1 oz / 35 µm | — |
| L2 (inner1) | **Solid GND plane**       | 0.5 oz / 17 µm | 0.21 mm prepreg |
| L3 (inner2) | **Solid +3V3 plane + +5V island** | 0.5 oz / 17 µm | 1.04 mm core |
| L4 (bottom) | Signal + small parts only | 1 oz / 35 µm | 0.21 mm prepreg |

Total: 1.6 mm finished thickness (JLC default).

## Why this stack-up

- L2 is a continuous ground plane so every L1 signal has a tight return
  reference for MIPI-DSI / RMII / SDIO.
- L3 splits between a +3V3 pour over the MCU region and a +5V island over
  the power-input region; the +5V to +3V3 boundary sits directly under the
  TPS62933 buck so the buck-output current loop is short and contained.
- L1 carries every high-speed bus (MIPI-DSI, RMII, SDIO) and the USB-2.0 D±
  pair. L4 carries low-speed control + bias passives + DNI footprints.
- 1.6 mm board thickness is the JLC default — keeping it default avoids
  the impedance-recalculation cost of a thinner stack.

## Controlled impedance

| Net group           | Target  | Geometry (JLC04161H, 0.21 mm to L2) | Tolerance |
|---------------------|---------|--------------------------------------|-----------|
| MIPI-DSI diff       | 90 Ω    | width 0.18 mm, gap 0.15 mm           | ±10 %     |
| USB-2.0 D± diff     | 90 Ω    | width 0.18 mm, gap 0.15 mm           | ±10 %     |
| RMII single-ended   | 50 Ω    | width 0.18 mm                        | ±10 %     |
| SDIO single-ended   | 50 Ω    | width 0.18 mm                        | ±10 %     |
| QSPI flash          | 50 Ω    | width 0.18 mm                        | ±10 %     |

The exact widths above are placeholder values — confirm via JLC's
impedance calculator at fab-order time (§ DRC.md mentions `0.09/0.09 mm`
minimum). The order form lets you request an impedance test coupon for an
extra $20 — opt-in for the first prototype run.

## Fab order checklist

1. Upload gerber ZIP produced by `pnpm nx run attractap-hw-core:export`.
2. Layer count: 4. Stack-up: JLC04161H.
3. Material: FR-4 Tg 155.
4. Surface finish: ENIG (better USB-C plug life than HASL).
5. Solder mask: Black or Matte Black (matches V2 visual identity).
6. Silkscreen: White.
7. Impedance control: Yes (90 Ω diff + 50 Ω single-ended) — see table.
8. SMT assembly: Yes (full bottom-side parts list — see `bom.csv`).
9. Confirm minimum trace/space against `DRC.md`.
