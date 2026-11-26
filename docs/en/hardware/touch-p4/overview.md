# Attractap Touch P4
<!-- llms-description: The Attractap Touch P4 reader board (revision A, in development): what is on it, drawings and renders, how the KiCad project is generated and checked, and how to order it. -->

Custom PCB for the Attractap touch reader, revision A. It replaces the Waveshare dev board
plus PN532 module of the current readers with one board.

> **Status: revision A design, not yet built.** Nobody has assembled or measured
> this board. It has been checked against the datasheets of its parts, against
> JLCPCB's manufacturing limits and JLCPCB's part library, and against a set of
> layout rules, and its power input, NFC antenna and fast signals have been
> simulated from the routed copper; what those checks found and changed, and
> what they could not settle, is in
> [design notes](hardware/touch-p4/design-notes.md#design-review); the review targets
> it does not fully meet, each with its reason, are under
> [Accepted deviations](hardware/touch-p4/design-notes.md#accepted-deviations). Expect a bring-up
> round (see [bring-up plan](hardware/touch-p4/bring-up.md)). CE marking needs lab tests on
> the finished product (see [compliance checklist](hardware/touch-p4/compliance.md)).

## What is on the board

| Function | Part | Notes |
|---|---|---|
| MCU | ESP32-P4NRW32X (chip, QFN-104) | 400 MHz dual core, 32 MB PSRAM in package, 16 MB flash |
| Wi-Fi 6 (2.4 and 5 GHz) / Bluetooth LE | ESP32-C5-MINI-1-N4-V1.2 module | radio co-processor, esp-hosted over SDIO; module has an EU-type examination certificate. Its own PCB antenna for both bands, in the board's top left corner over a cut in the top edge; its own 3.3 V converter (TLV62569) |
| Display | 4.0" 480x480 panel, ST7701S + GT911 | same panel type as today, 40-pin flex, RGB565 |
| NFC | PN532 + PCB loop antenna | same chip and I2C protocol as today |
| Ethernet (LAN version) | IP101GRI PHY + HY931147C jack | 10/100, RMII |
| PoE (LAN version) | DP9900M-5V isolated module | 802.3af; footprint also takes a Silvertel Ag9905M |
| Power | DC 12 to 24 V (barrel jack or WAGO push-button terminal), PoE, or USB-C 5 V | each source feeds the 5 V rail through a switch that blocks reverse current: an eFuse (TPS259470A) for USB, ideal diodes (LM74700-Q1 with a MOSFET) for DC and PoE. 3.3 V buck TLV62569; a supervisor (TLV803S) holds the MCU in reset until 3.3 V is up. The DC input has a TVS at the connector, a damped filter towards the supply cable and stands 28 V at most. USB-C is the service port for flashing and debugging |
| Feedback | 8 RGB LEDs (SK6812MINI-E), buzzer | LEDs shine through the board above and below the NFC area |
| Tamper detection | LIS2DH12 accelerometer, VCNL4040 proximity sensor, DRV5032 hall switch | knocks, tilting, and the reader leaving its dock: the proximity sensor measures the infrared light the dock's plate reflects inside the closed case, the hall switch senses a magnet in the dock. Hardware only so far; the firmware does not read them yet |

Two assembly versions come from the same PCB:

- **wifi**: everything except the parts whose `Variant` field is `lan`.
- **lan**: all parts (Ethernet, PoE and Wi-Fi).

The Wi-Fi module (ESP32-C5-MINI-1) carries its own antenna, so there is no antenna to buy
or place. It stands in the board's top left corner rather than at the middle of the top
edge, where Espressif's guide puts it; the full-wave model keeps it within 3 dB of that
place in every channel. See "Wi-Fi antenna" in the
[design notes](hardware/touch-p4/design-notes.md#wi-fi-antenna), and its accepted deviation. On 5 GHz
the reader is for indoor use, and its firmware has to keep to the EU's channel and power
rules ([firmware-port.md](hardware/touch-p4/firmware-port.md), [compliance.md](hardware/touch-p4/compliance.md)).

## Drawings and renders

Written from the board by the `build` and `render` targets (see [Working on the design](#working-on-the-design)):

| Component side (faces the wall) | Display side |
| --- | --- |
| ![KiCad 3D render of the component side](../../../_media/hardware/touch-p4/board-top.png) | ![KiCad 3D render of the display side](../../../_media/hardware/touch-p4/board-bottom.png) |

- [Schematic](_media/hardware/touch-p4/schematic.pdf ':ignore') (PDF, every sheet)
- [Copper and silkscreen of the component side](_media/hardware/touch-p4/board-front.pdf ':ignore') and [of the display side](_media/hardware/touch-p4/board-back.pdf ':ignore') (PDF, 1:1, for the paper check in the [bring-up plan](hardware/touch-p4/bring-up.md#before-ordering))
- [Fabrication drawing](https://github.com/Attraccess/Attraccess/blob/main/apps/attractap/hardware/touch-p4/fab/jlcpcb/attractap-touch-p4-fab.pdf) and [assembly drawing](https://github.com/Attraccess/Attraccess/blob/main/apps/attractap/hardware/touch-p4/fab/jlcpcb/attractap-touch-p4-assembly.pdf) (PDF, part of the order package, see [Ordering at JLCPCB](#ordering-at-jlcpcb))
- [Installation manual](hardware/touch-p4/installation-manual.md) of the case, also as [PDF](_media/hardware/touch-p4/attractap-installation-manual-en.pdf ':ignore')

## Project folder

The design lives in [`apps/attractap/hardware/touch-p4/`](https://github.com/Attraccess/Attraccess/tree/main/apps/attractap/hardware/touch-p4/); this documentation and its images in `docs/en/hardware/touch-p4/` and `docs/_media/hardware/touch-p4/`.

```
kicad/                      KiCad 10 project, written by the generator: look, do not edit
  attractap-touch-p4.kicad_pro / .kicad_sch / .kicad_pcb
  attractap-touch-p4-<sheet>.kicad_sch    one sheet per function block
  lib/attractap.kicad_sym, lib/attractap.pretty/   project symbols and footprints
  sym-lib-table, fp-lib-table             register the project library
scripts/bootstrap/          the generator, the master of the schematic and the board (see below)
scripts/export_fab.py       Gerbers, drill, BOM and placement files for JLCPCB, drawings
sim/                        field and circuit simulations of the routed board
case/                       3D-printable case: design, print files, sources of the manual's figures
fab/jlcpcb/                 the JLCPCB upload package (in git)
```

### Schematic structure

The root sheet is a block diagram. Each block is one sheet:

| Sheet | Content |
|---|---|
| Power | USB-C input with its eFuse, DC input (jack and terminal) with its 5 V converter, PoE input, ideal diodes onto the 5 V rail, 3.3 V buck |
| MCU | ESP32-P4 GPIO and system units, flash, crystal, reset supervisor and buttons, boot, USB |
| MCU_Power | ESP32-P4 supply unit, decoupling, 1.1 V core converter |
| WiFi | ESP32-C5 module, its 3.3 V converter, SDIO pull-ups, reset and test points |
| Ethernet | PHY, crystal, straps, jack (LAN version only) |
| NFC | PN532, supplies, matching network, antenna |
| Display | panel connector, RGB series resistors, backlight, IO expander |
| UI | LEDs, level shifter, buzzer |
| Mechanical | mounting holes, fiducials |

Inside a sheet the parts sit in framed, titled blocks, one per function, drawn
as a circuit: wires inside a block, reading from left to right, supplies up and
ground down. Labels join the blocks and carry buses; nets that cross sheets use
hierarchical labels and appear as pins on the root sheet. `GND`, `+3V3` and
`+5V` are power symbols. Capacitors show their voltage and dielectric,
resistors their tolerance where it matters. Each sheet is on the smallest paper
that holds it (A4 or A3) and has the date and revision in its title block; the
root sheet has the revision history. How the sheets are drawn:
[board generator](hardware/touch-p4/board-generator.md#schematic-drawing).

## Working on the design

The circuit description and the generator in `scripts/bootstrap/` are the master;
the KiCad files are their output ([release](hardware/touch-p4/release.md), "Source of
truth"). Make every change there and regenerate: `generate-library` when a symbol
or footprint changes, `generate-schematic`, then `place` and `route-finish`, then
`check`. Open `kicad/attractap-touch-p4.kicad_pro` in KiCad 10 to look at the result
or to try something out, but do not commit an edit made in KiCad: `check-source`
fails when a KiCad file differs from what the generator wrote, or when the
generator changed after the files were written.

The board is the Nx project `attractap-touch-p4-pcb`. Every operation is a target:

| Command | What it does |
|---|---|
| `pnpm nx run attractap-touch-p4-pcb:setup-toolchain` | Checks KiCad 10 and its Python, downloads the autorouter into `.tools/kicad`. Run once. |
| `pnpm nx run attractap-touch-p4-pcb:check` | All checks below except `check-footprints`, and that `fab/jlcpcb/` matches the board. Run before ordering. |
| `pnpm nx run attractap-touch-p4-pcb:check-footprints` | Every footprint against JLCPCB's library footprint of its part number: do the pads fit, and is the angle in the placement file right. Needs the internet. Run it after a part number or a footprint has changed. |
| `pnpm nx run attractap-touch-p4-pcb:route-finish` | Rebuilds the routing from the committed autorouter result (after `place`): closes open connections, widens supply tracks, adds return and stitching vias, fills the zones, runs the design rule check. About five minutes; two runs give the same board. |
| `pnpm nx run attractap-touch-p4-pcb:test` | Checks of the circuit description and of the I2C address check. Needs no KiCad. |
| `pnpm nx run attractap-touch-p4-pcb:check-source` | The KiCad files are what the generator wrote, and the generator has not changed since (`scripts/check_source.py`; each generator step records a stamp in `kicad/generated-from.json`). Needs no KiCad. `python3 scripts/check_source.py --full` regenerates everything in a copy and compares (about 45 minutes, KiCad needed; before an order). |
| `pnpm nx run attractap-touch-p4-pcb:erc` | Electrical rules check of the schematic. |
| `pnpm nx run attractap-touch-p4-pcb:check-netlist` | Schematic against the circuit description; devices and addresses on each I2C bus. |
| `pnpm nx run attractap-touch-p4-pcb:drc` | Design rules check of the board, including schematic parity. |
| `pnpm nx run attractap-touch-p4-pcb:simulate` | Simulates the routed board and compares the results with the limits of the parts: NFC loop, matching and field, live plug-in at the DC input, power-up, reflections and timing on the fast lines, voltage drop on the supply tracks, PoE isolation distances, heat in the closed case, the dock magnet. Needs ngspice. See [simulations](hardware/touch-p4/simulations.md). |
| `pnpm nx run attractap-touch-p4-pcb:simulate-antenna` | Full-wave model of the Wi-Fi module's dual-band PCB antenna (a stand-in of the same size and kind) in its place on the board and at Espressif's position for comparison, with the display, in the case and with a metal wall behind the reader. Needs openEMS; not part of `check`. |
| `pnpm nx run attractap-touch-p4-pcb:build` | The JLCPCB upload package into `fab/jlcpcb/`, and the schematic and the two board plots (PDF) into `docs/_media/hardware/touch-p4/`. Runs `erc` and `drc` first. |
| `pnpm nx run attractap-touch-p4-pcb:render` | The two 3D renders above, `docs/_media/hardware/touch-p4/board-top.png` and `board-bottom.png`. |

Reports go to `fab/reports/`. The targets find KiCad on the PATH, in the macOS app bundle or, on
NixOS, in nixpkgs; set `KICAD_CLI` and `KICAD_PYTHON` to use another installation. `simulate` takes
ngspice from the PATH or from nixpkgs (`NGSPICE` names another one). They run KiCad
with a configuration of their own under `.tools/kicad`, so they do not depend on your KiCad settings.
The targets `generate-library`, `generate-schematic`, `place`, `route` and `route-finish` rebuild the
project from the circuit description and overwrite the KiCad files; see
[board generator](hardware/touch-p4/board-generator.md). The autorouter's result
(`kicad/attractap-touch-p4.ses`) is committed, so `place` followed by `route-finish` gives the
committed board again.

### Ordering at JLCPCB

`build` writes the upload package to `fab/jlcpcb/`. That folder is in git, so the files of an order
can be found again; `check` fails when it does not match the board.

| File | Use |
|---|---|
| `attractap-touch-p4-gerbers.zip` | The PCB order: Gerber and drill files. |
| `attractap-touch-p4-fab.pdf` | Fabrication drawing: outline and cut-outs with dimensions, stack-up, drill table, smallest features, fabrication notes (finish, IPC class, via filling). Attach it to the order. |
| `attractap-touch-p4-assembly.pdf` | Assembly drawing: every part of the component side with outline, pads, designator and value, pin 1 and polarity marked; an overview and detail sheets of the MCU, the PHY, the NFC chip and the power section. For assembly questions, inspection and repair. |
| `attractap-touch-p4.ipc` | IPC-D-356 netlist, for the fab's electrical test against the design. |
| `bom-lan.csv`, `cpl-lan.csv` | Assembly of the Ethernet/PoE version: parts list and positions. The parts list has manufacturer, part number, description, an approved alternate and the lifecycle of every line. |
| `bom-wifi.csv`, `cpl-wifi.csv` | Assembly of the Wi-Fi version. |
| `parts-list-lan.csv`, `parts-list-wifi.csv` | Everything to buy for one reader: the assembly parts list plus the parts JLCPCB does not fit (display panel). |

The silkscreen carries a designator wherever one fits beside its part (about half of them); the
assembly drawing has them all. What else the silkscreen carries is described in the
[design notes](hardware/touch-p4/design-notes.md#layout-rules-used). Plain plots of the copper and silkscreen layers are under
[Drawings and renders](#drawings-and-renders).

What the board needs, for the order form:

| | |
|---|---|
| Board | 6 layers, 86 x 143.5 mm, 1.6 mm FR-4 |
| Stack-up | JLC06161H-3313: set "Specify Stackup" to "Yes" in the order form and pick it (no charge). The board file carries the thicknesses the order form shows for it: prepreg 0.0994, core 0.55, prepreg 0.1088, core 0.55, prepreg 0.0994 mm |
| Smallest track and gap | 0.11 mm and 0.127 mm (JLCPCB's limit for boards with inner layers: 0.09 mm each). Two track segments are 0.112 mm wide, all others 0.126 mm or more. Pads of two nets stand 0.15 mm apart at the least (the MCU's pins), JLCPCB's figure; every margin is in the [design notes](hardware/touch-p4/design-notes.md#margins-to-jlcpcb39s-limits) |
| Smallest via | 0.45 mm pad with 0.2 mm hole (about one via in five; most have a 0.5 mm pad). No extra charge: by the order form's note on "Min via hole size/diameter", a 0.2 mm hole is free on boards with inner layers when the via is 0.45 mm wide or more. Leave that option at "0.3mm/(0.4/0.45mm)"; the smaller choices are for smaller pads and cost 39 USD and more |
| Vias | "Epoxy Filled & Capped", the order form's choice for six layers, at no charge. The form offers no solder mask cover ("Tented") for boards with inner layers. Required, not only free: four capacitor pads at the MCU (C208, C223, C226) have a via in the pad, and the rims of the twelve ground vias between the Wi-Fi module's ground pads touch the pads (Espressif's land pattern); the filling and the copper cap keep them from drawing in the solder. No other via lies under solder paste |
| Solder mask | green. The mask webs between the MCU's pins are 0.1 mm wide, JLCPCB's limit for green; other colours need wider webs |
| Milled openings | flex slot 3 mm wide, eight LED windows 3.4 x 3.0 mm with relieved corners, a cut 28.9 x 6.0 mm in the top edge under the Wi-Fi module's antenna, two cut-away corners, plated slots at the DC jack and USB-C |
| Outline tolerance | the regular +/-0.2 mm is enough |
| Surface finish | ENIG (18 USD on 5 boards, 45 USD on 100). Not the free OSP, which the form selects for six layers: it is as flat, but JLCPCB excludes it for contact areas, and the four ground pads for the display's metal back and the 30 test points would stay bare copper ([more](hardware/touch-p4/design-notes.md#cost)) |
| Impedance control | "Yes", +-10 % (the fab drawing's note): USB pair 90 ohm differential (0.14 mm lines, 0.15 mm gap, back layer over In4), Ethernet lines 50 ohm (0.155 mm, component side over In1). Widths from JLCPCB's calculator for this stack-up ([design notes](hardware/touch-p4/design-notes.md#impedance)); the fab may adjust them |
| Assembly | top side only: 221 parts in 85 lines (Wi-Fi version), 258 parts in 96 lines (Ethernet/PoE version) |
| Through-hole parts | DC jack J102, DC terminal J103 (two pins in a four-hole footprint, see below), and on the Ethernet/PoE version the jack J401 |
| Not assembled by JLCPCB | the display panel (taped on, flex plugged into J601) |
| Serial number on the board | option "Mark on PCB": number only, position specified. JLCPCB then prints a number that is different on every board into the white field beside `S/N` on the component side: a solid silkscreen rectangle of 10 x 2 mm, which is what it looks for. Without the option the field stays white, to write on. (JLCPCB no longer prints an order number; the text `JLCJLCJLCJLC` that used to mark its place is gone from the board.) |

What the parts cost, what JLCPCB charges once per order, and which cheaper parts were considered:
[design notes](hardware/touch-p4/design-notes.md#cost). Lifecycle, approved alternates and how to source the
parts JLCPCB does not stock: [parts](hardware/touch-p4/parts.md).

Check before paying:

- Stock. JLCPCB's parts list shows what it does not have. On 22 November 2026 it had no ESP32-P4
  (U201); it has to be ordered in through JLCPCB's parts sourcing before the assembly order. Of
  the PoE module (U102, Ethernet version) it had 38, ten fewer than two days before. The 3.3 V
  converter U103 is now the TLV62569 of the core converter (490416 in stock on 25 November 2026);
  the AP63203WU-7 fitted before had run out. See the sourcing risks in
  [design notes](hardware/touch-p4/design-notes.md).
- DC terminal J103. The WAGO 250-202 has two pins and the footprint four holes (it also takes the
  WAGO 2601-3102 lever terminal). Write in the order remark: pins in the upper left and the lower
  right hole, wire entry towards the board edge with the two cut-away corners. The fabrication
  drawing shows the body outline.
- Rotation. The placement files already carry JLCPCB's angle for the four parts where it differs
  from KiCad's (the PN532 U501, the level shifter U701, the transistor Q701 and the resistor arrays);
  `check-footprints` compares every part with JLCPCB's library, except the inductor L102, for whose
  part number the library has no footprint (two pads, no polarity). Still look at every polarised part
  in JLCPCB's placement preview, in particular the PoE module U102 (its pads are the same when it is
  turned by 180 degrees), the diodes D101, D103, D105 and D106 (D106, the TVS at the DC converter,
  has its cathode on the left, towards the board edge; D107 is bidirectional), the electrolytic
  capacitors C103 and C120, the MOSFETs Q101 and Q102, the LEDs and the ICs.

### Parts and library

Every fitted part carries its LCSC number in the `LCSC` field, its maker in
`Manufacturer`, its part number in `MPN`, and `BOM description`, `Alternate` and (for
ICs and modules) `Lifecycle` from `scripts/bootstrap/parts_info.py`; passives take
theirs from the table in `design.py`. Project symbols and footprints for the larger
parts were converted from LCSC/EasyEDA with
[easyeda2kicad](https://github.com/uPesy/easyeda2kicad.py); passives use the
standard KiCad libraries. Every footprint with a body has a 3D model in
`kicad/lib/attractap.3dshapes/` (gzip-compressed STEP, read by KiCad as it is): from
the JLCEDA/EasyEDA official library (easyeda.com, lceda.cn) for the converted
footprints, from KiCad's packages3D for the standard ones. Their placement is in
`scripts/bootstrap/lib_models.py`, which `scripts/bootstrap/collect_models.py` writes
(see the [board generator](hardware/touch-p4/board-generator.md)). The ESP32-C5 footprint carries the MINI-1 body, the
PN532 footprint the NXP part's body; the NFC antenna is copper only.

To add a part from LCSC, put it into the circuit description, fetch the
conversions of all the board's LCSC parts into one folder and rebuild the library
from them (the [board generator](hardware/touch-p4/board-generator.md#steps), "Steps"):

```bash
easyeda2kicad --lcsc_id C54540373 C5736265 ... C12345 --full --output /tmp/lcsc/lcsc
pnpm nx run attractap-touch-p4-pcb:generate-library -- /tmp/lcsc
```

then regenerate the schematic and the board.

### The generator

The scripts in `scripts/bootstrap/` build the whole project from one circuit
description (`design.py`): they write the library and the schematic sheets, place
the parts, add the fixed routes, import the autorouter's committed result, close
the remaining connections with a small grid router and check the result. They are
the master: **running them overwrites the KiCad files**, which is how every change
is made. See [board generator](hardware/touch-p4/board-generator.md).

## Board facts

- 86 x 143.5 mm, 6 layers, 1.6 mm, all parts on one side (KiCad front = the side
  facing the wall). The display is taped to the other side; the NFC loop is on
  that side too.
- Layer use: F.Cu signals and parts, In1 ground plane, In2 signals with ground
  filled in between, In3 3.3 V plane, In4 ground plane, B.Cu signals, core rail
  and antenna. Every signal layer lies next to a plane that no track cuts.
  Tracks run on F.Cu, In2 and B.Cu only.
- The first layout had four layers, with the 3.3 V pour sharing In2 with the
  signal tracks. `COPPER_LAYERS` in `scripts/bootstrap/geometry.py` builds that
  board again from the same routing; it costs 8 to 45 USD less per order and has the return-path
  weaknesses listed in the [design notes](hardware/touch-p4/design-notes.md#review-against-layout-rules).
- Order with JLCPCB's JLC06161H-3313 stack-up, ENIG finish (0.35 mm pitch QFN),
  and Standard PCBA.
- The Ethernet jack sits behind the lower right corner of the display, so that
  its plug and the cable's bend fit inside the case. Its pins stand out of the
  display side of the board there. Clip them to 1 mm and mount the display
  1.5 mm off the board (2 mm at most), see the
  [design notes](hardware/touch-p4/design-notes.md#display-mounting-and-flex).

Further reading: [design notes](hardware/touch-p4/design-notes.md),
[design review: grades, criteria and decisions](hardware/touch-p4/review.md),
[pin map and firmware port](hardware/touch-p4/firmware-port.md),
[bring-up plan](hardware/touch-p4/bring-up.md), [compliance checklist](hardware/touch-p4/compliance.md),
[case and installation manual](hardware/touch-p4/case.md).
