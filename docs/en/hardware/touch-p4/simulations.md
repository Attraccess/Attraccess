# Simulations
<!-- llms-description: The field and circuit simulations run on the routed Touch P4 board, their key results, what they model and their limits. -->

The field and circuit simulations of the routed board: what each one models, the limit it checks, the
key results and what the models leave out. For hardware developers changing the layout or part values.

The scripts are in [`sim/`](https://github.com/Attraccess/Attraccess/tree/main/apps/attractap/hardware/touch-p4/sim).
They read the copper from the board file and the part values from the circuit description
(`scripts/bootstrap/`), so they follow the design: change a value or the layout, run them again. Two
field solvers were written for them (inductance and field of tracks and copper areas; impedance of a track
in the layer stack); circuits run in ngspice. Nothing here has been measured.

## Running

```bash
pnpm nx run attractap-touch-p4-pcb:simulate     # part of the check target
```

The report goes to the terminal and to `fab/reports/simulation.txt`. Every line marked `ok` or `FAIL`
compares a result with a limit from a datasheet or standard; the target fails if one is missed. It needs
KiCad 10 with its Python (numpy is the only package used) and [ngspice](https://ngspice.sourceforge.io/);
`tools/pcb.sh` takes ngspice from `NGSPICE`, the PATH or nixpkgs.

By hand:

```bash
. tools/kicad-env.sh
cd sim
kicad_python dump_board.py ../kicad/attractap-touch-p4.kicad_pcb /tmp/board.json
python3 run.py /tmp/board.json          # any Python with numpy
python3 test_solvers.py
```

`dump_board.py` writes the board as JSON (the only script that needs KiCad), `board.py` reads it,
`spice.py` runs ngspice, `run.py` runs everything. `spice.run('dc_hotplug.cir', vsup=26.4)` runs one deck
with other values for its `.param` lines; the decks also run as they are with `ngspice -b`.

## What is simulated

| Part of the report | Files | Model | Limits checked |
|---|---|---|---|
| Field solvers | `test_solvers.py` | Both solvers against closed-form results: a loop of track, the same inside a shorted ring and above a copper plate, a stripline | within 2 to 4 % |
| NFC loop | `nfc_loop.py`, `peec.py` | Inductance and resistance at 13.56 MHz from the antenna footprint, with eddy currents in the pours around it (all layers, one sheet); also on a metal wall and with metal across the gap in the copper around the loop | no copper closed round the loop on any layer, for any net or for ground, 5 V and 3.3 V together; no screw in the gap |
| NFC field | `nfc_loop.py`, `peec.py` | Field in front of the reader from the loop and its eddy currents, averaged over a 72 x 42 mm card held parallel, from the case outwards; on wood or stone and on metal | at most 7.5 A/m at a card on the case; 1.5 A/m (ISO/IEC 14443 minimum) at least 10 mm in front |
| NFC matching | `nfc_match.py`, `nfc_tx.cir` | Load between TX1 and TX2, transmitter current, receiver input voltage and loop current, on wood or stone and on metal. 20 000 boards with capacitors and filter inductors spread over 5 %, driver resistance 2 to 5 ohm, supply 2.7 to 3.4 V; one time-domain run with the bridge's square wave | transmitter 100 mA (150 mA limiting value), receiver input 4 Vpp, damping resistors 0.1 W |
| DC input | `dc_hotplug.cir` | A live supply plugged in through four cables: cable inductance, fuse, ceramic capacitors with their capacitance loss over voltage, filter inductor, TVS at the top of its breakdown range | converter input 40 V at 24 V supply |
| DC surge | `dc_surge.cir` | 1.2/50 us surge of +-1 kV behind 42 ohm (EN 50130-4, line to earth) across the DC input at 12 to 28 V: both TVS at the top of their range, C120 with low and high ESR, L103 unsaturated and saturated | converter input 40 V; D105 80 V reverse |
| Power-up | `powerup.cir` | USB plugged in: cable, fuse, eFuse U105 with its soft start, 5 V rail, both 3.3 V converters (behavioural), supervisor and reset, the Wi-Fi module's EN | reset low until the rail has been up 50 us; 5 V rail above 3.8 V; both 3.3 V rails above 3.2 V; the module starts after its rail |
| Changing supplies | `switchover.cir` | USB (eFuse), DC and PoE (ideal diodes) plugged in and pulled while the board runs at 0.9 A on +5V and 0.6 A at 3.3 V; reverse current into an unplugged source | +3V3 above the supervisor's 2.99 V, +3V3_WIFI above 3.0 V; VBUS below 0.8 V and DC converter output below 0.5 V when unplugged |
| Fast lines | `field2d.py`, `si.py` | Impedance and delay per signal layer from a 2D field solution; every fast line as transmission lines of its routed lengths with its series resistor, driven by a 1 ns edge behind 33 ohm (default drive) and 17 ohm (strongest), into a capacitance | overshoot 0.5 V, no swing back below 80 % at default drive |
| Controlled impedance | `field2d.py` | USB pair and Ethernet pairs as routed | within 10 % of 90 ohm (USB) and 100 ohm (Ethernet) |
| Wi-Fi link | `si.py` | What the board adds to the SDIO timing: clock and data delay, skew, round trip; the pull-ups; the reset pulse through R302 into C303 | clock and data within 0.5 ns, round trip 2 ns, pull-ups of 10 to 90 k on CMD and D0 to D3, reset low for 50 us |
| Supply tracks | `irdrop.py` | Each supply net routed as tracks as a network of track and via resistances, everything on at once | 0.2 V lost; outer tracks below the current for a 20 K rise (IPC-2221) |
| Supply impedance | `pdn.py` | Lumped model of the MCU's core and 3.3 V rails: each capacitor with its own inductance and that of its way to the pins | none: report only |
| PoE isolation | `isolation.py` | Copper of every layer around the 48 V side on a 0.05 mm raster; shortest way from 48 V copper to other copper along each layer and through the board. Module, capacitor and jack, which bridge the barrier by design, are left out | clearance for the peak of the 1500 V RMS test with a fifth to spare (IEC 60664-1); no way through the board shorter than along a layer |
| Heat | `thermal.py` | The board as a plate of 1 mm cells spreading heat through its copper and losing it through both faces (textbook figures for still air) to the display and front, the dock plate and the wall; typical use and everything on, for each supply. Estimate within 40 % | typical use in a 40 °C room: every part within its limit, display below 70 °C, DC fuse holding 1.5 times its current, board under the Wi-Fi module below 85 °C |
| Dock magnet | `dock.py` | The dock magnet's field at the hall switch: on the dock, off axis, weakest magnet and warm, and lifted off | twice the switch's highest threshold on the dock |

## Key results

Cross-checks against independent references:

| What | Model | Reference | Agreement |
|---|---|---|---|
| NFC loop in free air | 1.269 uH | Modified Wheeler 1.239 uH and current-sheet 1.313 uH (Mohan et al., IEEE JSSC 34(10), 1999, eqs. 1 and 2; typical error 2 to 3 %), loop taken as square | +2.4 % and -3.4 % |
| Single loop, loop in a shorted ring, loop over a plate | same solver | Neumann's double integral and closed forms | within 1.5 % |
| USB and Ethernet impedance | `field2d.py` | JLCPCB's impedance calculator, TI SNLA187 | within 1 ohm |
| Stripline between two planes | `field2d.py` | Cohn's closed form with thickness correction | 53.8 against 54.3 ohm |
| Heat, PoE, typical use | +30 K board mean | By hand: 3.4 W over 0.11 W/K | within 3 % |

Results on the routed board:

- **NFC**: 1.25 uH on the board, 1.20 uH on a metal wall; the open pours around the loop take 2 %. Metal
  across the gap (a screw or a supply track) would take it to 1.08 uH; no copper closes round the loop, for
  any net or for ground, 5 V and 3.3 V together. With the fitted matching: 41 mA and 1.9 Vpp at
  1.25 uH, 35 mA and 1.2 Vpp at 1.20 uH, no board in a hundred outside either limit. Field: 4.1 A/m at a
  card on the case, 3.3 A/m on a metal wall; it falls to 1.5 A/m 19 mm in front (15 mm on metal). The
  transmitter uses 41 of its 100 mA, so the matching has room for more range.
- **DC input**: 35 to 38 V at the converter for a live 24 V plug-in (38.1 V and 8.6 A in the TVS with 5 m
  of 1.5 mm2), 39.9 V from 26.4 V. C117 sees up to 43 V; it is a 100 V part.
- **Power-up from USB**: both 3.3 V rails up 5.0 ms after the plug; the 5 V rail runs at 4.82 V (good
  port) and 4.18 V (4.5 V behind 0.5 ohm). At the plug 3.8 A flow for microseconds into C101 (10 uF, USB
  2.0 7.2.4.1), then 47 mA while the eFuse ramps the rail at 0.91 V/ms. The reset ends 4.7 ms after the
  rails are up, with the supervisor's delay shortened to 2 ms in the model; the part holds 120 to 280 ms.
- **Changing supplies**: +5V stays at 4.06 V or above, +3V3 at 3.30 V, +3V3_WIFI at 3.29 V. Unplugged
  VBUS stays at 0 mV, the DC converter's output at 1 mV. The board's maximum (1.82 A) on USB alone at
  4.75 V turns the board off at the eFuse's undervoltage limit; the firmware's USB-only limit prevents it.
- **Fast lines**: tracks of 0.15 mm are 49 ohm on the outer layers, 46 ohm on In2 (5.7 and 7.0 ps/mm).
  Lines with a series resistor show no reflections. Lines without one (RMII transmit, SDIO data and
  command, 40 to 48 mm) overshoot 0.13 V at default drive, 0.6 to 0.8 V at the strongest; hence the
  drive-strength rule in [firmware port](hardware/touch-p4/firmware-port.md).
- **SDIO link**: all six lines 40.3 mm. Clock arrives after 0.59 ns, data after 0.41 to 0.42 ns (within
  0.18 ns); round trip 1.01 ns. With a module answering within the SD standard's 14 ns, the MCU keeps
  10.0 ns at 40 MHz and 5.0 ns at 50 MHz: the board does not limit this link.
- **Supply tracks**: 0.07 V lost at most (1.9 A on the 5 V rail, the 16 LEDs at full white). The USB input's 1.5 A runs
  through 13 mm of 0.62 mm inner track, more than the rule for a free inner track allows; it lies 0.1 mm
  from a plane that takes its 70 mW.
- **Supply impedance**: above 30 MHz the core rail looks like 1.1 nH (2.4 nH for one pin), a 3.3 V pin
  like 1.2 nH, about what the package adds per pin.
- **PoE isolation**: 2.01 mm along a layer and 2.02 mm through the board, at the jack's pin 10; 2.0 mm
  of air stands 3.0 kV peak (IEC 60664-1), the test reaches 2.1 kV. Inside parts and not in this figure:
  4.5 mm between C102's pads, the PoE module's own barrier, and 0.5 mm from jack pin 9 to the display's
  metal back, which the polyimide tape holds.
- **Heat** (rise over the room, estimate within 40 %):

  | Supply | Typical use | Board | Warmest spot | Display | Wi-Fi module: board under it, cavity | Everything on: board, LED ring, under Wi-Fi module, cavity |
  |---|---|---|---|---|---|---|
  | USB | 2.5 W | +23 K | +30 K | +18 K | +29 K, +17 K | +39 K, +50 K, +50 K, +29 K |
  | DC, 12 V | 2.9 W | +26 K | +35 K | +21 K | +32 K, +19 K | +47 K, +59 K, +56 K, +34 K |
  | PoE | 3.5 W | +31 K | +39 K | +24 K | +37 K, +23 K | +53 K, +63 K, +63 K, +39 K |

  In a 40 °C room on PoE: display 64 °C (limit 70 °C), air at the PoE module 71 °C (85 °C), air outside
  the Wi-Fi module 63 to 77 °C (85 °C), DC fuse holding 0.65 A against 0.28 A drawn. Everything on for a
  long time is beyond what the case can shed; the firmware limits the LEDs and watches the chip.
- **Dock magnet**: 22 mT at the switch (10.3 mm), still 16 mT with the weakest magnet, 4 mm off axis and
  40 K warmer; the switch needs 4.8 mT. Lifted off, it may switch after 9 mm and has switched by 33 mm.

## The Wi-Fi antenna

```bash
pnpm nx run attractap-touch-p4-pcb:simulate-antenna      # about three quarters of an hour
```

`wifi_antenna.py` is a full-wave FDTD model ([openEMS](https://www.openems.de/)) of the
ESP32-C5-MINI-1's PCB antenna on this board, at 2.4 and 5 GHz, with a pulse per band. The module's
dual-band antenna (fed through a diplexer) is not published, so the model uses a stand-in of the same size
and kind: an inverted-F with a long arm for 2.4 GHz and a short branch for 5 GHz, ground point on the
right. It is tuned on a small evaluation board to about 2.43 and 5.44 GHz, then put on this board
unchanged.

| Case | What is in the model |
|---|---|
| `reference` | the module at the edge of a 40 x 55 mm evaluation board, antenna out over the edge |
| `board` | this board at the module's place (`geometry.WIFI_MODULE`): its ground, the cut under the antenna, the copper keep-out |
| `display` | the same with the display's metal back 1.5 mm from the board, on its four ground pads |
| `in_case` | `display` in the printed case: front, top and side walls, dock plate |
| `metal_wall` | `in_case` with a metal wall 16.4 mm behind the component side |
| `faceplate` | `in_case` with a 0.8 mm aluminium face plate over the front (a window for the display) |
| `faceplate_window` | the same with the strip above the display open over the antenna and its keep-out |
| `p3_board`, `p3_in_case`, `p3_metal_wall` | the module at Espressif's recommended place, top right with the antenna over the edge (HDG 1.4.7, fig. 22 position 3, fig. 23), the case grown to keep the same wall distances |

It prints per case and band the resonance, match and bandwidth, and for three channels the share of the
power fed in that is radiated (in brackets: of the power accepted) and how much of it goes to the room
side. The differences between cases are the result; the absolute figures belong to the stand-in.

Key result: in the case with the display the stand-in radiates -3.0 to -4.1 dB of the power fed in at
2.4 GHz and -2.5 to -4.0 dB at 5 GHz, within 3 dB of position 3 in every channel. A closed aluminium face
plate costs up to 1.9 dB more at 2.4 GHz; with a window over the antenna it costs nothing. The full table
and its consequences are in the [design notes](hardware/touch-p4/design-notes.md#antenna).

The target is not part of `simulate` or `check`. It needs a Python with openEMS (`OPENEMS_PYTHON`; Debian
and Ubuntu package it as `python3-openems`) and no KiCad. It does not depend on the routed copper, only on
`geometry.py` and the dimensions at the top of the script.

## What the models leave out

- **The chips are simple.** No maker publishes IBIS or SPICE models for the ESP32-P4, the PN532 or the
  converters. Drivers are a ramp behind a resistance, receivers a capacitance, converters follow their
  datasheet's lockout and soft start. Figures are the datasheets' typical ones.
- **The NFC loop's own capacitance** (2.4 pF) is an estimate; each picofarad counts like 1 % of
  inductance. The DC terminal, the Ethernet plug and cable, a card or a phone in the field are not
  modelled; all of them lower the inductance.
- **Heat** is an estimate: surface figures are textbook values for still air, part losses are estimates,
  and a reader in the sun or over a radiator is not a 40 °C room.
- **NFC range** is the range of the field that powers a card, not whether the reader hears its answer.
- **Emissions and immunity**: nothing here stands in for an EMC test.
- Nothing here checks pin numbers, footprints, the display flex's reach, the second-source PN532's
  behaviour or the firmware.

A simulation does not replace the [bring-up plan](hardware/touch-p4/bring-up.md). It says where the first
board should land, so that a measurement that lands elsewhere stands out.
