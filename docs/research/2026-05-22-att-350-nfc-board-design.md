# ATT-350 — NFC board design (PN532 + WS2812 ring)

- Linear issue: [ATT-350](https://linear.app/attraccess/issue/ATT-350/p2-nfc-board-pn532-ws2812-ring)
- Parent epic: [ATT-345](https://linear.app/attraccess/issue/ATT-345)
- Blocked-by: [ATT-348](https://linear.app/attraccess/issue/ATT-348) (Beeper pipeline proof) — done
- Date: 2026-05-22
- Status: v0 design, pending PR review

## 1. Goal

Phase-2 NFC reader board for the Attractap V2 stack. Carries:

- NXP PN5321A3HN (PN532) RFID front-end, QFN-40-EP, JLC C28925
- 24× WS2812B-MINI RGB LEDs (SMD3535) arranged as a ring around the
  on-board 13.56 MHz antenna
- I2C pull-ups, antenna matching network, EMI mitigations
- `J_NFC` (B2B 1.27 mm 2×5) edge connector to the Core

Acceptance gates (verbatim from ATT-350):

1. `nx run nfc:lint` clean on JLC ruleset.
2. `nx run nfc:export` clean.
3. `nx run nfc:render` PNGs.
4. Peer review.
5. Smoke: +5 V via `J_NFC`, ring lights all 24 pixels, I2C reachable,
   PN532 firmware version readable.
6. Functional: reads MIFARE Classic + NTAG via I2C.

v0 (this PR) drives gates **1–3**; gate **5** is a bench step post-fab;
gate **6** depends on antenna tuning and is deferred to the deep-research
sub-issue under ATT-343 (see §6).

## 2. Mechanical envelope

From `libs/attractap-hw-shared/mech-envelope.md` NFC row:

| Item                       | Value                                            |
|----------------------------|--------------------------------------------------|
| Outline                    | 50.0 × 50.0 mm                                   |
| Max top-side height        | 6.0 mm                                           |
| Max bottom-side height     | 1.0 mm                                           |
| Mounting holes (M3 clear.) | (3,3), (47,3), (3,47), (47,47), Ø3.2 mm, 6 mm Cu keep-out |
| Antenna Cu keep-out radius | ≥ 5 mm from antenna footprint (locked here at **6 mm**) |

Board origin = bottom-left corner. tscircuit centres are computed via
`boardCoord` from the shared lib.

## 3. Block diagram

```
J_NFC (B2B 1.27mm 2x5) ──+──── +3V3 ───┬── PN532 SVDD / VDD_PA / PVDD / VBUS
                         │              ├── I2C pull-ups (4.7k to +3V3)
                         │              └── PN532 decoupling (10uF + 100nF per rail)
                         ├──── +5V ────► LC filter (10uH + 10uF) ──► WS2812 ring
                         ├──── GND ────► return
                         ├──── SDA  ◄──► PN532 SDA  (pull-up to +3V3)
                         ├──── SCL  ◄──┘ PN532 SCL  (pull-up to +3V3)
                         ├──── IRQ  ◄──── PN532 IRQ
                         ├──── RST  ────► PN532 NRST
                         └──── LED_DATA ─► [33Ω] ► WS2812 #1 DIN → … → #24 DOUT (NC)

                  PN532 TX1/TX2 ─────► matching network ─────► antenna loop on PCB
                                       (EMC L0/C0, tuning C1/C2, Rq, Rs/Rd, Cs/Cd)
```

## 4. PN532 minimum schematic (bare IC path)

The shared lib's `Pn532Module` wrapper from ATT-347 assumed a hand-soldered
PN532-v3 daughterboard. That footprint (~43 × 41 mm) doesn't leave room
for a 24-LED ring on a 50 × 50 mm board, and JLC SMT can't populate it.
This PR replaces the wrapper with a bare-IC wrapper (`Pn532Ic`) matched to
the QFN-40-EP-(6×6) package that JLC stocks under C28925.

### 4.1 Mode strapping

I2C is selected with `I0 = 1`, `I1 = 0` (datasheet §6.1.1). Both tied at
the chip with hard rails — no test jumper needed.

### 4.2 Power pins

| Net    | PN532 pins        | Decoupling near pin                |
|--------|-------------------|------------------------------------|
| +3V3   | VBUS, PVDD, SVDD  | 100 nF 0402 each                   |
| +3V3   | VDD_PA            | 100 nF 0402 + 10 µF 0603 bulk      |
| +3V3   | TVDD              | 100 nF 0402 (RF supply, sensitive) |
| GND    | GND, AVSS, AGND×2 | single GND fill, AVSS/AGND star to PGND under EP |

Datasheet AN1445 §4.1 explicitly calls out tying TVDD to the same +3V3
rail through a small inductor; we use a 47 µH ferrite bead between +3V3
and TVDD to keep PA switching noise off the digital rail.

### 4.3 I2C bus

- SDA / SCL: 4.7 kΩ 0402 pull-ups to +3V3 (matches `J_NFC` SDA/SCL).
- IRQ: open-drain from PN532 → pulled up to +3V3 with 10 kΩ on the NFC
  board (so the Core sees a defined level even when the PN532 is held in
  reset).
- NRST: driven by `J_NFC.RSTPDN`. No on-board pull (Core owns it).

### 4.4 Antenna matching network — initial values (NXP AN1445 §5)

Reference values, intended to be tuned during bring-up. Symmetric
network on TX1/TX2 sides.

| Designator | Value      | Function                                  | Footprint |
|------------|------------|-------------------------------------------|-----------|
| L0a, L0b   | 560 nH ±5% | EMC filter inductors                      | 0603      |
| C0a, C0b   | 180 pF NP0 | EMC filter caps                           | 0402      |
| C1a, C1b   | 47 pF NP0  | Series tuning (resonance trim)            | 0402      |
| C2a, C2b   | 47 pF NP0  | Parallel tuning (impedance match)         | 0402      |
| Rqa, Rqb   | 4.7 Ω      | Q-damping resistors (lower Q = wider BW)  | 0603      |
| Rsa, Rsb   | 750 Ω      | Receive filter series                     | 0402      |
| Csa, Csb   | 1 nF       | Receive filter shunt                      | 0402      |

Antenna pin connections: PN532 `TX1 → L0a → C1a → antenna_left`; same on
TX2 side. Receive path: antenna node → `Csa/Rsa` → PN532 `RX/LA/LB`. The
exact parametrics depend on enclosure dielectric — these are the
defaults the deep-research sub-issue (§6) will refine.

### 4.5 PCB antenna loop

v0 footprint: **rectangular 4-turn loop, 28 × 28 mm outline**, 0.5 mm
trace, 0.5 mm gap, on the **top copper layer only**. Loop sits centred
at the board centre (25, 25). No copper, no via, no trace inside the
loop on either layer (NXP AN1445 §3 "antenna interior keep-out" rule).
Bottom-layer is left bare in the antenna area; hatched GND alternative
is documented in `mech-envelope.md` and tuned during bring-up.

tscircuit cannot draw spiral antenna geometry directly. v0 leaves the
loop as a **fabrication note + silkscreen rectangle outline** in the
exported gerbers; the actual copper antenna is added by the deep-research
sub-issue's KiCad pass before fab. This is acknowledged in the schematic
fab-note text.

## 5. WS2812 ring

24× `WS2812B-MINI-X2` (C4154873, SMD3535-4P, 3.5 × 3.5 mm). 5 V supply,
~16 mA per channel, ~50 mA per LED worst case white = **1.2 A worst-case
ring current**. The `+5V` rail at `J_NFC.pin8` must deliver this.

### 5.1 Geometry

Ring radius `R = 18 mm` from board centre. 24 LEDs at 15° spacing.
Pixel `i` placement (i = 0…23):

```
angle_i = i × 15°   (i = 0 at +x axis, counter-clockwise)
cx_i = 25 + 18 × cos(angle_i)
cy_i = 25 + 18 × sin(angle_i)
rot_i = angle_i  (LEDs face radially outward — DIN pin towards previous)
```

Inner edge of LED ring sits at R ≈ 16.25 mm (LED half-width 1.75 mm).
Outer edge at R ≈ 19.75 mm. The 28 × 28 mm antenna footprint (half-side
14 mm) fits inside the ring with a 2 mm copper-free margin. Mounting
holes at corners (distance ≈ 31 mm from centre) sit clear of both ring
and antenna keep-out.

### 5.2 EMI mitigations (per spec §5.2 R5)

- **GP cut between antenna loop and LED ring**: hatched GND keep-out
  ring at R = 14–17 mm so the antenna's near-field doesn't see a
  continuous switching reference plane underneath.
- **LED_DATA series 33 Ω 0402** at the first WS2812 to slow edges.
- **LC filter on +5 V LED branch**: 10 µH 0603 ferrite bead + 10 µF
  0603 bulk on the WS2812 side of the bead. The +3V3 PN532 rail enters
  the board on a separate pin and shares no copper with the LED rail
  inside the antenna keep-out.
- **Decoupling per LED**: 100 nF 0402 across each WS2812 VDD/GND.
- **GND return for the ring routes outside the antenna keep-out** — the
  return current loop is steered around the antenna, not under it.

## 6. Open questions (deferred to ATT-343 deep-research sub-issue)

These exist in the issue text and the design spec §5.3 NFC entries:

1. **Antenna geometry locked to enclosure window cutout** — needs the
   case CAD ticket to land first.
2. **Q-factor tuning component values** — depends on (1) plus measured
   resonance peak.
3. **RF shielding strategy** — whether the WS2812 ring needs a discrete
   shield layer (e.g. dedicated GND mesh on bottom layer) beyond what's
   in §5.2.

The deep-research sub-issue under ATT-343 will pin these down before the
next NFC board revision. v0 ships with NXP AN1445 reference values and
the rectangular 28 × 28 mm loop as the working starting point.

## 7. Layer choice

JLC 2-layer (default). The matching network components fit on top side;
GND fill on bottom layer (with the antenna keep-out cut out); `LED_DATA`
daisy-chain routes on top between LEDs. Differential pair / controlled
impedance is **not required** for a 13.56 MHz antenna trace at this
scale — the matching network compensates for the parasitic.

A 4-layer bump is allowed by the ticket if antenna tuning forces it
(R5 in design spec §5.2). v0 stays on 2-layer; the deep-research
sub-issue may upgrade.

## 8. BOM (v0)

| Ref           | Qty | Part                       | JLC PN     | Footprint   |
|---------------|-----|----------------------------|------------|-------------|
| U1            | 1   | PN5321A3HN                 | C28925     | QFN-40-EP   |
| D1…D24        | 24  | WS2812B-MINI-X2            | C4154873   | SMD3535-4P  |
| J1            | 1   | B2B 1.27 mm 2×5 male       | (existing) | pinrow10_p1.27 |
| R_SDA, R_SCL  | 2   | 4.7 kΩ 0402                | C25092     | 0402        |
| R_IRQ         | 1   | 10 kΩ 0402                 | C25744     | 0402        |
| R_LED         | 1   | 33 Ω 0402                  | C25092 (TBD) | 0402      |
| Rq1, Rq2      | 2   | 4.7 Ω 0603                 | TBD        | 0603        |
| Rs1, Rs2      | 2   | 750 Ω 0402                 | TBD        | 0402        |
| L_TVDD        | 1   | 47 µH ferrite bead         | TBD        | 0603        |
| L_LED         | 1   | 10 µH ferrite bead         | TBD        | 0603        |
| L0_TX1, L0_TX2| 2   | 560 nH ±5%                 | TBD        | 0603        |
| C0_TX1, C0_TX2| 2   | 180 pF NP0                 | TBD        | 0402        |
| C1_TX1, C1_TX2| 2   | 47 pF NP0                  | TBD        | 0402        |
| C2_TX1, C2_TX2| 2   | 47 pF NP0                  | TBD        | 0402        |
| Cs1, Cs2      | 2   | 1 nF                       | TBD        | 0402        |
| C_PN_BULK     | 1   | 10 µF 0603                 | C19702     | 0603        |
| C_PN_DEC×4    | 4   | 100 nF 0402                | C1525      | 0402        |
| C_LED_BULK    | 1   | 10 µF 0603                 | C19702     | 0603        |
| C_LED_DEC×24  | 24  | 100 nF 0402                | C1525      | 0402        |

**~75 part placements total**. JLC SMT-assembled in one pass. Any `TBD`
PN is resolved during the implementation PR using `pcbparts:jlc_search`
and committed to `lcsc-classes.json`.

## 9. Acceptance + deferral

- Gates 1–3 close in this PR.
- Gate 4 (peer review) on the PR.
- Gate 5 (bench smoke) — board ordered + assembled, run from a dev MCU.
- Gate 6 (MIFARE/NTAG read) — needs antenna copper drawn, which is the
  deferred deep-research sub-issue. Gate 6 closes in a follow-up PR
  that revs the board.

## 10. Out of scope (verbatim from ticket)

- Antenna geometry for the final case (case CAD is its own epic).
- Multi-protocol RF (ISO-14443A only via PN532).
