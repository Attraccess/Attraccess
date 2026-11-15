# Design notes

Why the board looks the way it does, and what is still an assumption.

## Decisions

| Topic | Decision | Reason |
|---|---|---|
| MCU | ESP32-P4NRW32X chip + ESP32-C6-MINI-1 | Chosen for display performance. The P4 has no radio, so Wi-Fi runs on a certified C6 module over SDIO. |
| Display | commodity 4.0" 480x480 RGB panel (ST7701S, GT911) | Size and resolution of today's readers; the MIPI versions of this size cost several times more. |
| NFC | PN532 on board | Keeps the firmware's NFC stack unchanged. |
| NFC position | separate zone below the display | The LCD's metal back shields 13.56 MHz; an antenna behind the screen does not work. |
| LAN/PoE | same PCB, parts not fitted on the wifi version | One design to maintain and certify. |
| PoE | ready-made isolated module | No transformer design; the footprint takes SDAPO DP9900M-5V or Silvertel Ag9905M. |
| Supply | DC 12 to 24 V, PoE or USB-C, each through its own Schottky diode onto one 5 V rail | Any combination may be connected; no source feeds another. |
| DC connectors | barrel jack (5.5 / 2.1 mm) and WAGO 2601 lever terminal in parallel | Plug-in supplies and bare wires from an existing installation both work. |
| USB-C | service port at the board edge next to the MCU | Only used for flashing and debugging, never offered to users. |
| Wi-Fi antenna | PCB antenna of the module, or external antenna | The ESP32-C6-MINI-1U (U.FL connector) fits the same pads. |
| Assembly | all parts on one side | The display is taped to the other side; cheaper assembly. |

Alternatives that were looked at (November 2026): ESP32-S31-WROOM-1 (one module
with Wi-Fi 6 and Ethernet MAC, but not yet in stock and only preview support in
ESP-IDF), Waveshare ESP32-P4 module (no radio certificates), ESP32-S3 (no speed
gain).

## Mechanics

Coordinates: KiCad top view of the component side, origin top-left of the
board, x right, y down, millimetres. The user looks at the other side.

| Item | Position |
|---|---|
| Board | 86 x 143.5, corner radius 2, both bottom corners cut away |
| Strip above the display | y 0 to 7: Wi-Fi antenna, two mounting holes |
| Display cover lens (84.3 x 84.3) | x 0.85 to 85.15, y 7.0 to 91.3 |
| LCD module (metal back) | x 5.6 to 80.4, y 12.8 to 89.4 |
| Flex slot | x 11.5 to 62.0, y 89.5 to 92.5 |
| Cut-away for the Ethernet plug | x above 69.5, y above 92.5 |
| Cut-away for the DC plug | x below 12, y above 107.5 |
| NFC loop | 35 x 37, centre (44.5, 117), on the display side |
| LEDs | x 29.5, 39.5, 49.5, 59.5 at y 95.6 and y 139.0, each in a 3.4 x 3.0 window |
| Mounting holes (3.2 mm) | (4, 3.5), (82, 3.5), (17.9, 139.4), (66.3, 117) |
| DC jack | x 1.2 to 10.2, y 93.6 to 108, opens downwards into the DC cut-away |
| DC lever terminal | centre (16.7, 100.2), next to the jack, wires enter from the back |
| USB-C | right board edge at y 13.5 to 22.5, opens sideways |

### Display mounting and flex

The panel drawing used is Hongxiangrui HXR040WQI-H401-R4018 (the same pinout as
the Waveshare ESP32-S3-Touch-LCD-4). Points that drive the layout:

- The flex leaves the bottom edge of the LCD module, 1.9 mm above the lens edge,
  and is 25 mm long measured from the lens edge. Its contacts face away from
  the glass and there is a steel-stiffened touch joint 3.7 mm from the module
  edge.
- The flex goes through the slot and folds onto the component side. For that
  fold the display has to sit at most about 1 mm in front of the board (thin
  double-sided tape).
- After the fold the contacts face the board, so J601 is a **bottom-contact**
  connector (Hirose FH12-40S-0.5SH) with its opening towards the slot.
- Seen from the component side, panel pin 1 is on the right. The connector's
  own pin 1 is on the left, so **connector pin k = panel pin 41 - k**. The
  schematic and the board already account for that.
- The folded flex covers the area x 11.5 to 62, y 76 to 89.5 and the tail up to
  the connector. No tall parts are placed there.

Not verified with a real panel: the exact fold length. The connector sits about
1.5 mm closer to the slot than the nominal flex end, so the flex bows slightly
instead of being stretched. Check with a sample panel before ordering boards.
Other panel suppliers with the same 40-pin pinout can differ in flex length.

Where to get the panel. The drawing comes from the datasheet that Makerfabs
publishes for its 4.0" display (maker: Shenzhen Hongxiangrui). The model number
on it is the maker's own and no shop lists the panel under it. It is a common
panel type: 84.3 x 84.3 mm outline, 40-pin 0.5 mm flex, pins 16 to 33 are the
18 data lines DB0 to DB17. The board uses 16 of them; pin 16 (blue LSB) and pin
28 (red LSB) are tied to ground. Shop listings checked in November 2026:

| Listing | What matches | Not confirmed |
|---|---|---|
| Elecrow DIS16804D, "4inch Square IPS Display 480*480 Capacitive SPI+RGB, ST7701S" | Outline, driver, and the printed 40-pin table is identical to the datasheet's. Comes with an HDMI driver board; the panel unplugs from it | Touch controller is not named |
| Waveshare / Luckfox LF40-480480-ARK (SKU 27738) | Outline (84.2 x 84.2 mm), GT911 touch | Pin table and driver are not published; ask before buying in volume |
| The panel on the Waveshare ESP32-S3-Touch-LCD-4 (the current readers) | Pinout (taken from that board's schematic) | Flex length against this layout |

Measure the flex of the panel you intend to buy in volume, not just any of
these.

LCSC had no panel of this type in November 2026. Its 4.0" 480 x 480 panel
(C17496207, Focus E40RC-FS1000-C) has the same driver and touch controller but
a MIPI DSI interface on a 20-pin flex and a 77 x 80 mm outline, so it does not
fit this board. The ESP32-P4 has a MIPI DSI port; using such a panel would be a
new display section, not a part swap.

### Enclosure hints

- Wi-Fi antenna: keep metal and the display away from the top 7 mm strip.
- Both bottom corners of the board are cut away. The Ethernet jack opens
  downwards into the larger one (16.5 x 51 mm), the DC jack into the smaller
  one in the other corner (12 x 36 mm). Plugs and cables stay inside the
  board outline there and can go down or straight back into the wall.
- The DC cut-away is sized for a straight 5.5 mm barrel plug up to 11 mm
  thick. Check it with the plug of the supply you plan to ship.
- The lever terminal sits next to the DC jack. Its wires enter at a right
  angle to the board: straight out of the wall, or up through the DC cut-away.
  `+` and `-` are printed at the terminal.
- There is no screw next to the DC jack. Support the board there in the
  housing, so that pushing the plug in does not bend it.
- USB-C is on the side edge behind the display. It needs no opening in the
  housing if flashing is done before assembly.
- External Wi-Fi antenna: the MINI-1U module has a U.FL connector on top.
  Plan a place for the antenna or a bulkhead connector and for the pigtail.
- No tracks run on the outer layers within 3.3 mm of a mounting hole centre,
  so a screw head or standoff up to 6.6 mm across is safe.
- Buzzer BZ701 fires sideways towards the nearest board edge: leave an opening.
- LEDs need a diffuser in front of the windows.
- Do not put metal (screws, plates, shielded cable) inside or right behind the
  NFC loop.

## Power

| Rail | Source | Loads |
|---|---|---|
| +5V | USB-C (PTC fuse, TVS, ferrite, Schottky), DC converter (Schottky) or PoE module (Schottky) | 3.3 V buck, backlight, LEDs, buzzer, PN532 |
| +5V_DC | AP63205 buck, 2 A, from the DC connectors (PTC fuse, reverse-polarity diode, TVS) | feeds +5V |
| +3V3 | AP63203 buck, 2 A | P4, C6, PHY, flash, panel logic |
| VDD_HP 1.1 V | TLV62569 controlled by the P4 | P4 core |
| P4 internal LDOs | VDDO_FLASH 3.3 V, VDDO_PSRAM 1.9 V | flash, in-package PSRAM |

Estimated consumption (not measured): about 2.5 W typical, 4.5 W peak with
backlight at full, Wi-Fi transmitting and all LEDs white. The PoE module gives
9 W, USB-C is fused at 2 A and the DC input at 1.1 A (about 0.45 A at 12 V and
0.2 A at 24 V at peak load).

Notes:

- After the OR diode the 5 V rail is about 4.6 V. That is intended: the LEDs'
  data threshold scales with their supply.
- Nothing but the TVS may sit across the PoE input. Extra capacitance there
  breaks the PoE detection signature.
- The PoE module needs a minimum load (100 mA DP9900M, 200 mA Ag9905M). With the
  backlight on the board draws more than that. A deep-sleep mode would need a
  dummy load.
- DC input: meant for 12 V or 24 V supplies. The jack is rated 24 V. The
  converter (AP63205) works up to 32 V and must never see more than 35 V, so
  the TVS is an SMAJ28A (it starts to conduct at 31 V). Reversed polarity does
  no harm (series diode D105).
- The DC converter, with fuse, diode and TVS, sits in the left column behind
  the display, right above the two DC connectors. A switching converter next
  to the NFC loop can cost read range, so it is not on the NFC part of the
  board.
- The firmware cannot tell which source powers the board. That was left out on
  purpose; a divider to a spare GPIO would add it.
- The core converter must be a TLV62569DBVR. Espressif lists the part numbers
  that work; converters with output discharge keep the P4 from waking up.

## PoE isolation

The 48 V side consists of jack pins 9 and 10, FB102, FB103, D103 and module
pins 5 to 8. It lives in the right-hand strip of the board. No ground or supply
copper is poured there, and the PoE net class keeps 2 mm from every other net.
C102 (1 nF, 2 kV) bridges the barrier for EMC, C410/R413 tie the jack shield to
ground.

The 2 mm figure is a design choice, not a certified creepage distance. The
jack itself has 2.3 mm between its PoE pins and its signal pins. A test lab
decides whether this is sufficient for the intended installation.

## NFC

- Loop: 4 turns, 35 x 37 mm, 0.5 mm track, 0.9 mm pitch, on the display side.
  The matching values below were calculated for a 40 x 37 mm loop (about
  1.35 uH with the display nearby); the 35 mm loop is roughly 10 % lower.
  One mounting screw sits about 3 mm beside the loop and the DC lever terminal
  6 mm, which shifts it further, so tuning on an assembled unit is required
  anyway.
- Damping: 1.5 ohm in each leg, giving a quality factor of about 27.
- EMC filter: 560 nH and 220 pF per side (corner at 14.3 MHz).
- Matching for 50 ohm at the transmitter: series 30.6 pF (27 pF fitted),
  parallel 173 pF (150 pF + 22 pF fitted).
- Receive path: 2.7 k, 1 nF, 1 k to VMID as in the NXP reference.

These are calculated starting values. The real inductance depends on the
display, the LED wiring and, on the lan version, the jack. Tune C513/C517,
C514/C515/C518/C519 and R504/R505 with a network analyser on an assembled unit
with the display fitted, then check the read range with the cards in use.

Copper around the loop is open at one place (a 2.5 mm gap in all layers on the
side towards the Ethernet cut-away). A closed ring of copper around the loop
would act as a shorted turn.

## Ethernet

Wiring follows the Espressif ESP32-P4-Function-EV-Board: IP101GRI with a 25 MHz
crystal, the PHY drives the 50 MHz RMII clock, PHY address 1. The transformer
centre taps go to ground through 100 nF (voltage-mode PHY, no termination
resistors).

The jack datasheet prints no + and - at the transformer pins. The polarity
follows from the winding dots in its schematic and the standard contacts of the
jack (1 TX+, 2 TX-, 3 RX+, 6 RX-): pin 1 is RD+, pin 2 RD-, pin 5 TD+, pin 6
TD-. At the PHY the positive pin of each pair leads to the outer of the two
tracks, at the jack it is the inner pin. The negative line of each pair
therefore changes to the back layer through one via and reaches its jack pin
there. (A swapped pair would still link: 10BASE-T receivers correct it and
100BASE-TX does not depend on polarity.)

## Layout rules used

| Class | Track | Clearance | Nets |
|---|---|---|---|
| Default | 0.15 | 0.127 | signals |
| Power | 0.25 | 0.127 | 3.3 V, core rail, small supply rails |
| Power5V | 0.6 | 0.15 | 5 V input path |
| DCIN | 0.6 | 0.25 | DC input up to the converter |
| PoE | 0.6 | 2.0 | 48 V side |
| NFC_RF | 0.3 | 0.127 | transmitter to antenna |
| USB | 0.25 | 0.127 | USB data |
| MDI | 0.2 | 0.127 | Ethernet pairs |

Minimum via 0.45 mm pad, 0.2 mm drill. The ESP32-P4 has 0.35 mm pin pitch with
0.15 mm pads.

Every P4 supply pin has a via just inside the pad row, straight down to the
3.3 V plane or to the core-rail copper on the back layer. Decoupling capacitors
connect to the same planes with their own vias.

Ground does not depend on the copper fill of the outer layers, which the
routing cuts into pieces. Every ground pad has a via into the ground plane or a
track to a pad that has one: the converters, the USB protection diodes, the
flash, the IO expander, the LED buffer and the connectors each have a via at
their ground pin, the Wi-Fi module has nine under it, the PoE module two at its
output ground pad, and the ground pins of the three QFN parts run straight into
their exposed pads.

Routed by hand (script) and locked:

- the 48 V nets and the Ethernet pairs,
- the PHY pins on its left and lower side,
- the antenna feeds,
- the DC input from the two connectors to the fuse,
- the 5 V bus of the top LED row, in the strip between the flex slot and the
  LED windows,
- the LED data link between the two LED rows, on the inner layer next to the
  mounting hole,
- at the MCU, on all four sides:
  - left: crystal, reset, VDD_BAT, the fan-outs of the NFC host signals, the
    SDIO lines and the buzzer, LED and Wi-Fi enable signals,
  - right: the flash signals, the flash supply (on the back layer, from the via
    of pin 30 to its capacitors, flash pin 8 and the chip-select pull-up), the
    USB PHY supply and the two USB pins,
  - top: a via for each Ethernet signal and for UART0 RX in a field above the
    pins, and core supply pin 54,
  - bottom: the 20 display signals to their series resistor arrays,
- the fan-out of the NFC host signals at the PN532,
- UART0 TX and the backlight PWM signal: each leaves through a via inside the
  MCU's pad ring and runs on the back layer.

The MCU has 0.35 mm pin pitch, and three of the four layers carry signals
there. The routers cannot solve the first two millimetres around it: a via in
front of a pad row costs the neighbouring pins their way out, and most groups
of pins fit in one arrangement only. So nearly every signal pin of the MCU
either has a complete fixed route or a fixed track to a via from which the
router can leave in any direction. (The exceptions are the four touch signals
in the lower left corner and two regulator outputs on the upper edge, which
have room.) Where neighbouring pins get vias, their tracks are first spread to
0.45 to 0.5 mm and the vias alternate between two rows. Fan-out vias that the
routers did not need were removed again at the end.

Everything else was routed by the autorouter (Freerouting) and, where it gave
up, by the grid router in `scripts/bootstrap/finish_route.py`.

Two layers are not enough to get all signals away from the MCU, so layer 3
(the 3.3 V pour) also carries signal tracks. Under the MCU it has none: the
supply pins there reach the pour through vias inside the pad ring.

The pour has a strip that runs down to the NFC parts left of the antenna, but
signal tracks on that layer cut it off from the rest. The NFC block therefore
gets its 3.3 V through a routed track (0.2 mm wide, about 60 mm long). It only
feeds the PN532's interface supply pin and the two I2C pull-ups, a few
milliamps.

Placement around the MCU follows from the routing. The signals on its left
side need a free strip, so only two capacitors sit next to those pins (in the
gaps of unused pins); the other 3.3 V capacitors of that side are 10 to 18 mm
away and rely on the vias into the planes. The regulator capacitors above the
MCU sit 2.4 mm from the pad row for the same reason.

Track width: 0.15 mm for signals. The autorouter narrows tracks to 0.112 mm
next to fine-pitch pins, so the board's minimum is set to 0.11 mm (the
manufacturer's limit is 0.09 mm).

Not done in revision A: controlled-impedance routing. USB runs at full speed
(12 Mbit/s) and the Ethernet pairs are about 10 mm long and run side by side,
so this is uncritical. Their width and gap (0.2 / 0.2 mm) are not calculated
for 100 ohm.

Lengths of the fast buses on the routed board: the six SDIO lines to the Wi-Fi
module are 39 to 47 mm, the RMII lines to the PHY 35 to 51 mm with two to four
vias each. Both are well inside what these interfaces tolerate.

RMII_TXD1 is GPIO35, which is also the boot-mode pin. The BOOT button and its
test point are about 70 mm away. They hang behind a 1 kohm resistor (R217) that
sits at the line, next to the strap resistor, so the 50 MHz line has no long
open branch. With the button pressed the pin sees 0.3 V.

The silkscreen carries only functional labels (test points, buttons, polarity
marks). Reference designators are on the assembly drawing layer
(`fab/board-front.pdf`): on a board this dense they would overlap.

## Sourcing risks

| Part | Risk |
|---|---|
| ESP32-P4NRW32X | LCSC showed no stock in November 2026. Use the X part (silicon v3.x); the part without X is end of life. |
| PN532 | About 13 USD at LCSC; NXP steers new designs to the PN7160. A clone (Tokmas, C53457895) exists but is untested. |
| DP9900M-5V | Low stock at LCSC; Silvertel Ag9905M fits the same footprint. |
| Display panel | Commodity part without a guaranteed part number. Agree on a fixed type with the supplier. |
