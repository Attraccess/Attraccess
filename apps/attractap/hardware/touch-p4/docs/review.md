# Design review of revision A

The industry-practice review of the Touch P4 board, as it stood on 25 November 2026
at commit `e4e83c0a`. This page records how the board was graded, what each
grade asks for, the grades before and after the fixes, and every decision taken
on the way. What each finding changed in the design is in
[design-notes.md, "Industry review"](design-notes.md#industry-review). The targets
the board does not fully reach are under
[Accepted deviations](design-notes.md#accepted-deviations).

The Wi-Fi module was decided again after this review: see
[Decisions](#decisions), the last entry. The grades below are for the board with
the ESP32-C6-MINI-1U.

## How the board was reviewed

- **Generator and checks.** The board is generated from `scripts/bootstrap/`; the
  KiCad files are its output, and `check-source` fails on a hand edit. Every
  check ran in the `kicad10-np` Docker image, on a `git archive` of the commit
  under review, so nothing uncommitted could pass for the reviewed state.
- **ERC and DRC at KiCad's default severities.** No rule may be lowered or
  ignored in the project file. `--severity-all` counts warnings as findings.
- **Reading, not only checking.** Every schematic sheet was rendered at 200 dpi
  and read. The silkscreen, the assembly drawing and the copper layers were
  plotted and looked at.
- **Layout measurements:** `scripts/layout_report.py` measures the copper path
  from each MCU supply pin to its capacitor, crystal and fast-net lengths, vias
  and hot-loop areas. `scripts/fab_margins.py` compares the smallest features
  with JLCPCB's published limits.
- **Primary sources for every claim.** Datasheets, the makers' land-pattern
  drawings, the standards' text, the EU's Official Journal, ETSI documents and
  the makers' certificates. The repository's own notes count as leads, not as
  evidence. `compliance.md` was checked claim by claim, then spot-checked
  independently against the same kind of sources.
- **Not reviewed: hardware.** No board had been built. Grades judge the design;
  the bring-up plan has to confirm it.

## Grading

| Grade | Meaning |
|---|---|
| A | What a professional design review passes without remarks |
| A− | Passes, with small remarks that need no change before ordering |
| B | Good, with gaps worth fixing |
| C | Acceptable for a prototype, with real gaps |
| D | Needs rework |

For the overall grade the letters count as A = 4.0, A− = 3.7, B+ = 3.3, B = 3.0,
B− = 2.7, C+ = 2.3, C = 2.0, C− = 1.7, D+ = 1.3, D = 1.0. They are averaged per
area and weighted as in the table under [Grades](#grades).

**Target:** every item at A− or better. Where a target cannot be met at a
reasonable cost, the item keeps its lower grade with an entry under "Accepted
deviations" in `design-notes.md`. That entry gives the target, what was reached,
why it stops there, the mitigation, and what a later revision could do. A
documented deviation is not sent back again. (Decision of 25 November 2026.)

## What A− asks of each item

Items not listed were at A− or better from the start and must not get worse.

**Circuit**
- 1.3: the ESP32-P4 schematic checklist followed to the letter. For chip revision
  v3.x that includes the 499 kΩ / 499 kΩ / 22 pF core feedback network.

**Power**
- 2.1 DC input margin: the live-plug-in simulation peaks at least 5 V below the
  converter's limit, also at 24 V + 10 %. The TVS stand-off is justified for that
  range. The surge that the applicable standard asks for is clamped within the
  converter's rating.
- 2.2 Source OR-ing: ideal diodes or a power mux instead of Schottky diodes, with
  no back-feed into an unplugged source.
- 2.3 USB inrush: at most 10 µF at VBUS when plugged in (USB 2.0 §7.2.4.1), or
  slew-limited start-up, shown by simulation.
- 2.4 Power budget: worst case per rail and per source, at least 30 % headroom on
  each regulator, and the +5V rail's ceiling against every 5 V load's limit.
- 2.6 Brown-out: a supervisor on CHIP_PU, and switching between supplies while
  running, simulated.

**Schematic**
- 3.2 Signal flow: wires inside each block, flowing left to right; supplies up,
  ground down; labels only between blocks and for buses.
- 3.3 Text: an overlap lint that also covers pin names and numbers and fields
  against symbol graphics, reporting zero; every sheet readable when printed.
- 3.4 Symbols: every symbol named after the fitted part, TVS diodes as TVS.
- 3.6 Title block: date, drawn by, checked by, and a revision history.
- 3.7 Values: capacitors with voltage and dielectric, resistors with tolerance
  where it matters.

**Parts and BOM**
- 4.1 Part choices: a lifecycle status, with its source, for every IC and module.
- 4.2 Availability: a named, checked alternate for every part whose secondary
  figures matter (TVS, fuses, ferrites, inductors, crystals, diodes, ICs), and a
  sourcing plan for parts out of stock.
- 4.3 BOM: maker, part number, full description and alternate on every line, in
  both variants.
- 4.4 Footprints: the critical land patterns checked against the makers'
  drawings, and recorded.
- 4.5 3D models: every footprint has one, and the case fit is checked with them.

**Layout**
- 5.2 Routing: critical nets cleaned up or routed by hand; USB as a coupled pair
  with equal via counts and at most 1 mm mismatch.
- 5.3 Decoupling: copper path from pin to capacitor at most 3 mm on the priority
  rails (VDD_HP, VDD_PSRAM, VDD_FLASH, VDDO_4, VDD_USBPHY, VDD_BAT, VDD_LDO,
  VDD_DCDCC, VDD_ANA), at most 5 mm on the 3.3 V I/O pins.
- 5.4 Switchers: the hot loop of every converter measured and written down.
- 5.5 Crystal: MCU crystal tracks at most 5 mm each.
- 5.6 Impedance: USB 90 Ω and Ethernet 100 Ω differential, the widths from the
  fab's own calculator, and impedance control in the order.

**Fabrication**
- 6.1 DRC: 0 errors and 0 warnings at KiCad's default severities.
- 6.2 Margins: nothing at the fab's limit unless the part forces it, each case
  written down against the fab's published limits.
- 6.4 Fab documents: a fabrication drawing and an IPC-D-356 netlist in the
  package.

**Assembly and silkscreen**
- 7.2 Fiducials: a local pair at the 0.35 mm pitch MCU.
- 7.3 Rotations: `check-footprints` passes for every part.
- 7.6 Designators: every part other than a small passive (U, Y, L, FB, D, Q, J,
  SW, F, RN, BZ) carries its designator on the silkscreen. A test enforces it.
- 7.7 Assembly drawing: designators only, readable, with detail sheets of the
  dense areas.

**Test**
- 8.1 Test points: on every rail, both I²C buses and the RMII clock, each
  labelled with its net.

**EMC, radio and safety**
- 9.1 ESD: a per-port table of the targeted IEC 61000-4-2 level and the part
  that provides it.
- 9.3 Radio: an antenna the module was certified with, in the parts lists, with
  a place in the case and the cable route drawn.
- 9.4 PoE isolation: barrier capacitors rated for the 802.3 isolation test, and
  3 mm from 48 V copper on every layer and through the board.
- 9.6 Compliance: every claim checked against a primary source and cited.

**Verification and process**
- 10.3 Simulations: the key results cross-checked with an independent reference.
- 11.2 One-page spec (`spec.md`).
- 11.3 One source of truth, with a check that fails when the KiCad files differ
  from the generator's output.
- 11.4 A revision history that matches the title block, and a release procedure.

## Grades

First review: 24 November 2026, commit `268a00a6`. Final grades: 25 November 2026,
commit `e4e83c0a`.

| # | Area | Weight | Before | After |
|---|---|---|---|---|
| 1 | Circuit correctness | 15 % | A− | A |
| 2 | Power and protection | 12 % | B | A |
| 3 | Schematic readability | 10 % | C+ | A− |
| 4 | Parts and BOM | 8 % | B− | A− |
| 5 | Stack-up and layout | 15 % | B | B+ |
| 6 | Fabrication | 7 % | B | A− |
| 7 | Assembly and silkscreen | 8 % | B− | A− |
| 8 | Test and bring-up | 5 % | B+ | A− |
| 9 | EMC, radio and safety | 10 % | B− | A− |
| 10 | Verification | 5 % | B+ | A− |
| 11 | Process and documentation | 5 % | B | A |
| | **Overall** | | **B (2.99)** | **A− (3.75)** |

**Items below A−**, each with its entry under "Accepted deviations":

| Item | Grade | Reached | Why it stops |
|---|---|---|---|
| 5.3 MCU decoupling | C+ (was C−) | 4 of 21 supply pins within target | 0.35 mm pitch, and the board stays single-sided |
| 5.5 Crystal tracks | B+ (was B) | 6.5 / 6.8 mm, with a 2016 crystal | Espressif's 4.5 mm gap rule and the NFC vias |
| 9.3 Wi-Fi antenna | B (was C+) | Certified antenna and a fallback in the parts lists, bay in the case | The certified antenna (100 mm) does not fit the bay; the fallback needs radio tests |

These items are at A− but are also listed as deviations:
- 2.4: USB as the only source is held to the 500 mA class.
- 6.2: five features sit at the fab's limit.
- 7.6: small passives are on the assembly drawing only.
- 9.1: the LED windows, buzzer and lock screws.

## Decisions

| Date | Decision | Why |
|---|---|---|
| 24 Nov | Generator stays the source of truth; every change goes through `scripts/bootstrap/` | The committed KiCad files were exactly its output |
| 25 Nov | Ideal-diode OR-ing (LM74700-Q1 + IRLML0030) and a USB eFuse (TPS259470A), 5.01 USD per board at 100 pieces; surge diodes +0.2 USD | Cap set at about 5 USD; genuine parts only, no unverified clones |
| 25 Nov | Openings in the dock plate under J401 and U102 instead of a deeper case | Keeps the look; clear of the proximity sensor's light path and the dock magnet |
| 25 Nov | PN532 kept although NXP lists it as not for new designs | The firmware and protocol match the readers in use; Tokmas and NXP parts are each other's alternate; migration noted for revision B |
| 25 Nov | MCU land pattern changed to Espressif's pads | The most critical footprint, and the layout was being reworked anyway |
| 25 Nov | USB as the only source: the firmware always applies the 500 mA class | No route for the CC lines to an ADC pin; the conservative reading of the same rule |
| 25 Nov | No line-to-line surge protection beyond the standards; EN 50130-4 levels to be confirmed with the lab | Not required for this port class; it would need a 60 V converter |
| 25 Nov | **Parts on the top side only** (user) | A second assembly side would raise the cost too much; MCU decoupling becomes a deviation |
| 25 Nov | **Infeasible or costly targets become accepted deviations** (user) | Cost before a uniform grade |
| 25 Nov | **Wi-Fi: ESP32-C5 with its own PCB antenna, the larger ESP32-C5-WROOM-1** (user) | Dual-band Wi-Fi 6; internal antenna accepted; the external-antenna variants lacked a certificate or did not fit; see below |
| 25 Nov | **Wi-Fi: the ESP32-C5-MINI-1-N4-V1.2 instead of the WROOM-1** (user) | No WROOM-1 variant in stock at JLCPCB or LCSC; the MINI-1 is certified (EU-type examination certificate 44024-05-2026-260268) and stocked; see below |

### The Wi-Fi module

Rule set by the user: switch to the ESP32-C5 if the module (and antenna, if any)
costs at most about 2 USD more per board at 100 pieces and both are stocked.

What was found on 25 November 2026:
- **C5-MINI-1U** (external antenna): about +0.85 USD with a dual-band antenna, in
  stock. No RED, FCC or ISED certificate is published for it.
- **C5-WROOM-1U** (external antenna): certified (SN25C0297, notified body 2907),
  about +1.22 USD. At 18 × 21.2 mm it needs the top-left corner laid out again.
- **C5-MINI-1** (internal antenna): certified and in stock.
- **The user's decision:** the larger module with its own PCB antenna, the
  **ESP32-C5-WROOM-1**.
- **Heat is not settled.** The C5 modules are rated to 85 °C. The heat estimate
  gave the C6 module 79 °C ±40 % in a 40 °C room on PoE. Whether that figure is
  comparable with the C5's rating (module temperature against ambient) was still
  being checked when the switch was handed over. It has to be settled with the
  C5's own power figures.

When the switch began, later the same day, JLCPCB and LCSC had no ESP32-C5-WROOM-1
of any variant in stock, although the module is certified (EU-type examination
certificate SN25C0185, FCC 2AC7Z-ESPC5WROOM1). The user then chose the
**ESP32-C5-MINI-1-N4-V1.2**: 614 in stock, 3.36 USD at 100 pieces. What was
checked for it is in
[design-notes.md, "Wi-Fi module: ESP32-C5-MINI-1"](design-notes.md#wi-fi-module-esp32-c5-mini-1).

An unfinished switch to the C5-MINI-1 exists as a local, unpushed reference
commit on the branch `t3/attractap-touch-p4-c5-mini1-wip`. It was used as a lead
only.

## What the review itself caught

These came up between the stages, after the fixes, and are worth checking first
in the next review:

- A lint that passes is not proof. The first overlap lint ignored pin text, and
  rendering the sheets found the overlaps.
- Removing the Schottky diodes also removed their 0.4 V drop. The +5V rail then
  followed a USB source up to the eFuse's cut-off, above some loads' limits.
- A TVS diode's clamping voltage at its rated current can exceed the protected
  part's rating. Check it at the current the applicable surge test drives, and
  first find out which test applies.
- Check an IC's pin *functions*, not only its package drawing, before leaving
  pins open.
- Every capacitor on a converter's output counts towards its stability limit,
  including those at the loads.
- A source that offers less current than the board can draw needs a rule. This
  board has a USB-only mode.
- New test points need labels.
- New tall parts need a fresh fit check against the case and the display flex.
- Compliance: EN 50130-4 is cited under the EMC Directive, not the RED. The
  restriction notices on EN 301 489-3/-17 mean the test plan must set objective
  pass criteria. The module's certificate gives the host no EMC credit.
- A text block that grows with every revision needs its space reserved and
  linted. The root sheet's revision history grew into the sheet symbols below
  it; the lint checked texts against texts only, and now checks free text
  against sheet symbols, pins and labels on every sheet, the root included.
- A rule in the maker's layout guide is met wherever the board allows it, and
  only the part that cannot be met goes into a deviation, with the reason. The
  first C5 layout argued the HDG's SDIO length rule away with a timing estimate;
  the bus now meets it with serpentines and misses only the one rule the
  front layer leaves no room for.
- A claim about the routed board is measured on the routed board. The notes
  said every SDIO via had a ground via beside it, while the post-route step
  had found no room below the module (nearest 2.6 to 6.4 mm). The generator
  now places those ground vias itself, and the notes give the measured
  distances (0.7 to 1.7 mm).
- A module's own capacitors sit on the rail of the converter that feeds it and
  count towards that converter's limit. The C6 module's were never counted;
  the C5's (33.4 uF) are, in the capacitance tests.

## Running the review again

```bash
pnpm nx run attractap-touch-p4-pcb:check              # test, check-source, erc, check-netlist, drc, simulate, check-package
pnpm nx run attractap-touch-p4-pcb:check-footprints   # needs the internet

# in apps/attractap/hardware/touch-p4, with KiCad's Python (pcbnew), e.g. in the kicad10-np image:
python3 scripts/layout_report.py fab/reports/board.json   # decoupling paths, crystal, fast nets, hot loops
python3 scripts/fab_margins.py kicad/attractap-touch-p4.kicad_pcb   # smallest features against JLCPCB's limits
```

`fab/reports/board.json` is written by the `simulate` target (`sim/dump_board.py`).
