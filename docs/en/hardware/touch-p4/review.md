# Design standards and review criteria
<!-- llms-description: The standards, grading scale, per-item criteria, layout rules and review method the Touch P4 design is held to, with its current grades. -->

The standards the Touch P4 board is designed and reviewed against, for hardware developers.
Use this page to run the next review and to grade the next revision. Other pages cite its
items by number ("item 5.3"). Improve the criteria here when a review shows a gap.

## Ground rules

Project rules that apply to every change and every review:

- **The generator is the source of truth.** Every change goes through `scripts/bootstrap/`. The
  KiCad files are its output; `check-source` fails when they differ from it.
- **Parts on one side only.** All parts sit on the component side. A second assembly side costs
  too much; targets that would need it become deviations.
- **Deviations instead of forcing.** A target that cannot be met at a reasonable cost keeps its
  lower grade and gets an entry in [limitations](hardware/touch-p4/limitations.md): target,
  what is reached, why it stops there, the mitigation, and what a later revision could do. A
  documented deviation is not sent back again.
- **Meet what the board allows.** A rule from a maker's layout guide is met wherever the board
  allows it. Only the part that cannot be met becomes a deviation, with the reason.
- **Genuine parts only.** No unverified clones. A part counts as available only when JLCPCB or
  LCSC stock it, or a sourcing plan exists.
- **Primary sources for every claim.** Datasheets, the makers' land-pattern drawings, the
  standards' text, the EU's Official Journal, ETSI documents and the makers' certificates. The
  repository's own notes are leads, not evidence.
- **ERC and DRC at KiCad's default severities.** No rule is lowered or ignored in the project
  file. `--severity-all` counts warnings as findings.
- **Cost is counted per board at 100 pieces.** Changes with a cost carry an explicit cap
  (power path: about 5 USD per board; switching the Wi-Fi module: about 2 USD more per board,
  module and antenna stocked).

## Grading

| Grade | Value | Meaning |
|---|---|---|
| A | 4.0 | What a professional design review passes without remarks |
| A− | 3.7 | Passes, with small remarks that need no change before ordering |
| B+ / B / B− | 3.3 / 3.0 / 2.7 | Good, with gaps worth fixing |
| C+ / C / C− | 2.3 / 2.0 / 1.7 | Acceptable for a prototype, with real gaps |
| D+ / D | 1.3 / 1.0 | Needs rework |

An area's grade is the average of its items. The overall grade is the average of the areas,
weighted as shown in each area's heading below.

**Target:** every item at A− or better, or a documented deviation.

## Criteria per area

What each item must meet for A−. Item numbers are stable; do not renumber. Numbers missing
from a list (for example 1.1, 1.2) are items that were at A− or better from the first review
and have no written criterion yet. They must not get worse; the next review should write them
down.

### 1. Circuit correctness (15 %)

Scope: every IC's pins, values, supply scheme and straps against the maker's documents.

- **1.3** The ESP32-P4 schematic checklist (HDG) followed to the letter. For chip revision v3.x
  that includes the 499 kΩ / 499 kΩ / 22 pF core feedback network.

### 2. Power and protection (12 %)

- **2.1 DC input margin.** The live-plug-in simulation peaks at least 5 V below the converter's
  limit, also at 24 V + 10 %. The TVS stand-off is justified for that range. The surge the
  applicable standard asks for is clamped within the converter's rating.
- **2.2 Source OR-ing.** Ideal diodes or a power mux instead of Schottky diodes, with no
  back-feed into an unplugged source.
- **2.3 USB inrush.** At most 10 µF at VBUS when plugged in (USB 2.0 §7.2.4.1), or slew-limited
  start-up, shown by simulation.
- **2.4 Power budget.** Worst case per rail and per source, at least 30 % headroom on each
  regulator, and the +5V rail's ceiling against every 5 V load's limit.
- **2.6 Brown-out.** A supervisor on CHIP_PU, and switching between supplies while running,
  simulated.

### 3. Schematic readability (10 %)

- **3.2 Signal flow.** Wires inside each block, flowing left to right; supplies up, ground
  down; labels only between blocks and for buses.
- **3.3 Text.** An overlap lint that covers pin names and numbers, fields against symbol
  graphics, and free text against sheet symbols, pins and labels on every sheet (the root
  included), reporting zero. Every sheet readable when printed.
- **3.4 Symbols.** Every symbol named after the fitted part; TVS diodes drawn as TVS.
- **3.6 Title block.** Date, drawn by, checked by, and a revision history.
- **3.7 Values.** Capacitors with voltage and dielectric; resistors with tolerance where it
  matters.

### 4. Parts and BOM (8 %)

- **4.1 Part choices.** A lifecycle status, with its source, for every IC and module.
- **4.2 Availability.** A named, checked alternate for every part whose secondary figures
  matter (TVS, fuses, ferrites, inductors, crystals, diodes, ICs), and a sourcing plan for parts
  out of stock.
- **4.3 BOM.** Maker, part number, full description and alternate on every line, in both
  variants.
- **4.4 Footprints.** The critical land patterns checked against the makers' drawings, and
  recorded. Tolerance: within 0.05 mm is a match; a pad longer or shifted by up to about 0.2 mm
  with the terminal still covered is acceptable; a wrong pitch, pin order or hole position is a
  defect.
- **4.5 3D models.** Every footprint has one, and the case fit is checked with them.

### 5. Stack-up and layout (15 %)

- **5.2 Routing.** Critical nets cleaned up or routed by hand. USB as a coupled pair with equal
  via counts and at most 1 mm mismatch. Each bus meets its maker's layout rules (for the
  Wi-Fi module's SDIO bus: ESP32-C5 HDG 1.4.9, see [Layout rules](#layout-rules)).
- **5.3 Decoupling.** Copper path from pin to capacitor at most 3 mm on the priority rails
  (VDD_HP, VDD_PSRAM, VDD_FLASH, VDDO_4, VDD_USBPHY, VDD_BAT, VDD_LDO, VDD_DCDCC, VDD_ANA), at
  most 5 mm on the 3.3 V I/O pins; 10 µF close to VDD_LDO and VDD_DCDCC.
- **5.4 Switchers.** The hot loop of every converter measured and written down.
- **5.5 Crystal.** MCU crystal tracks at most 5 mm each.
- **5.6 Impedance.** USB 90 Ω and Ethernet 100 Ω differential, widths from the fab's own
  calculator, and impedance control in the order.

### 6. Fabrication (7 %)

- **6.1 DRC.** 0 errors and 0 warnings at KiCad's default severities.
- **6.2 Margins.** Nothing at the fab's limit unless the part forces it; each case written down
  against the fab's published limits.
- **6.4 Fab documents.** A fabrication drawing and an IPC-D-356 netlist in the package.

### 7. Assembly and silkscreen (8 %)

- **7.2 Fiducials.** A local pair at the 0.35 mm pitch MCU.
- **7.3 Rotations.** `check-footprints` passes for every part.
- **7.6 Designators.** Every part other than a small passive (U, Y, L, FB, D, Q, J, SW, F, RN,
  BZ) carries its designator on the silkscreen. A test enforces it.
- **7.7 Assembly drawing.** Designators only, readable, with detail sheets of the dense areas.

### 8. Test and bring-up (5 %)

- **8.1 Test points.** On every rail, both I²C buses and the RMII clock, each labelled with its
  net.

### 9. EMC, radio and safety (10 %)

- **9.1 ESD.** A per-port table of the targeted IEC 61000-4-2 level and the part that provides
  it.
- **9.3 Radio.** The antenna the module was certified with. A PCB antenna meets the maker's
  placement rules (for the ESP32-C5: HDG 1.4.7) or has a deviation; an external antenna is in
  the parts lists, with a place in the case and the cable route drawn.
- **9.4 PoE isolation.** Barrier capacitors rated for the IEEE 802.3 isolation test, and 3 mm
  from 48 V copper on every layer and through the board.
- **9.6 Compliance.** Every claim checked against a primary source and cited.

### 10. Verification (5 %)

- **10.3 Simulations.** The key results cross-checked with an independent reference.

### 11. Process and documentation (5 %)

- **11.2** A one-page spec ([spec](hardware/touch-p4/spec.md)).
- **11.3** One source of truth, with a check that fails when the KiCad files differ from the
  generator's output.
- **11.4** A revision history that matches the title block, and a release procedure.

## Layout rules

The rules the generator sets and the layout must meet. What the routed board reaches is in
[design notes](hardware/touch-p4/design-notes.md).

Net classes (`scripts/bootstrap/board_setup.py`, mm):

| Class | Track | Clearance | Nets |
|---|---|---|---|
| Default | 0.15 | 0.127 | Signals |
| Power | 0.25 | 0.127 | 3.3 V, core rail, small supply rails |
| Power5V | 0.5 | 0.15 | 5 V rails, the 5 V converter switch nodes, the Wi-Fi module's 3.3 V |
| DCIN | 0.6 | 0.25 | DC input up to the converter (up to 28 V) |
| DCSig | 0.25 | 0.2 | DC converter enable and bootstrap |
| VBUS | 0.6 | 0.127 | USB VBUS (the USB-C pads are 0.2 mm apart) |
| PoE | 0.6 | 0.3, and 3 mm to every other net (custom rule) | 48 V side |
| NFC_RF | 0.3 | 0.127 | Transmitter to antenna |
| USB | 0.14, gap 0.15 | 0.127 | USB data, coupled pair, 90 Ω |
| MDI | 0.155, gap 1.115 | 0.127 | Ethernet pairs, 50 Ω lines, 100 Ω pair |

Other rules:

- **Tracks.** Minimum 0.11 mm (the autorouter's neck-downs at fine-pitch pins; fab limit
  0.09 mm), widened to 0.127 mm after routing where possible. `post_route.py` widens supply
  tracks as far as the copper beside them allows: towards 0.6 mm (core rail), 0.5 mm (3.3 V),
  0.8 mm (5 V) and 0.4 mm (other supplies).
- **Vias.** At least 0.45 mm pad, 0.2 mm drill (the smallest without a surcharge); 0.5 mm pad
  where there is room. Part hole to via hole at least 0.45 mm (custom rule).
- **Board edge.** Copper at least 0.3 mm from the board edge and from milled cut-outs.
- **PoE.** 3 mm from 48 V copper to any other copper, on every layer and through the board. No
  copper on any layer in the PoE module's barrier band (Silvertel Ag9900, fig. 23).
- **Ground.** Every ground pad has a via into the ground plane, or a track to a pad that has
  one; ground does not depend on the outer fills. Planes In1, In3 and In4 carry no tracks.
- **Return paths.** A ground via beside every via of a fast signal (RMII, SDIO, USB, Ethernet
  pairs), where there is room. Stitching vias every 5 mm, every 2.5 mm along the top edge and
  around the Wi-Fi module.
- **Decoupling and crystal.** Items 5.3 and 5.5. For the crystal also ESP32-P4 HDG 1.4.2: at
  least 4.5 mm from the clock pins, no vias in the clock lines, load capacitors at the far end,
  no signal under the crystal.
- **SDIO to the Wi-Fi module** (ESP32-C5 HDG 1.4.9). Command and data within 1.27 mm (50 mil)
  of the clock's length, 50.8 mm (2000 mil) at most, 50 Ω ±10 %, no change of layer, an unbroken
  reference plane, ground copper round the clock.
- **Impedance.** USB 90 Ω ±15 % (USB 2.0), Ethernet 100 Ω ±15 % (100BASE-TX). The order asks
  for impedance control to ±10 %.
- **Switchers.** Input capacitor right at the VIN and GND pins, small switch node.
- **Soldering.** Thermal spokes (0.25 mm, 0.2 mm gap) on 0402 and 0603 two-pad parts against
  tombstoning. No via hole under solder paste, except filled and capped vias in pads. Paste on
  exposed pads as a grid of windows, not one opening.
- **Silkscreen.** Text 1.0 mm high, 0.15 mm lines. No text on a pad (0.15 mm), another text,
  or within 0.3 mm of the board edge; 0.35 mm between designators.

## Review method

1. **Review a commit, not a working tree.** Take a `git archive` of the commit under review and
   run every check on it in the `kicad10-np` Docker image (KiCad 10), so nothing uncommitted
   passes for the reviewed state.
2. **Run the checks.** ERC, DRC, netlist, source, package, simulations and footprints (see
   [Running the review](#running-the-review)).
3. **Read, do not only check.** Render every schematic sheet at 200 dpi and read it block by
   block. Plot and look at the silkscreen, the assembly drawing and the copper layers.
4. **Measure the layout.** `scripts/layout_report.py` measures the copper path from each MCU
   supply pin to its capacitor, crystal and fast-net lengths, vias and hot-loop areas.
   `scripts/fab_margins.py` compares the smallest features with JLCPCB's published limits.
5. **Check every claim against a primary source.** Check [compliance](hardware/touch-p4/compliance.md)
   claim by claim, then spot-check it independently against the same kind of sources.
6. **Grade each item** against the criteria above. Record items below A− and new deviations in
   [limitations](hardware/touch-p4/limitations.md).

A review on paper judges the design; the [bring-up plan](hardware/touch-p4/bring-up.md)
confirms it on hardware.

## Known pitfalls

Check these first in the next review:

- A lint that passes is not proof. Render the sheets and look; a lint only finds what it
  checks.
- Removing a diode also removes its voltage drop. Check what the rail then follows (here: up to
  the eFuse's cut-off, above some loads' limits).
- A TVS diode's clamping voltage at its rated current can exceed the protected part's rating.
  Find out which surge test applies, then check the clamp at the current that test drives.
- Check an IC's pin *functions*, not only its package drawing, before leaving pins open.
- Every capacitor on a converter's output counts towards its stability limit, including those
  at the loads and a module's own capacitors.
- A source that offers less current than the board can draw needs a rule (here: the USB-only
  mode).
- New test points need labels.
- New tall parts need a fresh fit check against the case and the display flex.
- Compliance: EN 50130-4 is cited under the EMC Directive, not the RED. The restriction notices
  on EN 301 489-3/-17 mean the test plan must set objective pass criteria. A radio module's
  certificate gives the host no EMC credit.
- A text block that grows with every revision needs its space reserved and linted against
  everything near it.
- A maker's layout rule is not argued away with an estimate (see [Ground rules](#ground-rules)).
- A claim about the routed board is measured on the routed board, not taken from the notes.
- Pads that match by number do not prove polarity. A library may number a diode's anode 1 where KiCad
  numbers the cathode 1 (the SS310, D105). Compare the pin names of every polarised part with the
  library entry of its part number, and look at the polarity marks in JLCPCB's placement preview.

## Current grades

As of November 2026, revision A. The grades were given to the board with the
ESP32-C6-MINI-1U. Area 9 (EMC, radio) and the items the switch to the ESP32-C5-MINI-1 touched
(2.4, 4.1 to 4.4, 5.2, 9.3) need re-grading at the next review.

| # | Area | Weight | Grade |
|---|---|---|---|
| 1 | Circuit correctness | 15 % | A |
| 2 | Power and protection | 12 % | A |
| 3 | Schematic readability | 10 % | A− |
| 4 | Parts and BOM | 8 % | A− |
| 5 | Stack-up and layout | 15 % | B+ |
| 6 | Fabrication | 7 % | A− |
| 7 | Assembly and silkscreen | 8 % | A− |
| 8 | Test and bring-up | 5 % | A− |
| 9 | EMC, radio and safety | 10 % | A− |
| 10 | Verification | 5 % | A− |
| 11 | Process and documentation | 5 % | A |
| | **Overall** | | **A− (3.75)** |

Items below A−, each with its entry in [limitations](hardware/touch-p4/limitations.md):

| Item | Grade | Reached |
|---|---|---|
| 5.3 MCU decoupling | C+ | 4 of 21 supply pins within target |
| 5.5 Crystal tracks | B+ | 6.5 / 6.8 mm |
| 9.3 Radio | B | Graded for the C6's external antenna; re-grade for the C5's PCB antenna |

Items at A− that also have a deviation entry: 2.4 (USB-only supply held to 500 mA; the PoE module's
headroom at 85 °C, added after grading), 6.2 (five
features at the fab's limit), 7.6 (small passives on the assembly drawing only) and 9.1 (tap
tile's seam, buzzer, lock screws). Item 5.2 has a deviation for the SDIO bus (two layer changes per
line), added after grading.

## Running the review

```bash
pnpm nx run attractap-touch-p4-pcb:check              # test, check-source, erc, check-netlist, drc, simulate, check-package
pnpm nx run attractap-touch-p4-pcb:check-footprints   # needs the internet

# in apps/attractap/hardware/touch-p4:
python3 scripts/layout_report.py fab/reports/board.json            # decoupling paths, crystal, fast nets, hot loops
python3 scripts/fab_margins.py kicad/attractap-touch-p4.kicad_pcb  # KiCad's Python (pcbnew); smallest features against JLCPCB's limits
```

`fab/reports/board.json` is written by the `simulate` target (`sim/dump_board.py`). The
antenna model runs separately: `pnpm nx run attractap-touch-p4-pcb:simulate-antenna`, with
`OPENEMS_PYTHON` set to a Python that has openEMS (see
[simulations](hardware/touch-p4/simulations.md)).
