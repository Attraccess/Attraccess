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
gate **6** depends on the case-CAD enclosure-window aperture (drives the
chosen ANT1 PN) and matching-network tuning, deferred to the deep-research
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

### 4.5 PCB-trace coil antenna (v0)

v0 uses a **PCB-trace 13.56 MHz NFC antenna** etched directly into the
top-layer copper — no discrete part, no hand-soldering, no JLC custom-part
pre-order. JLC ships the board with the antenna already on it.

Trade-off vs the discrete pre-wound coil that an earlier revision of
this doc proposed: PCB-trace Q is lower (~30–50 vs ~60+ for wirewound),
so read range is shorter, but the design is fully fabricated by JLC at
no extra cost. Reference range target: ~5 cm for MIFARE / NTAG cards
against the PN532's full TX power.

Geometry (parametric in `libs/attractap-hw-shared/src/parts/nfc.tsx::NfcPcbAntenna`):

| Field         | Value (v0)            |
|---------------|-----------------------|
| Shape         | Circular spiral (polar polyline, 32 segments / turn rotated-rect SMT pads on top layer) |
| Outer Ø       | 22 mm — fits comfortably inside LED-ring inner edge (R ≈ 16.25 mm → Ø 32.5 mm free zone) |
| Turns         | 9                     |
| Trace width   | 0.4 mm (~15.7 mil — well above JLC 5/5 mil baseline) |
| Gap           | 0.3 mm (~11.8 mil) — radial pitch 0.7 mm / turn |
| Inner Ø       | 22 − 2 × 9 × 0.7 = 9.4 mm |
| Estimated L   | ~1.5 µH (Wheeler approximation for circular spiral, d_avg ≈ 15.7 mm, fill ratio ρ ≈ 0.40) |
| Estimated Q   | ~45 @ 13.56 MHz on 1 oz Cu — circular shape avoids the corner current-crowding losses a square-spiral takes (~10 % Q gain) |
| Resonance net | L_ant ≈ 1.5 µH with C2 = 100 pF → f₀ ≈ 13.0 MHz (within tuning trim range) |

Matching-network retune from the discrete-coil ~2.85 µH target:

- `C2_TX1`, `C2_TX2`: **47 pF → 100 pF** (JLC C1546, 0402 C0G, **basic + preferred** — no fee). Brings the resonance from ~19.6 MHz (with 47 pF and 1.4 µH) down to ~13.45 MHz at the antenna node.
- `C1_TX1`, `C1_TX2`: stay at 47 pF (series tuning, sets impedance match).
- `L0_TX1`, `L0_TX2`, `C0_TX1`, `C0_TX2`: unchanged (EMC pre-filter).
- `Rs1`/`Rs2`/`Cs1`/`Cs2`: unchanged (RX divider).

Expected first-board behaviour and tuning loop:

1. Initial read range likely **2–4 cm** because L_ant comes out of the
   etch tolerance ±15 % and C2 100 pF is a single-step E12 jump, not a
   measured trim.
2. Bench step (gate 5): NanoVNA on TP_ANT (the two antenna pad anchors)
   → measure actual L_ant and series-resonant frequency.
3. Swap C1 (47 pF → 33 pF or 56 pF) and / or C2 (100 pF → 82 pF or 120 pF)
   to centre the antenna network on 13.56 MHz with the case-loaded
   dielectric.
4. v1 board rev (if needed) bakes the trimmed values.

`NfcPcbAntenna` in the shared lib emits a chip with two named pads
(P1 = outer anchor at angle 0°, P2 = inner-end anchor) and a footprint
built from ~1.9k overlapping 0.4 mm circular SMT pads tiled along the
spiral centerline at `stepMm = 0.25` mm. Centerline follows the polar
Archimedean spiral `r(θ) = R_outer − (θ / 2π) · pitch` over 9 turns;
adjacent circle pads overlap by `traceWidthMm − stepMm = 0.15` mm so
the copper fuses into one continuous net at fab. Circular pads are
rotation-invariant in gerber export, sidestepping the `rotated_rect`
→ axis-aligned-flash bug in `circuit-json-to-gerber@0.0.50` that
broke the earlier chord-pad implementation. The matching-network
`<trace>` declarations connect to `pin1` (outer perimeter) and `pin2`
(inner end); the autorouter routes these from the bottom-layer matching
caps through vias up to the antenna anchors.

Because the antenna is etched copper (not a placed component), JLC SMT
populates everything else and ships the board with the antenna already
on it — no `Pre-order Service`, no hand-soldering. The BOM/CPL still
runs through `apps/attractap/hardware/scripts/strip-dnp.mjs` which
removes any `ANT`-prefixed rows from the gerber-zip CSVs before fab
upload (defensive in case a future design adds a hand-populated antenna
variant alongside this one). For the current board the strip is a
no-op because `NfcPcbAntenna` doesn't emit an ANT row into the
JLC-bound BOM at all (it lives in PCB copper, not the BOM).

The antenna sits **top-side, centred at (25, 25)**, with the 24 WS2812
LEDs in a ring around it on the same layer. The PN532 IC, matching
network, decoupling caps, and I2C pull-ups all live on the **bottom
layer**, directly under the antenna and ring; bottom mech-envelope
height budget (1.0 mm) accommodates the QFN-40 (0.85 mm) plus 0402 /
0603 passives.

The legacy `NfcCoilAntenna` wrapper stays in the shared lib (for future
designs that need a discrete vendor coil — e.g. once ATT-376 picks
between Abracon ANFCA-2522-D00-T / Würth WE-MCA / Pulse PA0742 for a
closer-range higher-Q variant) but is no longer used by this board.

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

| Ref            | Qty | Part                                  | JLC PN     | Footprint     |
|----------------|-----|---------------------------------------|------------|---------------|
| U1             | 1   | PN5321A3HN                            | C28925     | QFN-40-EP     |
| ANT1           | 1   | PCB-trace 13.56 MHz circular spiral, Ø 22 mm, 9 turns, 0.4 / 0.3 mm trace / gap | (etched copper, no part placed) | top-layer copper |
| LED1…LED24     | 24  | WS2812B-MINI-X2                       | C4154873   | SMD3535-4P    |
| J1             | 1   | B2B 1.27 mm 2×5 male SMD              | C2935458   | pinrow10_p1.27 |
| R_SDA, R_SCL   | 2   | 4.7 kΩ 0402 1%                        | C25900     | 0402          |
| R_IRQ          | 1   | 10 kΩ 0402 1%                         | C25744     | 0402          |
| R_LED          | 1   | 33 Ω 0402 1%                          | C25105     | 0402          |
| Rq1, Rq2       | 2   | 4.7 Ω 0603 1%                         | C23164     | 0603          |
| Rs1, Rs2       | 2   | 750 Ω 0402 1%                         | C25132     | 0402          |
| L_TVDD, L_LED  | 2   | 120 Ω @ 100 MHz ferrite bead 2 A      | C14709     | 0603          |
| L0_TX1, L0_TX2 | 2   | 560 nH ±5%                            | C502009    | 0603          |
| C0_TX1, C0_TX2 | 2   | 180 pF 50 V C0G                       | C20069329  | 0402          |
| C1_TX1, C1_TX2 | 2   | 47 pF 50 V C0G                        | C1567      | 0402          |
| C2_TX1, C2_TX2 | 2   | 100 pF 50 V C0G                       | C1546      | 0402          |
| Cs1, Cs2       | 2   | 1 nF 50 V C0G                         | C76947     | 0402          |
| C_PA, C_LED_BULK, C_LED_G1…6 | 8 | 10 µF 25 V X5R                  | C96446     | 0603          |
| C_VBUS, C_PVDD, C_SVDD, C_AVDD, C_VMID, C_TVDD | 6 | 100 nF 50 V X7R     | C307331    | 0402          |

**~60 part placements**. PN532 + matching network + decoupling + J1
header on bottom layer (under antenna, ribbon plugs in from inside the
enclosure leaving the user-facing top face clean); WS2812 ring + bulk
decoupling + LED filter on top layer. JLC SMT assembly populates every
designator; ANT1 is etched copper and needs no placement.

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

## 11. JLC assembly tier — Standard PCBA required

This board requires JLCPCB's **Standard PCBA** tier, not Economic PCBA.
Two independent constraints force Standard tier; either one is sufficient
on its own:

1. **Double-sided assembly** — PN532, matching network, decoupling, and
   I2C pulls are on the bottom side; antenna + WS2812 ring + connector
   are on the top side. JLC Economic PCBA only places parts on one side,
   so as long as the board uses both layers for SMT, Standard is the only
   option.
2. **Library type — Extended parts on the BOM**. Economic PCBA accepts
   Basic and Preferred parts only; any Extended part on the BOM bumps the
   order to Standard. This board's BOM has the seven Extended PNs listed
   in the table below. Each carries a one-time $3 component-setup fee
   (*not* a per-board fee). The notes column records why no Basic /
   Preferred equivalent exists at JLC for the required value or footprint:

| JLC PN     | Designator(s)         | Part                          | Why no Basic alt           |
|------------|-----------------------|-------------------------------|----------------------------|
| C28925     | U1                    | PN5321A3HN (PN532) QFN-40-EP  | Sole NFC reader IC at JLC  |
| C4154873   | LED1…LED24            | WS2812B-MINI-X2 SMD3535       | WS2812 family is Extended-only at JLC across all sizes |
| C2935458   | J1                    | 2×5 1.27 mm SMT pin header    | All 1454 in-stock 1.27 mm headers at JLC are Extended |
| C502009    | L0_TX1, L0_TX2        | 560 nH high-Q RF inductor     | No 0603 RF inductor at this value is Basic/Preferred  |
| C20069329  | C0_TX1, C0_TX2        | 180 pF 0402 C0G               | No 0402 180 pF cap is Basic/Preferred  |
| C76947     | Cs1, Cs2              | 1 nF 0402 C0G NP0             | Basic 1 nF 0402 is X7R-only — the RF receive shunt path wants C0G temperature stability |
| C25132     | Rs1, Rs2              | 750 Ω 0402 1%                 | No 750 Ω 0402 is Basic/Preferred — E96 values outside the JLC Basic library at 0402 |

> **Independence check:** the PN532 QFN-40-EP (0.5 mm pitch) is, by
> itself, within JLC Economic PCBA's package limits — Economic accepts
> QFN-40 on the top side at 0.5 mm pitch. So the PN532 is not an
> independent third forcing factor; it is forced to Standard only via
> constraint (1) (it sits on the bottom layer). Moving the PN532 to the
> top side would not unlock Economic on its own — constraint (2) still
> applies — but it is worth noting that the QFN-40 itself is not the
> blocker.

Search methodology (for future PRs that touch this BOM): use
`pcbparts:jlc_search` with `library_type="no_fee"` (basic + preferred,
no setup fee) and the part's package + value as `spec_filters`. Each
Extended row above was checked individually and returned 0 no-fee
matches in the current JLC catalogue.

**Net cost impact**: 7 Extended part-types × $3 setup fee = **$21 one-time
component-setup fee per JLC order**, on top of the Standard PCBA base
assembly fee. Per-piece cost is unaffected. ANT1 is excluded from JLC
SMT and hand-soldered post-shipment (see §4.5).
