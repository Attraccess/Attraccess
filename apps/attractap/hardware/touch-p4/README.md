# Attractap Touch P4 (reader board, revision A)

Custom PCB for the Attractap touch reader. It replaces the Waveshare dev board
plus PN532 module of the current readers with one board.

> **Status: revision A design, not yet built.** Nobody has assembled or measured
> this board. It has been checked against the datasheets of its parts, against
> JLCPCB's manufacturing limits and against JLCPCB's part library; what that
> check found and changed, and what it could not settle, is in
> [docs/design-notes.md](docs/design-notes.md#design-review). Expect a bring-up
> round (see [docs/bring-up.md](docs/bring-up.md)). CE marking needs lab tests on
> the finished product (see [docs/compliance.md](docs/compliance.md)).

## What is on the board

| Function | Part | Notes |
|---|---|---|
| MCU | ESP32-P4NRW32X (chip, QFN-104) | 400 MHz dual core, 32 MB PSRAM in package, 16 MB flash |
| Wi-Fi 6 / Bluetooth LE | ESP32-C6-MINI-1-N4 module | radio co-processor, esp-hosted over SDIO; module has CE/RED certificates. PCB antenna, or an external antenna with the MINI-1U module on the same pads |
| Display | 4.0" 480x480 panel, ST7701S + GT911 | same panel type as today, 40-pin flex, RGB565 |
| NFC | PN532 + PCB loop antenna | same chip and I2C protocol as today |
| Ethernet (LAN version) | IP101GRI PHY + HY931147C jack | 10/100, RMII |
| PoE (LAN version) | DP9900M-5V isolated module | 802.3af; footprint also takes a Silvertel Ag9905M |
| Power | DC 12 to 24 V (barrel jack or WAGO push-button terminal), PoE, or USB-C 5 V | each source feeds the 5 V rail through its own diode; 3.3 V buck AP63203. The DC input has a filter towards the supply cable. USB-C is the service port for flashing and debugging |
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
case/                       3D-printable case: design, print files, installation manual (case/README.md)
```

### Schematic structure

The root sheet is a block diagram. Each block is one sheet:

| Sheet | Content |
|---|---|
| Power | USB-C input, DC input (jack and terminal) with its 5 V converter, PoE input, supply OR-ing, 3.3 V buck |
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
| `pnpm nx run attractap-touch-p4-pcb:check` | All checks below except `check-footprints`, and that `fab/jlcpcb/` matches the board. Run before ordering. |
| `pnpm nx run attractap-touch-p4-pcb:check-footprints` | Every footprint against JLCPCB's library footprint of its part number: do the pads fit, and is the angle in the placement file right. Needs the internet. Run it after a part number or a footprint has changed. |
| `pnpm nx run attractap-touch-p4-pcb:test` | Checks of the circuit description and of the I2C address check. Needs no KiCad. |
| `pnpm nx run attractap-touch-p4-pcb:erc` | Electrical rules check of the schematic. |
| `pnpm nx run attractap-touch-p4-pcb:check-netlist` | Schematic against the circuit description; devices and addresses on each I2C bus. |
| `pnpm nx run attractap-touch-p4-pcb:drc` | Design rules check of the board, including schematic parity. |
| `pnpm nx run attractap-touch-p4-pcb:build` | Manufacturing files into `fab/`, with the JLCPCB upload package in `fab/jlcpcb/`. Runs `erc` and `drc` first. |
| `pnpm nx run attractap-touch-p4-pcb:render` | `fab/render-top.png` and `fab/render-bottom.png`. |

Reports go to `fab/reports/`. The targets find KiCad on the PATH, in the macOS app bundle or, on
NixOS, in nixpkgs; set `KICAD_CLI` and `KICAD_PYTHON` to use another installation. They run KiCad
with a configuration of their own under `.tools/kicad`, so they do not depend on your KiCad settings.
The targets `generate-library`, `generate-schematic`, `place`, `route` and `route-finish` rebuild the
project from the circuit description and overwrite the KiCad files; see
[scripts/bootstrap/README.md](scripts/bootstrap/README.md). The autorouter's result
(`kicad/attractap-touch-p4.ses`) is committed, so `place` followed by `route-finish` gives the
committed board again.

### Ordering at JLCPCB

`build` writes the upload package to `fab/jlcpcb/`. That folder is in git, so the files of an order
can be found again; `check` fails when it does not match the board.

| File | Use |
|---|---|
| `attractap-touch-p4-gerbers.zip` | The PCB order: Gerber and drill files. |
| `bom-lan.csv`, `cpl-lan.csv` | Assembly of the Ethernet/PoE version: parts list and positions. |
| `bom-wifi.csv`, `cpl-wifi.csv` | Assembly of the Wi-Fi version. |
| `bom-*-external-antenna.csv` | The same parts lists with the Wi-Fi module that has an antenna connector. |

`fab/board-front.pdf` (not in git) is the assembly drawing with the reference designators; the
silkscreen has none.

What the board needs, for the order form:

| | |
|---|---|
| Board | 4 layers, 86 x 143.5 mm, 1.6 mm FR-4 |
| Smallest track and gap | 0.11 mm and 0.127 mm, 0.1 mm between the pads of the USB-C connector (JLCPCB's limit for four layers: 0.09 mm each) |
| Smallest via | 0.45 mm pad with 0.2 mm hole. JLCPCB charges extra only for vias smaller than that |
| Vias | covered with solder mask on both sides (tented) |
| Milled openings | flex slot 3 mm wide, eight LED windows 3.4 x 3.0 mm with relieved corners, a cut 14.2 x 5.65 mm in the top edge under the Wi-Fi antenna, two cut-away corners, plated slots at the DC jack and USB-C |
| Outline tolerance | the regular +/-0.2 mm is enough |
| Surface finish | ENIG is the safe choice for the 0.35 mm pitch MCU and the 0.5 mm display connector |
| Impedance control | not needed |
| Assembly | top side only: 198 parts in 68 lines (Wi-Fi version), 233 parts in 78 lines (Ethernet/PoE version) |
| Through-hole parts | DC jack J102, DC terminal J103 (two pins in a four-hole footprint, see below), and on the Ethernet/PoE version the jack J401 |
| Not assembled by JLCPCB | the display panel (taped on, flex plugged into J601) |

What the parts cost, what JLCPCB charges once per order, and which cheaper parts were considered:
[docs/design-notes.md](docs/design-notes.md#cost).

Check before paying:

- Stock. JLCPCB's parts list shows what it does not have. On 20 November 2026 it had no ESP32-P4
  (U201) and two pieces of the 3.3 V converter AP63203WU-7 (U103); both have to be ordered in
  through JLCPCB's parts sourcing before the assembly order. See the sourcing risks in
  [docs/design-notes.md](docs/design-notes.md).
- DC terminal J103. The WAGO 250-202 has two pins and the footprint four holes (it also takes the
  WAGO 2601-3102 lever terminal). Write in the order remark: pins in the upper left and the lower
  right hole, wire entry towards the board edge with the two cut-away corners. The fabrication
  drawing shows the body outline.
- Rotation. The placement files already carry JLCPCB's angle for the four parts where it differs
  from KiCad's (the PN532 U501, the level shifter U701, the transistor Q701 and the resistor arrays);
  `check-footprints` compares every part with JLCPCB's library. Still look at every polarised part
  in JLCPCB's placement preview, in particular the PoE module U102 (its pads are the same when it is
  turned by 180 degrees), the diodes D101 to D107, C103, the LEDs and the ICs.

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
- The Ethernet jack sits behind the lower right corner of the display, so that
  its plug and the cable's bend fit inside the case. Its pins stand out of the
  display side of the board there. Clip them to 1 mm and mount the display
  1.5 mm off the board (2 mm at most), see the
  [design notes](docs/design-notes.md#display-mounting-and-flex).

Further reading: [design notes](docs/design-notes.md),
[pin map and firmware port](docs/firmware-port.md),
[bring-up plan](docs/bring-up.md), [compliance checklist](docs/compliance.md),
[case and installation manual](case/README.md).
