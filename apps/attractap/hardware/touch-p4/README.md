# Attractap Touch P4 (reader board, revision A)

Custom PCB for the Attractap touch reader. It replaces the Waveshare dev board
plus PN532 module of the current readers with one board.

> **Status: revision A design, not yet built.** Nobody has assembled or measured
> this board. Have an electronics engineer review it before ordering, and expect
> a bring-up round (see [docs/bring-up.md](docs/bring-up.md)). CE marking needs lab
> tests on the finished product (see [docs/compliance.md](docs/compliance.md)).

## What is on the board

| Function | Part | Notes |
|---|---|---|
| MCU | ESP32-P4NRW32X (chip, QFN-104) | 400 MHz dual core, 32 MB PSRAM in package, 16 MB flash |
| Wi-Fi 6 / Bluetooth LE | ESP32-C6-MINI-1-N4 module | radio co-processor, esp-hosted over SDIO; module has CE/RED certificates. PCB antenna, or an external antenna with the MINI-1U module on the same pads |
| Display | 4.0" 480x480 panel, ST7701S + GT911 | same panel type as today, 40-pin flex, RGB565 |
| NFC | PN532 + PCB loop antenna | same chip and I2C protocol as today |
| Ethernet (LAN version) | IP101GRI PHY + HY931147C jack | 10/100, RMII |
| PoE (LAN version) | DP9900M-5V isolated module | 802.3af; footprint also takes a Silvertel Ag9905M |
| Power | DC 12 to 24 V (barrel jack or WAGO lever terminal), PoE, or USB-C 5 V | each source feeds the 5 V rail through its own diode; 3.3 V buck AP63203. USB-C is the service port for flashing and debugging |
| Feedback | 8 RGB LEDs (SK6812MINI-E), buzzer | LEDs shine through the board above and below the NFC area |

Two assembly versions come from the same PCB:

- **wifi**: everything except the parts whose `Variant` field is `lan`.
- **lan**: all parts (Ethernet, PoE and Wi-Fi).

Either version can be built for an external Wi-Fi antenna: the ESP32-C6-MINI-1U (U.FL
connector, no PCB antenna) fits the pads of U301. Its part number is in the `Alt_MPN` and
`Alt_LCSC` fields of U301.

## Folder layout

```
kicad/                      KiCad 10 project. This is the source of truth.
  attractap-touch-p4.kicad_pro / .kicad_sch / .kicad_pcb
  attractap-touch-p4-<sheet>.kicad_sch    one sheet per function block
  lib/attractap.kicad_sym, lib/attractap.pretty/   project symbols and footprints
  sym-lib-table, fp-lib-table             register the project library
scripts/export_fab.py       Gerbers, drill, BOM and placement files for JLCPCB
scripts/bootstrap/          the generator that produced revision A (see below)
docs/                       design notes, pin map, bring-up plan, compliance checklist
```

### Schematic structure

The root sheet is a block diagram. Each block is one sheet:

| Sheet | Content |
|---|---|
| Power | USB-C input, DC input (jack and lever terminal) with its 5 V converter, PoE input, supply OR-ing, 3.3 V buck |
| MCU | ESP32-P4 GPIO and system units, flash, crystal, reset/boot, USB |
| MCU_Power | ESP32-P4 supply unit, decoupling, 1.1 V core converter |
| WiFi | ESP32-C6 module, SDIO |
| Ethernet | PHY, crystal, straps, jack (LAN version only) |
| NFC | PN532, supplies, matching network, antenna |
| Display | panel connector, RGB series resistors, backlight, IO expander |
| UI | LEDs, level shifter, buzzer |
| Mechanical | mounting holes, fiducials |

Inside a sheet the parts sit in framed, titled groups. Nets that stay on a sheet
use local labels. Nets that cross sheets use hierarchical labels and appear as
pins on the root sheet. `GND`, `+3V3` and `+5V` are power symbols.

## Working on the design

Open `kicad/attractap-touch-p4.kicad_pro` in KiCad 10 and edit there. After a
schematic change use *Tools > Update PCB from Schematic* as usual. The board's
net names already match what KiCad derives from the schematic.

The board is the Nx project `attractap-touch-p4-pcb`. Every operation is a target:

| Command | What it does |
|---|---|
| `pnpm nx run attractap-touch-p4-pcb:setup-toolchain` | Checks KiCad 10 and its Python, downloads the autorouter into `.tools/kicad`. Run once. |
| `pnpm nx run attractap-touch-p4-pcb:check` | All checks below. Run before ordering. |
| `pnpm nx run attractap-touch-p4-pcb:test` | Checks of the circuit description and of the I2C address check. Needs no KiCad. |
| `pnpm nx run attractap-touch-p4-pcb:erc` | Electrical rules check of the schematic. |
| `pnpm nx run attractap-touch-p4-pcb:check-netlist` | Schematic against the circuit description; devices and addresses on each I2C bus. |
| `pnpm nx run attractap-touch-p4-pcb:drc` | Design rules check of the board, including schematic parity. |
| `pnpm nx run attractap-touch-p4-pcb:build` | Manufacturing files into `fab/` (ignored by git). Runs `erc` and `drc` first. |
| `pnpm nx run attractap-touch-p4-pcb:render` | `fab/render-top.png` and `fab/render-bottom.png`. |

Reports go to `fab/reports/`. The targets find KiCad on the PATH, in the macOS app bundle or, on
NixOS, in nixpkgs; set `KICAD_CLI` and `KICAD_PYTHON` to use another installation. They run KiCad
with a configuration of their own under `.tools/kicad`, so they do not depend on your KiCad settings.
The targets `generate-library`, `generate-schematic`, `place` and `route` rebuild the project from
the circuit description and overwrite the KiCad files; see
[scripts/bootstrap/README.md](scripts/bootstrap/README.md).

`fab/gerbers/` goes to the PCB order (zip it). `fab/board-front.pdf` is the
assembly drawing with the reference designators (the silkscreen has none). `fab/wifi/` and `fab/lan/` each
hold `bom.csv`, `bom-external-antenna.csv` and `cpl.csv` in JLCPCB's format. Check part rotation in
JLCPCB's placement preview, in particular the diodes D101 to D107, C103, Q701
and the LEDs.

### Parts and library

Every fitted part carries its LCSC number in the `LCSC` field. Project symbols
and footprints for the larger parts were converted from LCSC/EasyEDA with
[easyeda2kicad](https://github.com/uPesy/easyeda2kicad.py); passives use the
standard KiCad libraries.

To add a part from LCSC:

```bash
easyeda2kicad --lcsc_id C12345 --full --output /tmp/new/part
```

then copy the symbol into `kicad/lib/attractap.kicad_sym` and the footprint into
`kicad/lib/attractap.pretty/` with KiCad's library editors.

### The bootstrap generator

Revision A was generated by the scripts in `scripts/bootstrap/` from one circuit
description (`design.py`): they wrote the schematic sheets, placed the parts,
added the fixed routes, ran the autorouter, closed the remaining connections with
a small grid router and checked the result. They are kept so the first revision
is reproducible. **Running them again overwrites the KiCad files**, so do not
run them once the project has been edited by hand. See
[scripts/bootstrap/README.md](scripts/bootstrap/README.md).

## Board facts

- 86 x 143.5 mm, 4 layers, 1.6 mm, all parts on one side (KiCad front = the side
  facing the wall). The display is taped to the other side; the NFC loop is on
  that side too.
- Layer use: F.Cu signals and parts, In1 ground plane, In2 3.3 V pour that
  also carries signal tracks (none under the MCU), B.Cu signals, core rail and
  antenna.
- Order with JLCPCB's JLC04161H-7628 stack-up, ENIG finish (0.35 mm pitch QFN),
  and Standard PCBA.

Further reading: [design notes](docs/design-notes.md),
[pin map and firmware port](docs/firmware-port.md),
[bring-up plan](docs/bring-up.md), [compliance checklist](docs/compliance.md).
