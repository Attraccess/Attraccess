# Bootstrap generator for revision A

These scripts produced the first version of the KiCad project from one circuit
description. They are kept so that revision A can be reproduced and audited.

**They overwrite the schematic and the board.** Once the KiCad project has been
edited by hand, treat the KiCad files as the source of truth and do not run
`build_sch.py` or `build_pcb.py place` again.

| File | Purpose |
|---|---|
| `design.py` | The circuit description: part model, part numbers of the passives, and `build()`. |
| `circuit_core.py`, `circuit_io.py` | Every part, sheet by sheet, with value, footprint, LCSC number, variant, group and the net on each pin. |
| `libs.py` | Reads symbol and footprint libraries, checks every part against both. |
| `make_lib.py` | Builds `kicad/lib/` from LCSC/EasyEDA conversions, generates the NFC antenna footprint and the three-unit ESP32-P4 symbol, and windows the solder paste on the exposed pads of the ESP32-P4, the Ethernet PHY and the PN532. `derived_symbols()` draws the symbols that the converter or KiCad's library got wrong or named after another part (see "Schematic drawing"). `--refit` applies its repairs and the derived symbols again to the library that is in the project. |
| `build_sch.py` | Writes the hierarchical schematic (root + one sheet per block), with title blocks and the revision history. Fails when the overlap lint finds anything. |
| `sch_power.py`, `sch_mcu.py`, `sch_periph.py`, `sch_io.py` | The drawing of each sheet: where every part of a functional block goes and the wires between them (see "Schematic drawing" below). `sch_layouts.py` maps the sheets to them and picks the smallest paper that holds a sheet. |
| `sch_draw.py`, `sch_finish.py` | The drawing engine: symbols, wires, labels and power symbols; closing the pins a layout leaves open; the connectivity check and the overlap lint. |
| `geometry.py` | Board outline, display position, slot, antenna and LED positions. |
| `placement.py` | Position and rotation of every part. |
| `build_pcb.py` | Builds the board (`place`), exports and imports the autorouter exchange files (`dsn`, `ses`), fills the zones (`finish`). |
| `board.py` | Paths, coordinate helpers and the `Board` wrapper around pcbnew that the builder modules share. |
| `board_setup.py` | Outline, zones and keep-outs, ground pads for the display, design rules, net classes, project file. |
| `silk.py` | The silkscreen of both sides: logo from the vector files in `case/logo/`, labels, the GPIO map (from `circuit_core.P4_GPIO`), notes. Checks that no text lies on a pad, on another text or off the board. |
| `routes_mcu.py` | Fixed routes at the MCU: supply vias, the fan-out of all four sides, the flash, the display bus, and the NFC host signals at the PN532. |
| `routes_board.py` | Fixed routes elsewhere: 48 V nets, Ethernet pairs, antenna feeds, DC input with its filter, buzzer, LED link, ground vias, and the via fan-out of the supply pads. |
| `finish_route.py` | Grid router that closes the connections the autorouter leaves open, including the ground and 3.3 V pads that are cut off from their pours. |
| `route_grid.py` | Its engine: obstacle raster, net connectivity, path search, conversion to tracks and vias. |
| `post_route.py` | After the routing: widens supply tracks and neck-downs, enlarges via pads, adds a ground via beside the via of every fast signal and stitching vias. With `--fix` it reads KiCad's design rule check and takes back whatever is part of a violation. |
| `check_overlap.py` | Reports overlapping part bodies. |
| `check_netlist.py` | Compares a netlist exported by KiCad with `design.py`. Lists the devices and addresses on each I2C bus and fails on an address clash. |
| `sexpr.py` | Small reader/writer for KiCad's file format. |

## Schematic drawing

Each sheet is drawn by a layout function, block by block. A block is a function of the circuit (the
USB input, the core converter, the NFC transmit path); its parts are placed by hand and joined by wires
that read from left to right, supplies point up and ground points down. Labels join blocks to each
other and carry buses (the RGB bus, RMII, SDIO, the flash bus); they are not used inside a block.

`sch_finish.finish()` closes what a layout leaves open: supply pins get a power symbol (pins next to
each other share one), other pins a short wire with a label, unused pins a no-connect flag, and a net
that is wired completely inside a block gets its name on one of its wires, so the schematic keeps the
net names of the circuit description. Then:

- `check()` raises when a wire, pin or label would join two nets. It treats as joined whatever KiCad
  might join (a pin or a wire end on another wire), so it is stricter than KiCad. Pins that a symbol
  joins inside the part (`jumper_pin_groups`, the USB ESD part's pass-through pins) count as joined.
- `lint()` reports text on text, text on a symbol or a wire, symbols on symbols and block frames on
  each other, from the size of KiCad's font. `build_sch.py` fails unless it reports nothing.

The netlist the schematic gives is checked against `design.py` pin by pin (`check-netlist`); that
check, not the drawing, decides that the circuit is right.

Symbols drawn in `make_lib.derived_symbols()` instead of taken as converted:

- named after the fitted part where the board used another part's symbol: AP63205WU-7 (was drawn as
  the AP63203), SN74LV1T125DBVR (74AHCT1G125), LIS2DH12TR (KiCad's LIS2DE12, same pins), DRV5032FADBZR
  (KiCad's DRV5033), ESP32-C6-MINI-1U-H4 (MINI-1-N4), PN5321A3HN; the TVS diodes use the unidirectional
  TVS symbol (`Diode:SMAJ5.0A`, `Diode:SMAJ58A`, `SMBJ26A` drawn after KiCad's SM6T);
- redrawn for reading: the USB-C receptacle and the USB ESD part (pin numbers no longer over the pin
  names; the ESD part's pass-through pins are a jumper group), the PoE module (input left), the RJ45 jack
  (pin names from the jack's function), the converters (input left, switch node right), the LED, the
  buzzer and the PN532 (host left, radio right, supplies up, grounds down).

## Requirements

- KiCad 10 (`kicad-cli` and the `pcbnew` Python module, with numpy and Pillow)
- Java 25 or newer and [Freerouting](https://github.com/freerouting/freerouting) 2.5.0 for the `route`
  target. Version 2.2.4 hangs on this board.
- Python 3 with [easyeda2kicad](https://github.com/uPesy/easyeda2kicad.py) for fetching parts

`pnpm nx run attractap-touch-p4-pcb:setup-toolchain` checks KiCad and downloads Freerouting into
`.tools/kicad`. `tools/kicad-env.sh` finds KiCad (PATH, macOS app bundle, or nixpkgs on NixOS) and
`tools/pcb.sh` holds the commands behind the targets.

## Steps

```bash
# 1. fetch the LCSC parts once (symbols, footprints) into a scratch folder, then build kicad/lib
easyeda2kicad --lcsc_id C54540373 C5736265 ... --full --output /tmp/lcsc/lcsc
pnpm nx run attractap-touch-p4-pcb:generate-library -- /tmp/lcsc

# 2. schematic from the circuit description, then ERC and the netlist check
pnpm nx run attractap-touch-p4-pcb:generate-schematic

# 3. board: parts, zones, fixed vias and routes; reports overlapping parts
pnpm nx run attractap-touch-p4-pcb:place

# 4. routing: autorouter (about 10 minutes), grid router for what it leaves open (it stops at 15 to 25
#    open connections on this board), zone fill, pour links and clean-up, DRC
pnpm nx run attractap-touch-p4-pcb:route
```

`route` runs these steps (`tools/pcb.sh`): `build_pcb.py dsn`, Freerouting, `build_pcb.py ses`,
`finish_route.py`, `build_pcb.py finish`, `finish_route.py --pours`, `build_pcb.py finish`,
`post_route.py`, `build_pcb.py finish`, `post_route.py --fix`, `build_pcb.py finish`, DRC.

The number of copper layers is `COPPER_LAYERS` in `geometry.py`: 6, or 4 for the first layout. Tracks run
on F.Cu, In2 and B.Cu in both; only the planes differ (see `board_setup.zones`).

The autorouter does not give the same result twice, so its result is kept in git:
`kicad/attractap-touch-p4.ses`. Everything after it is repeatable. To rebuild the committed board
from the committed files:

```bash
pnpm nx run attractap-touch-p4-pcb:place
pnpm nx run attractap-touch-p4-pcb:route-finish    # imports the .ses, finishes the routing, runs DRC
```

`route` replaces the `.ses` with a new autorouter result. Commit the new file together with the board
it led to.

### Changes after the autorouter ran

The committed `.ses` is older than the design review of November 2026, which moved parts, changed
nets and added parts. The rebuild copes with that without a new
autorouter run:

- The session file also records where every part was, and KiCad would move the parts back there on
  import. `build_pcb.py ses` imports the routes only.
- `build_pcb.py` has two lists, `STALE_NETS` and `STALE_PARTS`. The autorouter's tracks for the nets in
  the first are not taken over; they have fixed routes in `routes_board.py` now. Its tracks that come
  too close to a pad of a part in the second, or to a fixed via beside such a pad (the supply vias a
  new part gets go through every layer), are removed, and `finish_route.py` routes them again.

- Beyond those two lists, `build_pcb.py ses` removes every track and via of the autorouter that comes too
  close to a pad, a fixed via or a fixed track of another net (`drop_collisions`), measured against the real
  pad outlines. So a part can be moved or a fixed route changed without touching the lists. On a board that
  has not changed since the autorouter ran this removes nothing.
- The session calls its vias after the four layers the autorouter saw. On the six-layer board KiCad takes
  them for buried vias; the import makes them through vias again.

When the autorouter is run again, empty both lists.

Lessons from revision A, in case the generator is used again:

- A footprint's angle in KiCad is not always the angle JLCPCB wants: it counts from its own library
  footprint of the part number. `tools/pcb.sh check-footprints` compares the two for every part; the
  corrections are in `scripts/export_fab.py`.
- A ceramic capacitor's value on the parts list is its value at 0 V. Take the value at the working
  voltage from the maker's curve: the 10 uF / 50 V parts first fitted at the 24 V input had 1.35 uF
  there, and their large value at low voltage made the input overshoot when a supply was plugged in.
- A thermal via that comes with a converted footprint is a plated pad, not a via: checks that look at
  vias do not see it. The PN532's four had solder paste on them (`test_design.py` looks for that now).
- Through-hole parts stand out of the display side of the board. Keep them from behind the display
  where the mechanics allow. Where they do not (the Ethernet jack), keep 48 V pins beside the
  display's metal back and set the display distance for clipped pins (`test_design.py` checks both).

- Fixed routes must end on a pad or a via, use only horizontal, vertical and 45 degree segments, and
  meet other tracks at their end points. The autorouter gives up on a net that has a fixed track
  with an open end or an odd angle.
- Run one autorouter at a time. Two instances block each other.
- `finish_route.py` takes minutes to an hour. When two nets keep cutting each other in its log, that
  spot has too little room: look at it and fix the placement or add a fixed route (the fan-outs in
  `routes_mcu.py` came about that way). Running it again does not help.
- A supply fan-out via in front of a pad row can cost one escape track. `plane_fanout` runs last and
  has a short list of pads that are fed another way.

The autorouter writes its result only after the last pass of a run, so `route` puts a time limit
on it.
