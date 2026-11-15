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

- KiCad 10 (`kicad-cli` and the `pcbnew` Python module)
- [Freerouting](https://github.com/freerouting/freerouting) 2.5.0 or newer (the jar from the releases page, run with
  `java -jar`). Version 2.2.4 hangs on this board.
- numpy and Pillow (both come with KiCad's Python)
- Python 3 with [easyeda2kicad](https://github.com/uPesy/easyeda2kicad.py) for fetching parts

On NixOS: `nix shell nixpkgs#kicad nixpkgs#freerouting`. Set `KICAD` to the
KiCad install prefix, `KICAD10_SYMBOL_DIR` and `KICAD10_FOOTPRINT_DIR` to the
standard libraries, and run the scripts with KiCad's Python packages on
`PYTHONPATH` (the `kicad` wrapper script shows the paths).

## Steps

```bash
# 1. fetch the LCSC parts once (symbols, footprints) into a scratch folder
easyeda2kicad --lcsc_id C54540373 C5736265 ... --full --output /tmp/lcsc/lcsc
python3 make_lib.py /tmp/lcsc              # -> kicad/lib, lib tables

# 2. schematic
python3 build_sch.py
kicad-cli sch erc --severity-all ../../kicad/attractap-touch-p4.kicad_sch
kicad-cli sch export netlist --format kicadsexpr -o /tmp/sch.net ../../kicad/attractap-touch-p4.kicad_sch
python3 check_netlist.py /tmp/sch.net

# 3. board
python3 build_pcb.py place                 # parts, zones, fixed vias and routes
python3 check_overlap.py
# 4. autorouter: repeat these three lines for one or two rounds (about 12 minutes each)
python3 build_pcb.py dsn                   # -> kicad/attractap-touch-p4.dsn
timeout 30m java -jar freerouting-2.5.0.jar -de attractap-touch-p4.dsn -do attractap-touch-p4.ses \
    --router.autorouter.max_passes=4 --router.fanout.enabled=false --router.optimizer.enabled=false \
    --router.automatic_neckdown=true --gui.enabled=false
python3 build_pcb.py ses                   # import the routes (locked tracks from step 3 stay)

# 5. close what the autorouter left open (it stops at 20 to 40 open connections on this board)
python3 finish_route.py                    # signals and small supply nets
python3 build_pcb.py finish                # fill the zones
python3 finish_route.py --pours            # ground and 3.3 V pads that are cut off from their pours
python3 build_pcb.py finish

# 6. check
kicad-cli pcb drc --severity-all --schematic-parity ../../kicad/attractap-touch-p4.kicad_pcb
```

Lessons from revision A, in case the generator is used again:

- Fixed routes must end on a pad or a via, use only horizontal, vertical and 45 degree segments, and
  meet other tracks at their end points. The autorouter gives up on a net that has a fixed track
  with an open end or an odd angle.
- Run one autorouter at a time. Two instances block each other.
- `finish_route.py` takes minutes to an hour. When two nets keep cutting each other in its log, that
  spot has too little room: look at it and fix the placement or add a fixed route in `build_pcb.py`
  (`flash_routes`, `nfc_host`, `uart_escape`, `lcd_fanout`, `mcu_top` and `mcu_left` came about that way). Running it again does not help.
- A supply fan-out via in front of a pad row can cost one escape track. `plane_fanout` runs last and
  has a short list of pads that are fed another way.

The autorouter writes its result only after the last pass of a run. Short
rounds with a time limit keep the result of every round.
