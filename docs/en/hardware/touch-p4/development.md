# Working on the board
<!-- llms-description: How the Touch P4 KiCad project is generated from one circuit description, the Nx targets that build and check it, how to order it at JLCPCB and how a revision is released. -->

For hardware developers: where the design lives, how a change is made and checked, and how a
revision goes to JLCPCB. Why the circuit is as it is: [design notes](hardware/touch-p4/design-notes.md).

## Project folder

The design lives in [`apps/attractap/hardware/touch-p4/`](https://github.com/Attraccess/Attraccess/tree/main/apps/attractap/hardware/touch-p4/)
(Nx project `attractap-touch-p4-pcb`). This documentation and its images are in `docs/en/hardware/touch-p4/`
and `docs/_media/hardware/touch-p4/`.

```
kicad/                      KiCad 10 project, written by the generator: look, do not edit
  attractap-touch-p4.kicad_pro / .kicad_sch / .kicad_pcb
  attractap-touch-p4-<sheet>.kicad_sch    one sheet per function block
  attractap-touch-p4.ses                  the autorouter's result (committed)
  lib/attractap.kicad_sym, lib/attractap.pretty/, lib/attractap.3dshapes/
  sym-lib-table, fp-lib-table             register the project library
scripts/bootstrap/          the generator, master of the schematic and the board
scripts/export_fab.py       Gerbers, drill, BOM and placement files for JLCPCB, drawings
sim/                        field and circuit simulations of the routed board
case/                       3D-printable case, see the case page
fab/jlcpcb/                 the JLCPCB upload package (in git)
tools/pcb.sh                the commands behind the Nx targets
```

The case and its files: [case](hardware/touch-p4/case.md).

### Schematic structure

The root sheet is a block diagram with the revision history. Each block is one sheet:

| Sheet | Content |
|---|---|
| Power | USB-C input with its eFuse, DC input (jack and terminal) with its 5 V converter, PoE input, ideal diodes onto the 5 V rail, 3.3 V buck |
| MCU | ESP32-P4 GPIO and system units, flash, crystal, reset supervisor and buttons, boot, USB |
| MCU_Power | ESP32-P4 supply unit, decoupling, 1.1 V core converter |
| WiFi | ESP32-C5 module, its 3.3 V converter, SDIO pull-ups, reset and test points |
| Ethernet | PHY, crystal, straps, jack (lan version only) |
| NFC | PN532, supplies, matching network, antenna |
| Display | panel connector, RGB series resistors, backlight, IO expander |
| UI | LEDs, level shifter, buzzer |
| Mechanical | mounting holes, fiducials |

Each sheet is on the smallest paper that holds it (A4 or A3), with date and revision in its title
block. How the sheets are drawn: [Schematic drawing](#schematic-drawing).

## Source of truth

The circuit description in `scripts/bootstrap/` (`design.py`, `circuit_core.py`, `circuit_io.py`,
the placement and routing scripts) is the master. The KiCad files in `kicad/` and the package in
`fab/jlcpcb/` are generated from it and committed, so they can be opened, reviewed and ordered
without running anything.

- Make every change in the generator and regenerate: `generate-library` when a symbol or footprint
  changes, `generate-schematic`, then `place` and `route-finish`, then `check`.
- Open `kicad/attractap-touch-p4.kicad_pro` in KiCad 10 to look or try something out, but do not
  commit an edit made in KiCad. The next generator run overwrites it.
- Each generator step records a stamp in `kicad/generated-from.json`. `check-source`
  (`scripts/check_source.py`) fails when a KiCad file differs from what the generator wrote, or when
  the generator changed after the files were written. Comments and docstrings do not count.
- The other generated files (order package, board renders and PDFs, case print files, the manual's
  figures and PDFs) are listed with their sources in `generated-outputs.json`. Each generator records
  the sources it ran on in `generated-stamps.json`; the pre-commit hook
  (`scripts/check-generated.mjs --staged`) refuses a commit whose staged sources differ from the
  stamp, and names the command that regenerates the files. Stage the new outputs and the stamp file
  with the source change.

## Toolchain

- KiCad 10: `kicad-cli` and the `pcbnew` Python module, with numpy and Pillow.
- Java 25 or newer and [Freerouting](https://github.com/freerouting/freerouting) 2.5.0, for `route`
  only. Version 2.2.4 hangs on this board.
- Python 3 with [easyeda2kicad](https://github.com/uPesy/easyeda2kicad.py), to fetch parts.
- ngspice for `simulate`, openEMS for `simulate-antenna`.

The targets find KiCad on the PATH, in the macOS app bundle or in nixpkgs (override with `KICAD_CLI`
and `KICAD_PYTHON`), and ngspice on the PATH or in nixpkgs (`NGSPICE`). KiCad runs with its own
configuration under `.tools/kicad`. Reports go to `fab/reports/`.

## Nx targets

Run each as `pnpm nx run attractap-touch-p4-pcb:<target>`.

| Target | What it does |
|---|---|
| `setup-toolchain` | Checks KiCad 10 and its Python, downloads the autorouter into `.tools/kicad`. Run once. |
| `check` | Runs `test`, `check-source`, `erc`, `check-netlist`, `drc`, `simulate` and `check-package` (`fab/jlcpcb/` matches the board). Run before ordering. |
| `test` | Checks of the circuit description and the I2C address check. Needs no KiCad. |
| `check-source` | The KiCad files are what the generator wrote. Needs no KiCad. `python3 scripts/check_source.py --full` regenerates everything in a copy and compares (about 45 minutes, needs KiCad; before an order). |
| `erc` | Electrical rules check of the schematic. |
| `check-netlist` | Schematic against the circuit description; devices and addresses on each I2C bus. |
| `drc` | Design rules check of the board, including schematic parity. |
| `check-package` | `fab/jlcpcb/` matches the board. |
| `check-footprints` | Every footprint against JLCPCB's library footprint of its part number: pad fit and placement angle. Needs the internet; not part of `check`. Run it after a part number or footprint change. |
| `simulate` | Simulates the routed board against the parts' limits: NFC loop, matching and field, live plug-in at the DC input, power-up, reflections and timing on fast lines, voltage drop, PoE isolation distances, heat in the closed case, the dock magnet. Needs ngspice. See [simulations](hardware/touch-p4/simulations.md). |
| `simulate-antenna` | Full-wave model of the Wi-Fi module's PCB antenna (a stand-in of the same size and kind) in its place and at Espressif's position, with the display, in the case and with a metal wall behind. Needs openEMS; not part of `check`. |
| `build` | Runs `erc` and `drc`, then writes the JLCPCB package into `fab/jlcpcb/` and the schematic and two board plots (PDF) into `docs/_media/hardware/touch-p4/`. |
| `render` | The 3D renders `docs/_media/hardware/touch-p4/board-top.png` and `board-bottom.png`. |
| `generate-library` | Builds `kicad/lib/` from LCSC conversions (`-- <dir>`) or reapplies repairs and 3D models (`-- --refit`). |
| `generate-schematic` | Writes the schematic from the circuit description. |
| `place` | Builds the board: parts, zones, fixed vias and routes; reports overlapping parts. |
| `route` | Runs the autorouter and replaces `kicad/attractap-touch-p4.ses`, then finishes as `route-finish`. |
| `route-finish` | Rebuilds the routing from the committed `.ses` (after `place`): closes open connections, widens supply tracks, adds return and stitching vias, fills zones, runs DRC. About five minutes; repeatable. |

The last five overwrite the KiCad files.

## The generator

The scripts in [`scripts/bootstrap/`](https://github.com/Attraccess/Attraccess/tree/main/apps/attractap/hardware/touch-p4/scripts/bootstrap)
build the whole project from `design.py`: library, schematic sheets, placement, fixed routes, the
autorouter's committed result, a grid router for the remaining connections, and the checks.

| Files | Purpose |
|---|---|
| `design.py`, `circuit_core.py`, `circuit_io.py`, `parts_info.py` | The circuit description: every part, sheet by sheet, with value, footprint, LCSC number, variant and the net on each pin; part numbers of the passives; maker, lifecycle and alternate of every other part. |
| `libs.py`, `make_lib.py`, `lib_symbols.py`, `footprint_silk.py` | The project library: LCSC/EasyEDA conversions checked and repaired, the NFC antenna footprint, the three-unit ESP32-P4 symbol, paste windows on the exposed pads of ESP32-P4, PHY and PN532, the symbols drawn here, footprint silkscreen cut back from pads. |
| `collect_models.py`, `model_fit.py`, `lib_models.py` | 3D models in `kicad/lib/attractap.3dshapes/`, fitted on their footprints. |
| `build_sch.py`, `sch_*.py` | The schematic: title blocks, revision history, one layout per sheet, the drawing engine, connectivity check and overlap lint. |
| `geometry.py`, `placement.py`, `board.py`, `board_setup.py` | Outline, display, slot, antenna, LED, sensor and dock positions, `COPPER_LAYERS`; part positions; zones, keep-outs, rules, net classes. |
| `build_pcb.py` | Builds the board (`place`), exports and imports the autorouter files (`dsn`, `ses`), fills zones (`finish`). |
| `routes_mcu.py`, `routes_board.py`, `routes_signal.py`, `routes_sdio.py`, `routes_wifi.py` | Fixed routes: MCU fan-out, flash, display bus; 48 V, Ethernet, DC filter, ground vias; the 90 ohm USB pair; the length-matched SDIO bus (HDG 1.4.9); the Wi-Fi module's converter. |
| `finish_route.py`, `route_grid.py`, `post_route.py` | Grid router for what the autorouter leaves open; wider supply tracks, return and stitching vias, and `--fix` to take back what DRC flags. |
| `silk.py`, `silk_refdes.py` | Silkscreen of both sides (logo from `case/logo/`, GPIO map, notes) and the designators. |
| `check_overlap.py`, `check_netlist.py`, `test_design.py` | Overlapping bodies; netlist against `design.py` and I2C address clashes; the `test` target. |

### Steps

```bash
# 1. fetch the LCSC parts once into a scratch folder, then build kicad/lib
easyeda2kicad --lcsc_id C54540373 C5736265 ... --full --output /tmp/lcsc/lcsc
pnpm nx run attractap-touch-p4-pcb:generate-library -- /tmp/lcsc
# 1b. 3D models: fetch once into a cache, store them and write lib_models.py, then attach them
python3 scripts/bootstrap/collect_models.py /tmp/models --fetch
pnpm nx run attractap-touch-p4-pcb:generate-library -- --refit
# 2. schematic, then ERC and the netlist check
pnpm nx run attractap-touch-p4-pcb:generate-schematic
# 3. board: parts, zones, fixed vias and routes
pnpm nx run attractap-touch-p4-pcb:place
# 4a. rebuild the committed routing (repeatable)
pnpm nx run attractap-touch-p4-pcb:route-finish
# 4b. or route anew: autorouter (30 minute limit), then the same finishing steps (15 to 40 minutes in all)
pnpm nx run attractap-touch-p4-pcb:route
```

To add a part from LCSC, add it to the circuit description, fetch the conversions of all the
board's LCSC parts into one folder (step 1, with the new LCSC number) and regenerate from there.
Every fitted part carries `LCSC`, `Manufacturer`, `MPN`, `BOM description`, `Alternate` and, for ICs
and modules, `Lifecycle`. Passives use KiCad's standard libraries; 3D models come from the
JLCEDA/EasyEDA library for converted footprints and from KiCad's packages3D for standard ones.

The steps behind `route` and `route-finish` are in `tools/pcb.sh`. The autorouter writes its result
only after its last pass, hence the time limit, and never gives the same result twice: commit a new
`.ses` together with the board it led to.

`COPPER_LAYERS` in `geometry.py` is 6; 4 builds the four-layer layout from the same routing (8 to 45
USD cheaper per order, with the return-path weaknesses in the design notes). Tracks run on F.Cu, In2
and B.Cu in both; only the planes differ (`board_setup.zones`).

### Schematic drawing

Each sheet is drawn by a layout function, block by block. A block is one function (the USB input,
the core converter, the NFC transmit path), drawn in a titled frame as a circuit: wires read left to
right, supplies up, ground down. Labels join blocks and carry buses (RGB, RMII, SDIO, flash), never
inside a block; nets that cross sheets are hierarchical labels and appear as pins on the root sheet.
`GND`, `+3V3` and `+5V` are power symbols. Capacitors show voltage and dielectric, resistors their
tolerance where it matters.

`sch_finish.finish()` closes what a layout leaves open: supply pins get a power symbol (neighbours
share one), other pins a short wire with a label, unused pins a no-connect flag, and a net wired
entirely inside a block gets its name on one wire, so the schematic keeps the circuit's net names.

`check()` raises when a wire, pin or label would join two nets, counting whatever KiCad might join
(stricter than KiCad). `lint()` reports overlapping text, symbols, wires and block frames;
`build_sch.py` fails unless it reports nothing. Whether the circuit is right is decided by
`check-netlist`, pin by pin against `design.py`, not by the drawing.

Symbols in `lib_symbols.py`:

- renamed after the fitted part from a symbol with the same pins: SN74LV1T125DBVR (74AHCT1G125),
  LIS2DH12TR (LIS2DE12), DRV5032FADBZR (DRV5033), the TVS diodes SMBJ28A (SM6T) and SMBJ28CA (SMAJ10CA);
- drawn for reading: USB-C receptacle and USB ESD part, PoE module (input left), RJ45 jack (pin names
  by function), the converters (input left, switch node right), ideal diode, eFuse, supervisor, PHY,
  LED, buzzer, PN532 (host left, radio right) and the ESP32-C5 module (pins from its datasheet v1.4,
  table 3-1).

### Changes after the autorouter ran

The committed `.ses` is older than the last design review, which moved, added and rewired parts.
`route-finish` copes with that without a new autorouter run:

- `build_pcb.py ses` imports the routes only, not the part positions the session also records.
- `STALE_NETS` (in `build_pcb.py`): their autorouted tracks are dropped; they have fixed routes now.
  `STALE_PARTS`: autorouted tracks near their pads or fixed vias are removed and rerouted.
- `drop_collisions` removes any other autorouted track or via too close to a pad, fixed via or fixed
  track of another net, so a part can be moved without touching the lists.
- The import turns the session's four-layer vias back into through vias.

When the autorouter is run again, empty both lists.

### Pitfalls

- Fixed routes must end on a pad or via, use only 0, 45 and 90 degree segments, and meet other
  tracks at their end points; otherwise the autorouter gives up on the net.
- Run one autorouter at a time; two instances block each other.
- `finish_route.py` takes minutes to an hour. When two nets keep cutting each other in its log, the
  spot has too little room: fix the placement or add a fixed route. Rerunning does not help.
- A supply fan-out via in front of a pad row can cost an escape track. `plane_fanout` runs last and
  has a short list of pads fed another way.
- JLCPCB counts a footprint's angle from its own library footprint, not KiCad's. `check-footprints`
  compares them; the corrections are in `scripts/export_fab.py`.
- A ceramic capacitor's listed value is at 0 V. Use the value at the working voltage from the
  maker's curve (10 uF / 50 V parts had 1.35 uF at 24 V).
- A thermal via in a converted footprint is a plated pad, invisible to via checks; `test_design.py`
  checks that none carries paste.
- Through-hole parts stand out of the display side. Keep them out from behind the display; where
  they cannot be (the Ethernet jack), `test_design.py` checks 48 V pin placement and the display distance.

## Ordering at JLCPCB

`build` writes the upload package to `fab/jlcpcb/`. It is in git, so the files of an order can be
found again; `check` fails when it does not match the board.

| File | Use |
|---|---|
| `attractap-touch-p4-gerbers.zip` | The PCB order: Gerber and drill files. |
| `attractap-touch-p4-fab.pdf` | Fabrication drawing: outline, cut-outs, stack-up, drill table, smallest features, notes (finish, IPC class, via filling). Attach it to the order. |
| `attractap-touch-p4-assembly.pdf` | Assembly drawing: every part with outline, pads, designator, value, pin 1 and polarity; detail sheets of MCU, PHY, NFC chip and power. For assembly questions, inspection and repair. |
| `attractap-touch-p4.ipc` | IPC-D-356 netlist for the fab's electrical test. |
| `bom-lan.csv`, `cpl-lan.csv` | Assembly of the lan version: parts list (with maker, part number, alternate, lifecycle) and positions. |
| `bom-wifi.csv`, `cpl-wifi.csv` | Assembly of the wifi version. |
| `parts-list-lan.csv`, `parts-list-wifi.csv` | Everything to buy for one reader, including the display panel JLCPCB does not fit. |

Order form:

| | |
|---|---|
| Board | 6 layers, 86 x 143.5 mm, 1.6 mm FR-4 |
| Stack-up | JLC06161H-3313: "Specify Stackup" = "Yes" and pick it (no charge). Prepreg 0.0994, core 0.55, prepreg 0.1088, core 0.55, prepreg 0.0994 mm |
| Smallest track and gap | 0.11 mm and 0.127 mm (JLCPCB limit with inner layers: 0.09 mm). Two segments are 0.112 mm, all others 0.126 mm or more. Pads of two nets at least 0.15 mm apart (MCU pins). Margins: [design notes](hardware/touch-p4/design-notes.md) |
| Smallest via | 0.45 mm pad, 0.2 mm hole (about one via in five; most have 0.5 mm pads). Free with inner layers at 0.45 mm or wider: leave "Min via hole size/diameter" at "0.3mm/(0.4/0.45mm)"; smaller choices cost 39 USD and more |
| Vias | "Epoxy Filled & Capped", no charge, and required: C208, C223 and C226 at the MCU have a via in the pad, and the twelve ground vias between the Wi-Fi module's ground pads touch the pads (Espressif's land pattern). No other via lies under paste. "Tented" is not offered with inner layers |
| Solder mask | green: the 0.1 mm webs between the MCU's pins are JLCPCB's limit for green |
| Milled openings | flex slot 10.5 x 21.6 mm, 16 LED windows 3.4 x 3.0 mm with relieved corners, a cut 28.9 x 6.0 mm in the top edge under the Wi-Fi antenna, two cut-away corners, plated slots at the DC jack and USB-C |
| Outline tolerance | the regular +/-0.2 mm |
| Surface finish | ENIG (18 USD on 5 boards, 48 on 100, 336 on 1000). Not the free OSP: JLCPCB excludes it for contact areas, and the four display ground pads and 30 test points would stay bare copper |
| Impedance control | "Yes", +/-10 % (33 USD per order): USB pair 90 ohm differential (0.14 mm lines, 0.15 mm gap, back layer over In4), Ethernet 50 ohm (0.155 mm, component side over In1), from JLCPCB's calculator for this stack-up; the fab may adjust widths |
| Assembly | Standard PCBA, top side only: 233 parts in 85 lines (wifi), 270 parts in 96 lines (lan). Edge rails "Added by JLCPCB": the panel becomes 96 x 143.5 mm |
| Through-hole parts | DC jack J102, DC terminal J103, and on the lan version the jack J401 |
| Not assembled | the display panel (taped on, flex plugged into J601) |
| Serial number | "Mark on PCB" = "2D barcode (Serial Number)", printing "Number Only", position "Specify Position": JLCPCB prints a unique number into the 10 x 2 mm white field beside `S/N` on the component side. Without it the field stays white to write on |

The silkscreen carries a designator wherever one fits (about half the parts); the assembly drawing
has them all. Cost and sourcing: [parts and sourcing](hardware/touch-p4/parts.md).

Check before paying:

- **Stock.** JLCPCB's parts list shows what it lacks. The ESP32-P4 (U201) is out of stock at JLCPCB and
  LCSC and has to be bought into JLCPCB's parts stock before the assembly order. From a few hundred
  boards on, the PoE module, PN532, ESP32-C5 module, LIS2DH12, DC jack and L103/L201 run short too
  ([parts and sourcing](hardware/touch-p4/parts.md)). JLCPCB offers "Do not place" for a part it lacks:
  only for a quote, never for an order.
- **DC terminal J103.** The WAGO 250-202 has two pins, the footprint four holes (it also takes the
  WAGO 2601-3102). Order remark: pins in the upper left and lower right hole, wire entry towards
  the edge with the two cut-away corners. The fabrication drawing shows the body outline.
- **Rotation.** The placement files carry JLCPCB's angle where it differs from KiCad's
  (`JLC_ROTATION` in `scripts/export_fab.py`: U501, U701, U702, U204, U703, Q101, Q102, Q701, the
  resistor arrays, D105). `check-footprints` matches every footprint to JLCPCB's library by pad
  number, except L102 (no library footprint; two pads, no polarity). It cannot see a library that
  numbers the pins differently: JLCPCB's entry for the SS310 (D105) numbers the anode 1, KiCad the
  cathode, so D105 needs a half turn that the pads alone do not show.
  Checked in JLCPCB's placement preview on 26 November 2026 (polarity marks against the nets): D101,
  D103, D105 (after the fix), D106, D601, D709, C103, C120, BZ701 and U102 sit right; the LEDs, U107,
  U204, U302, U601, U703, U704 and Y501 number their pins as JLCPCB's library does. D107 is
  bidirectional. **Check every polarised part in the preview again before each order:** a new part
  number or a library change at JLCPCB can turn a part without any check here noticing.

## Releasing a revision

### Revision history

The same lines stand in the root sheet's title block (`HISTORY` in `scripts/bootstrap/build_sch.py`);
a test fails when the two differ. Revision A has not been ordered yet; these are the dated states of
its design.

| Revision | Date | Change |
|---|---|---|
| A | 2026-11-15 | First design, generated from the circuit description |
| A | 2026-11-21 | Review: Ethernet jack, silkscreen, tamper sensors (accelerometer, hall switch, proximity) |
| A | 2026-11-22 | Six layers; checked against the datasheets: PN532 paste, DC input capacitors |
| A | 2026-11-24 | Simulated: NFC matching; ESP32-C6-MINI-1U with an antenna connector |
| A | 2026-11-25 | Industry review: core divider 499k, 3 kV barrier capacitors, schematic redrawn, TVS symbols |
| A | 2026-11-25 | Industry review: parts data and alternates, fab drawing, IPC-D-356 netlist, 3D models, land patterns of USB-C, ESP32-C6 and display connector |
| A | 2026-11-25 | Industry review: eFuse and ideal diodes on the 5 V rail, reset supervisor, damped DC input, TLV62569 3.3 V converter, test points, DC and PoE present to the firmware |
| A | 2026-11-25 | Industry review: layout rework (ESP32-P4 land pattern, decoupling, USB pair, impedance), 2.0 x 1.6 mm crystal, designators on the silkscreen, assembly drawing |
| A | 2026-11-25 | Wi-Fi module ESP32-C5-MINI-1 (2.4 and 5 GHz, PCB antenna) instead of the ESP32-C6-MINI-1U, with a 3.3 V converter of its own |
| A | 2026-11-27 | Tap tile: 16 LEDs in a ring round the NFC loop, the loop on the case centre line, the PN532 below the display, the fourth mounting hole left of the tile |

### Before an order

1. `check` passes.
2. `check-footprints` passes (needs the internet).
3. Every line of the variant's parts list is in stock at JLCPCB or ordered in through its parts sourcing.
4. Someone other than the author reads the schematic PDF, the fabrication and assembly drawings,
   checks the open points in [known limitations](hardware/touch-p4/limitations.md), and signs off:
   their name goes into `CHECKED_BY` in `build_sch.py`, which puts it in every title block.
   Regenerate the schematic and commit.
5. If anything changed since the last order, a new revision letter: `REV` in `build_sch.py` (title
   blocks), the `REV A` text in `silk.py` (silkscreen), and a line in `HISTORY`.

### The order and after

- Upload the Gerber zip and the variant's BOM and CPL, and fill the order form as above.
- Keep JLCPCB's order number with the commit that records the order (in its message).
- The maintainer tags that commit `touch-p4-rev-<letter>` (for example `touch-p4-rev-A`); tools and
  the generator do not create tags.
- What the first boards show goes into the design notes, and what has to change into the next revision.
