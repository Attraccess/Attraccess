# ATT-349 Core board — Power budget

Numbers are **worst-case continuous** unless stated otherwise. Annotation
`(measured)` lands on each row after the first prototype is bench-tested
(see ATT-356 P3 Full-stack bring-up smoke test).

## 1. +5V rail (input rail, supplied by PoE or DC-in)

| Consumer                              | Typ (mA) | Peak (mA) | Source |
|---------------------------------------|---------:|----------:|--------|
| TPS62933 buck input @ 5 V → 3.3 V/1.5 A | 1000     | 1600      | calc, η = 0.92 |
| `J_NFC` +5V (WS2812 ring 24 LEDs, white) |  900     | 1440      | 24 × 60 mA peak |
| `J_BEEP` +5V (buzzer)                 |   30     |    50     | SEA-1295Y |
| `J_DISP` +5V (backlight + panel)      |  300     |   600     | reserved, panel TBD |
| **+5V total**                         | **2230** | **3690**  | |

Headroom: PoE supplies up to 4 A at 5 V (post DC-DC); DC-in is sized 3 A.
Both inputs feed an LM66200 dual ideal-diode (74 mΩ Rds_on) — at 3 A the
diode burn is 0.67 W per channel (within the 5 W SOT-23-6 package limit
with copper-pour heatsinking).

## 2. +3V3 rail (TPS62933 buck output)

| Consumer                              | Typ (mA) | Peak (mA) | Source |
|---------------------------------------|---------:|----------:|--------|
| ESP32-P4 (compute @ 360 MHz, USB on)  |  220     |  500      | ESP32-P4 datasheet |
| ESP32-P4 MIPI-DSI active              |   90     |  120      | DPHY app note |
| ESP32-C6 Wi-Fi Tx peak                |   70     |  370      | ESP32-C6 datasheet (Tx 21 dBm) |
| W25Q128 flash (active QSPI)           |   15     |   30      | Winbond datasheet |
| `J_NFC` +3V3 (PN532 logic)            |   80     |  150      | PN532 datasheet |
| `J_DISP` +3V3 (panel logic + GT911 touch) |  40     |   80     | reserved |
| Pull-ups + housekeeping LEDs          |   10     |   15      | calc |
| **+3V3 total**                        | **525**  | **1265**  | |

TPS62933 is a **3 A** synchronous buck. Worst-case peak is **1265 mA** —
**46 % headroom**. The buck is sized at 1.5 A continuous / 3 A peak; this
gives margin for the C6 Tx transient plus any growth from future firmware
features.

## 3. Inrush + transient

- C6 Wi-Fi Tx is the dominant +3V3 transient (300 mA edge in < 1 µs). Bulk
  cap at the C6 module pin 3 is **22 µF X5R 6.3 V (0805)** with a 100 nF
  ceramic in parallel. ESR target < 30 mΩ.
- TPS62933 internal soft-start is **2 ms** — input inrush is bounded by
  this; no additional inrush limiter required.
- USB-C VBUS post-SS34 Schottky has a 10 nF Y-cap + 22 µF bulk on the +5 V
  rail; LM66200 handles the priority switch between USB-C / PoE / DC-in
  without a glitch on the +5 V rail (see datasheet figure 8.2).

## 4. Thermal

| Rail | Worst case | Heat (W) | Mitigation |
|------|-----------:|---------:|------------|
| LM66200 (per channel)        | 3 A | 0.67 | 2 cm² copper pour each side |
| TPS62933 buck (η = 92 %)     | 1.26 A out | 0.18 | 2 cm² copper pour on EP |
| ESP32-P4 internal DCDC + LDOs| 320 mA (1.1 V core) | 0.7 | QFN-104 thermal EP stitch (≥ 9 vias to L2 ground plane) |

All three sources together: **1.55 W** worst-case dissipation in the
power region. Maximum board temperature rise at 1 oz copper, FR-4 Tg 155,
calm air: **≈ 14 °C above ambient**. Fits well under the 85 °C limit
of the C6 module (most temperature-restricted part).

## 5. Verified at bring-up

> Replace these with measured numbers from the ATT-356 P3 bring-up.

| Quantity | Spec | Measured | Pass? |
|----------|------|----------|-------|
| +5 V at 1 A load     | ±5 %   | _TBD_ | _TBD_ |
| +3V3 at 1 A load     | ±5 %   | _TBD_ | _TBD_ |
| 24 h soak at 1 A combined | no thermal runaway | _TBD_ | _TBD_ |
| LM66200 priority switch glitch | ≤ 50 mV | _TBD_ | _TBD_ |
| C6 Tx transient on +3V3        | ≤ 100 mV | _TBD_ | _TBD_ |
