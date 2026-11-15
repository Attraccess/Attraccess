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
| `make_lib.py` | Builds `kicad/lib/` from LCSC/EasyEDA conversions, generates the NFC antenna footprint and the three-unit ESP32-P4 symbol. |
| `build_sch.py` | Writes the hierarchical schematic (root + one sheet per block). |
| `geometry.py` | Board outline, display position, slot, antenna and LED positions. |
| `placement.py` | Position and rotation of every part. |
| `build_pcb.py` | Builds the board (`place`), exports and imports the autorouter exchange files (`dsn`, `ses`), fills the zones (`finish`). |
| `board.py` | Paths, coordinate helpers and the `Board` wrapper around pcbnew that the builder modules share. |
| `board_setup.py` | Outline, labels, zones and keep-outs, design rules, net classes, project file. |
| `routes_mcu.py` | Fixed routes at the MCU: supply vias, the fan-out of all four sides, the flash, the display bus, and the NFC host signals at the PN532. |
| `routes_board.py` | Fixed routes elsewhere: 48 V nets, Ethernet pairs, antenna feeds, DC input, LED link, ground vias, and the via fan-out of the supply pads. |
| `finish_route.py` | Grid router that closes the connections the autorouter leaves open, including the ground and 3.3 V pads that are cut off from their pours. |
| `route_grid.py` | Its engine: obstacle raster, net connectivity, path search, conversion to tracks and vias. |
| `check_overlap.py` | Reports overlapping part bodies. |
| `check_netlist.py` | Compares a netlist exported by KiCad with `design.py`. Lists the devices and addresses on each I2C bus and fails on an address clash. |
| `sexpr.py` | Small reader/writer for KiCad's file format. |

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
`finish_route.py`, `build_pcb.py finish`, `finish_route.py --pours`, `build_pcb.py finish`, DRC.
The autorouter does not give the same result twice, so neither does `route`.

Lessons from revision A, in case the generator is used again:

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
