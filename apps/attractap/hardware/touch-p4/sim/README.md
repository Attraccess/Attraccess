# Simulations of the Touch P4 board

Field and circuit simulations of the routed board. They read the copper out of
the board file and the part values out of the circuit description
(`scripts/bootstrap/`), so they follow the design: change a value or the
layout, run them again.

```bash
pnpm nx run attractap-touch-p4-pcb:simulate     # part of the check target
```

The report goes to the terminal and to `fab/reports/simulation.txt`. Every line
marked `ok` or `FAIL` compares a result with a limit from a datasheet; the
target fails if one is missed. What the results were on revision A, and what
they changed, is in the [design notes](../docs/design-notes.md#simulation).

Needs KiCad 10 with its Python (numpy is the only package used) and
[ngspice](https://ngspice.sourceforge.io/). `tools/pcb.sh` takes ngspice from
`NGSPICE`, the PATH or nixpkgs.

## What is simulated

| Part of the report | Files | Model | Limits checked |
|---|---|---|---|
| Field solvers | `test_solvers.py` | Both solvers against results known in closed form: a loop of track, the same inside a shorted ring and above a copper plate, a stripline. | within 2 to 4 % |
| NFC loop | `nfc_loop.py`, `peec.py` | Inductance and resistance of the loop at 13.56 MHz from the antenna footprint, with the eddy currents in the pours around it (all layers, meshed as one sheet). Also with a metal wall behind the reader and with metal across the gap in the copper around the loop. | no copper on the outer layers under the screw that stands in that gap |
| NFC field | `nfc_loop.py`, `peec.py` | Field strength in front of the reader, from the loop's current and the eddy currents it raises, averaged over the 72 x 42 mm of a card held parallel to the reader: for a card that lies on the case and outwards from there, on a wall of wood or stone and on a metal one. | at most 7.5 A/m at a card on the case; 1.5 A/m (what a card needs by ISO/IEC 14443) at least 10 mm in front of the case |
| NFC matching | `nfc_match.py`, `nfc_tx.cir` | Load between TX1 and TX2, transmitter supply current, voltage at the receiver input and loop current, for the loop on a wall of wood or stone and on a metal one. 20 000 boards with capacitors and filter inductors spread evenly over 5 %, driver resistance 2 to 5 ohm, transmitter supply 2.7 to 3.4 V. One run in the time domain with the bridge's square wave. | transmitter 100 mA (150 mA limiting value), receiver input 4 Vpp, damping resistors 0.1 W |
| DC input | `dc_hotplug.cir` | A live supply plugged in through four cables: cable inductance, fuse, the three ceramic capacitors with their loss of capacitance over voltage, filter inductor, TVS at the upper end of its breakdown range. | converter input 40 V at 24 V supply |
| Power-up | `powerup.cir` | USB plugged in: cable, fuse, ferrite, diode, the 5 V rail's capacitors, the 3.3 V converter with its lockout and soft start, the reset network. Behavioural converter. | reset low until the rail has been up for 50 us; 5 V rail above 3.8 V when running |
| Fast lines | `field2d.py`, `si.py` | Impedance and delay of a track on each signal layer from a 2D field solution of the layer stack. Then every fast line as transmission lines of its routed lengths with its series resistor, driven by a 1 ns edge behind 33 ohm (the MCU's default drive strength) and 17 ohm (the strongest), into a capacitance. | overshoot 0.5 V and no swing back below 80 % at the default strength |
| Wi-Fi link | `si.py` | What the board adds to the timing of the SDIO link between the MCU and the Wi-Fi module: delay of the clock and of every data line, the difference between them, the round trip. The pull-ups Espressif asks for, and the reset pulse through R302 into C303. | clock and data within 0.5 ns, round trip 2 ns, a pull-up of 10 to 90 k on CMD and D0 to D3, reset low for 50 us |
| Supply tracks | `irdrop.py` | Each supply net that is routed as tracks as a network of track and via resistances, with everything on at once. | 0.2 V lost; outer tracks below the current for a 20 K rise (IPC-2221) |
| Supply impedance | `pdn.py` | Lumped model of the MCU's core and 3.3 V rails: every capacitor with its own inductance and that of its way to the pins, from the distances on the board. | none: report only |
| PoE isolation | `isolation.py` | The copper of every layer around the 48 V side drawn into a raster of 0.05 mm. Shortest way from 48 V copper to any other copper along each layer, and through the board from each layer to every other. The pads of the three parts that bridge the barrier by design (module, capacitor, jack) are left out. | clearance in air for the peak of the 1500 V RMS test, with a fifth to spare (IEC 60664-1); no way through the board shorter than along a layer |
| Heat | `thermal.py` | The board as a plate of 1 mm cells that spreads heat through its copper (coverage of each layer from the filled zones) and loses it through both faces, by textbook figures for still air: to the display and out of the front, to the dock plate and the wall. Each part's loss where the part sits; the PoE module's and the display's into the air inside. Typical use and everything on, for each of the three supplies. An estimate within 40 %. | typical use in a room of 40 °C: every part inside its limit, display below 70 °C, the DC fuse holding 1.5 times its current |
| Dock magnet | `dock.py` | Field of the dock's magnet at the hall switch: on the dock, off its axis, with the weakest magnet and warm, and while the reader is lifted off. | twice the switch's highest threshold on the dock |

The Wi-Fi antenna has a simulation of its own, which is not part of `simulate`: see below.

`dump_board.py` writes the board as JSON (it is the one script that needs
KiCad), `board.py` reads it, `spice.py` runs ngspice, `run.py` runs everything.

## The Wi-Fi antenna

```bash
pnpm nx run attractap-touch-p4-pcb:simulate-antenna      # about a quarter of an hour
```

`wifi_antenna.py` is a full-wave model (FDTD, [openEMS](https://www.openems.de/)) of the Wi-Fi module's
antenna on this board. The module's antenna is a meandered inverted-F on the module's own board, and
its exact shape is not published. So the model uses a stand-in of the same size and kind, tunes it on a
small evaluation board, and then puts it on this board unchanged, in five cases:

| Case | What is in the model |
|---|---|
| `reference` | the module at the edge of an evaluation board of 40 x 55 mm, its antenna out over the edge |
| `board` | this board: its ground, the strip without copper beside the antenna, the cut under it |
| `display` | the same with the display's metal back 1.5 mm from the board, on its four ground pads |
| `display_floating` | the same without those four connections |
| `metal_wall` | `display` with a metal wall 16 mm behind the component side |

It prints the resonance, the match and the bandwidth of each case, and for the middle of the band how
much of the power fed in is radiated and how much of that goes to the display's side, where the room
is. What changes from case to case is the result; the absolute figures belong to the stand-in. The
target is not part of `simulate` or `check`: it needs a Python with openEMS (`OPENEMS_PYTHON`; Debian
and Ubuntu have it as `python3-openems`) and does not depend on the routed copper, only on the
dimensions at the top of the script.

## What the models leave out

- **The chips are simple.** No maker publishes an IBIS or SPICE model for the
  ESP32-P4, the PN532 or the converters. Drivers are a ramp behind a
  resistance, receivers a capacitance, converters follow their datasheet's
  lockout and soft start. The figures are the datasheets' typical ones.
- **The NFC loop's own capacitance** (2.4 pF) is an estimate, and each
  picofarad counts like 1 % of inductance. The DC terminal, the Ethernet plug
  and cable, a card or a phone in the field are not in the model; all of them
  lower the inductance.
- **Heat** is an estimate: the surface figures are textbook values for still
  air, the losses of the parts are estimates too, and a reader in the sun or
  over a radiator is not a room of 40 °C.
- **NFC range** is the range of the field that powers a card. Whether the
  reader hears the card's answer out there is not in the model.
- **Emissions** and immunity: nothing here stands in for an EMC test.
- Nothing here checks a pin number, a footprint or the firmware.

A simulation does not replace the bring-up plan. It says where the first board
should land, so that a measurement that lands elsewhere stands out.

## Running parts by hand

```bash
. tools/kicad-env.sh
cd sim
kicad_python dump_board.py ../kicad/attractap-touch-p4.kicad_pcb /tmp/board.json
python3 run.py /tmp/board.json          # any Python with numpy
python3 test_solvers.py
```

`spice.run('dc_hotplug.cir', vsup=26.4)` runs one deck with other values for
its `.param` lines; the decks also run as they are with `ngspice -b`.
