# Design notes
<!-- llms-description: Why the Touch P4 board is designed as it is: parts, power, layout, antennas, simulations, the design review and the accepted deviations. -->

Why the board looks the way it does, and what is still an assumption.

## Decisions

| Topic | Decision | Reason |
|---|---|---|
| MCU | ESP32-P4NRW32X chip + ESP32-C5-MINI-1 | Chosen for display performance. The P4 has no radio, so Wi-Fi (2.4 and 5 GHz) runs on a certified C5 module over SDIO; see "Wi-Fi module: ESP32-C5-MINI-1". |
| Display | commodity 4.0" 480x480 RGB panel (ST7701S, GT911) | Size and resolution of today's readers; the MIPI versions of this size cost several times more. |
| NFC | PN532 on board | Keeps the firmware's NFC stack unchanged. |
| NFC position | separate zone below the display | The LCD's metal back shields 13.56 MHz; an antenna behind the screen does not work. |
| LAN/PoE | same PCB, parts not fitted on the wifi version | One design to maintain and certify. |
| PoE | ready-made isolated module | No transformer design; the footprint takes SDAPO DP9900M-5V or Silvertel Ag9905M. |
| Supply | DC 12 to 24 V, PoE or USB-C, each through a switch that blocks reverse current (eFuse for USB, ideal diodes for DC and PoE) onto one 5 V rail | Any combination may be connected; no source feeds another. The switches drop almost nothing, so the 5 V rail follows its source. |
| DC connectors | barrel jack (5.5 / 2.1 mm) and WAGO 250 push-button terminal in parallel | Plug-in supplies and bare wires from an existing installation both work. The terminal footprint also takes the WAGO 2601 lever terminal, which costs 13 times as much. |
| Ethernet jack | behind the lower right corner of the display, 51 mm above the lower board edge | A plug with its boot and the cable's bend into the wall need 49 mm below the jack, inside the case. The price: the jack's pins stand out of the display side behind the display. The display sits 1.5 to 2 mm off the board and the pins are clipped (see "Display mounting and flex"). Below the display the jack would need a case 19 mm longer. |
| USB-C | service port at the board edge next to the MCU | Only used for flashing and debugging, never offered to users. |
| Tamper detection | an accelerometer, an infrared proximity sensor that looks at the dock's plate, and a hall switch facing a magnet in the dock | The accelerometer notices knocks, tilting and tearing off. The proximity sensor says that the reader has left its dock, and its light path lies inside the closed case, out of reach. The hall switch says the same in a second, simpler way, but a magnet held to the case fools it. All three are read over I2C, because the MCU's four free pins are blocked by capacitors at the pad row. |
| Wi-Fi antenna | the module's own dual-band PCB antenna, over a cut in the top edge | Decided on 25 November 2026 with the C5 (the user). The external antennas of the C6-MINI-1U and their bay are gone. See "Wi-Fi antenna" and its accepted deviation. |
| Assembly | all parts on one side | The display is taped to the other side; cheaper assembly. |
| Layers | six: signals on both outer layers and one inner layer, each next to a plane of its own | Two signal layers are not enough around the MCU. On four layers the third one shared its layer with the 3.3 V pour and cut it apart, so the fast buses had no unbroken plane to return on (see [Review against layout rules](#review-against-layout-rules)). |

Alternatives that were looked at (November 2026): ESP32-S31-WROOM-1 (one module
with Wi-Fi 6 and Ethernet MAC, but not yet in stock and only preview support in
ESP-IDF), Waveshare ESP32-P4 module (no radio certificates), ESP32-S3 (no speed
gain).

### Wi-Fi module: ESP32-C5-MINI-1

Decided by the user on 25 November 2026: the ESP32-C5 instead of the C6, for
Wi-Fi 6 on 2.4 and 5 GHz, with the module's own PCB antenna. The user's rule:
at most about 2 USD more per board at 100 pieces than the C6 module with its
antenna, and stocked. The first choice was the larger ESP32-C5-WROOM-1; it
was dropped the same day because no variant of it was in stock (below), and
the user chose the ESP32-C5-MINI-1-N4-V1.2.

| | ESP32-C5-MINI-1-N4-V1.2 (fitted) | ESP32-C5-WROOM-1 (first choice) | ESP32-C6-MINI-1U-H4 (before) |
|---|---|---|---|
| JLCPCB / LCSC | C54951860: 614 in stock, 3.36 USD at 100 (LCSC 3.38) | every variant (-N4, -N4-V1.2, -N8R8, -N8R8-V1.2, -N16R4, -N16R8, -N16R8-V1.2) 0 at JLCPCB and LCSC; -N4 3.65 USD at 200 | C20627095: 3248 in stock, 3.20 USD at 100, plus an antenna and its cable |
| Size | 15.4 x 21.3 x 2.4 mm | 18.0 x 27.5 x 3.3 mm | 13.2 x 12.5 mm (16.6 with antenna) |
| Antenna | PCB antenna, 2.4 and 5 GHz | PCB antenna | none: connector |
| EU-type examination certificate | 44024-05-2026-260268, Eurofins (notified body 0980), 27 May 2026, model ESP32-C5-MINI-1 with its internal antenna; EN 300 328 V2.2.2, EN 301 893 V2.2.1, EN 301 489-1 V2.2.3, EN 301 489-17 V3.3.1, EN 55032, EN 62368-1, EN 50665, EN 62311 | SN25C0185, Sporton (2907), 2 July 2025; EN 301 893 V2.1.1, EN 300 440 V2.2.1 | SN24C0053, Sporton (2907) |
| FCC | 2AC7Z-ESPC5MINI1 (part 15E granted 28 May 2026, single modular) | 2AC7Z-ESPC5WROOM1 | 2AC7Z-ESPC6MINIU |
| Rated | -40 to 85 °C ambient, "the environment immediately outside the Espressif module" (datasheet v1.4, table 1-1 note 3, table 6-2) | the same | -40 to 105 °C |

Stock and prices were read from JLCPCB's parts library and LCSC's product
pages on 25 November 2026. The module costs 0.16 USD more than the C6 module,
and the antenna, which was never priced (the certified one had to be quoted
by Espressif or Deman), and its cable are no longer needed. The radio's own
3.3 V converter (below) adds about 0.22 USD of parts that are already on the
board, so no new lines in the parts list. In all, about 0.4 USD more on the
assembled board and the antenna less: inside the user's 2 USD.

Why this variant:

- 4 MB flash and no PSRAM: esp-hosted's own partition table for a 4 MB
  co-processor holds two 1.75 MB images for updates over SDIO
  (`partitions_eh_cp_ota_4m.csv`, esp-hosted-mcu 3.1.0); the co-processor
  needs no PSRAM. The -N8R2 (8 MB, 2 MB PSRAM) is not at JLCPCB.
- The chip inside is the ESP32-C5HF4, revision v1.0 or v1.2 (chip datasheet
  v1.5, table 1-1). The SDIO slave works from revision v1.0 on, "not supported
  by chip revision v0.0 and v0.1" (module datasheet v1.4, 5.2.1.13).

esp-hosted: esp-hosted-mcu 3.1.0 (ESP-IDF 5.5 or later) lists the ESP32-C5
as an SDIO co-processor and the ESP32-P4 as its host, on the C5's fixed pins
CLK 9, CMD 10, D0 8, D1 7, D2 14, D3 13, reset into its EN, with "external
51 kOhm pull-ups on CMD, DAT0-DAT3" ([getting started](https://github.com/espressif/esp-hosted-mcu/blob/v3.1.0/docs/getting-started-mcu.md#1-sdio),
co-processor connections). Those are module pins 21, 22, 20, 19, 24 and 23,
all on the module's lower edge, the side that faces the MCU.

Strapping pins (module datasheet v1.4, chapter 4; HDG 1.3.9):

| Pin | Strap | Default | Here |
|---|---|---|---|
| GPIO28 (pin 4) | boot mode: 1 = boot from flash; 0 with GPIO27 = 1 = download over UART0 | internal pull-up | 10 k pull-up, as the HDG recommends ("place a pull-up resistor at the GPIO28 pin"; no capacitor fitted). The boot test point: held to ground at reset for the first flashing |
| GPIO27 (pin 35) | boot mode, ROM messages on UART0 | internal pull-up | open: nothing may pull it low |
| GPIO26 (pin 34) | boot mode (only with GPIO27 and GPIO28 low) | floating | open |
| GPIO25 (pin 33), MTDI = GPIO3 (pin 7) | SDIO sampling and driving edges at reset | floating | open, as the C6's were. The slave driver sets the edges in its configuration (ESP-IDF `sdio_slave_config_t.timing`); esp-hosted's `EH_TRANSPORT_CP_SDIO_TIMING` defaults to sending and sampling on the rising edge. Stay with that default |
| GPIO7 (pin 19) = SDIO D1 | JTAG source, only once the eFuse JTAG_SEL_ENABLE is burnt | no pull (the pin needs a defined level) | the 51 k SDIO pull-up holds it high. Firmware rule: never burn JTAG_SEL_ENABLE |
| MTMS = GPIO2 (pin 6) | listed as a strapping pin, floating | floating | open |

The straps are read in the 3 ms after EN rises (tH). The P4 drives none of
these pins then: at power-up it is held in reset for 120 to 280 ms after the
3.3 V rail, and later esp-hosted resets the module before it starts the SDIO
host, whose data lines are inputs outside a transfer.

SDIO D2 and D3 are the C5's USB D+ and D- (GPIO14, GPIO13). With 4-bit SDIO
on them its USB Serial/JTAG cannot be used, so UART0 (TX0 pin 39 = GPIO11,
which has 499 ohm in series inside the module, RX0 pin 40 = GPIO12), GPIO28,
EN and ground on test points are the only wired way to flash and recover the
module. They get net labels on the silkscreen; the C6_* nets become C5_*.

Power. The C5-MINI-1 draws 426 mA at most (802.11a at 16.5 dBm, 100 % duty;
338 mA at 2.4 GHz; datasheet v1.4, tables 6-4 and 6-5), and Espressif asks
the supply for "no less than 600 mA" (HDG 1.3.2; datasheet table 6-2:
IVDD 0.6 A). With 0.6 A in place of the C6's 0.382 A the shared 3.3 V
converter would carry 1.49 A at the sizing figures, 25.6 % below its 2 A,
short of the 30 % target. The module also carries its own capacitors on its
3.3 V pin (datasheet figure 8-1): three of 10 uF (C6, C21, C29), three of
1 uF (C19, C20, C26), four of 100 nF and one of 10 nF, 33.4 uF at their
values, all of it on the rail of the converter that feeds the module. The
3.3 V rail already counts 48.9 uF against the 52.8 uF that TI's table allows
the TLV62569 (see "3.3 V converter"). So the module gets a converter of its
own: a second TLV62569 from the 5 V rail, with the same inductor, divider and
feed-forward capacitor as U103, and Espressif's 22 uF and 100 nF at the
module's pin (datasheet figure 9-1). On that rail: 22 uF (13.7 uF at 3.3 V)
+ 0.1 uF + the module's 33.4 uF = 47.2 uF, inside 52.8 uF without derating
the module's capacitors. U103 then carries 0.89 A at the sizing figures
(55 % headroom) and the radio's converter 0.6 A (70 %).

Heat. What the 85 °C rating limits is the air right outside the module, not
its inside, so the old figure of 79 °C (40 °C room + the board under the C6 +
15 K/W x 0.30 W, the module's inside) cannot be held against it. The heat
model (`sim/thermal.py`) has no air node. It gives two bounds for that air:
below, the air in the cavity between board and dock plate, taken as the mean
of the board and the dock plate's inner face (that face runs at 0.47 times the
board's rise in the model's chain of surfaces); above, the board beside the
module, from which the module and its neighbours warm the air next to it. The
C5's losses: 0.40 W in typical use (connected, receiving at 5 GHz, 110 mA,
with little sending), 0.88 W at half the time sending at 5 GHz, 1.36 W
sending all the time (1.41 W in, 45 mW radiated); in between in proportion to
the share of time it sends. On the routed board (25 November 2026), in a room
of 40 °C, the air outside the module lies between:

| Rest of the board | Module sends | USB | DC, 12 V | PoE |
|---|---|---|---|---|
| typical use | rarely (0.40 W) | 57 to 67 °C | 59 to 70 °C | 63 to 75 °C |
| typical use | 40 % of the time (0.78 W) | 59 to 76 °C | 62 to 79 °C | 65 to 84 °C |
| typical use | 50 % (0.88 W) | 60 to 78 °C | 62 to 81 °C | 66 to 86 °C |
| typical use | all the time (1.36 W) | 63 to 89 °C | 65 to 92 °C | 69 to 97 °C |
| everything on for a long time | rarely | 66 to 79 °C | 72 to 85 °C | 76 to 91 °C |
| everything on for a long time | 40 % | 69 to 87 °C | 74 to 93 °C | 78 to 100 °C |

In typical use the module's air stays below 85 °C at the upper bound as long
as the module sends no more than 40 % of the time on average (PoE: 84 °C);
the lower bound stays below 85 °C even when it sends all the time. So the
firmware limits the module's transmit share to 40 %, averaged over a minute
([firmware-port.md](hardware/touch-p4/firmware-port.md)). The reader's own traffic (card
checks, the user interface, updates, which are downloads) stays far below
that; the rule bites only on long uploads, such as logs. With everything on
for a long time the upper bound reaches 85 °C on DC and passes it on PoE
(91 °C) with the radio silent: the board itself is then 43 to 49 K above the
room. That state is
beyond what the case can shed anyway (the LED rows 75 to 82 K above the
room, see "Simulation") and is ended by the firmware's temperature rule,
which dims backlight and LEDs and then also holds the radio back. The
estimate is +-40 %; the bring-up plan measures the air beside the module in
the closed case. The module's inside, for reference: 81 °C in typical use on
PoE (15 K/W x 0.40 W above the board under it).

Placement. The MINI-1 is 2.2 mm wider and 4.7 mm longer than the C6-MINI-1U
footprint. It sits in the old place at the top left, its antenna over a cut
in the top edge, now 28.9 mm wide and 6.0 mm deep. Espressif's guide
(HDG 1.4.7, figures 22 and 23) recommends a board corner with the antenna's
ground point at the board edge, the antenna beyond the edge or over a cut on
both sides and below it, and 15 mm of free space round it inside the housing.
On this board the corner that fits that orientation is the top right one,
where USB-C, its eFuse path and a mounting hole sit; the case leaves 1.5 to
2.3 mm to its walls. The full-wave model compares the two places at 2.4 and
5 GHz ("Wi-Fi antenna"); what stays short is recorded under "Accepted
deviations".

## Mechanics

Coordinates: KiCad top view of the component side, origin top-left of the
board, x right, y down, millimetres. The user looks at the other side.

| Item | Position |
|---|---|
| Board | 86 x 143.5, corner radius 2, both bottom corners cut away |
| Strip above the display | y 0 to 7: the Wi-Fi module's antenna, two mounting holes |
| Wi-Fi module | x 20.1 to 35.5, y 0.3 to 21.6 (pad centre 27.8, 13.9), antenna up; its converter in the column left of it |
| Cut in the top edge under the Wi-Fi antenna | x 8.6 to 37.5, y 0 to 6.0; no copper on any layer for x below 50.5, y below 6.3 |
| Display cover lens (84.3 x 84.3) | x 0.85 to 85.15, y 7.0 to 91.3 |
| LCD module (metal back) | x 5.6 to 80.4, y 12.8 to 89.4 |
| Flex slot | x 11.5 to 62.0, y 89.5 to 92.5 |
| Ethernet jack | x 68.8 to 84.9, y 71.2 to 92.8, opens downwards into its cut-away. Pin rows at y 73.0 and 75.55, behind the display |
| Cut-away for the Ethernet plug | x above 69.5, y above 92.5 (16.5 x 51 mm) |
| Cut-away for the DC plug | x below 12, y above 107.5 |
| NFC loop | 35 x 37, centre (44.5, 117), on the display side |
| LEDs | x 29.5, 39.5, 49.5, 59.5 at y 95.6 and y 139.0, each in a 3.4 x 3.0 window with relieved corners |
| Mounting holes (3.2 mm) | (4, 3.5), (82, 3.5), (17.9, 139.4), (66.3, 117) |
| DC jack | x 1.2 to 10.2, y 93.6 to 108, opens downwards into the DC cut-away |
| DC terminal | centre (16.7, 100.2), next to the jack, wires enter from below at 40 degrees |
| USB-C | right board edge at y 13.5 to 22.5, opens sideways |

### Display mounting and flex

The panel drawing used is Hongxiangrui HXR040WQI-H401-R4018 (the same pinout as
the Waveshare ESP32-S3-Touch-LCD-4). Points that drive the layout:

- The flex leaves the bottom edge of the LCD module, 1.9 mm above the lens edge,
  and is 25 mm long measured from the lens edge. Its contacts face away from
  the glass. The touch panel has a tail of its own, soldered onto the main
  tail at a steel-stiffened joint.
- The flex goes through the slot and folds onto the component side. The stiff
  parts of the flex must lie flat behind the board after that turn. Measured
  from the edge of the LCD module they begin at 4.8 mm (components on the main
  tail), 5.3 mm (the soldered joint of the touch tail) and 6.4 mm (the touch
  controller on the touch tail, which starts 2.2 mm further forward, at the
  front of the LCD). That limits the distance between the board and the LCD's
  metal back to **2.0 mm**; at 1.5 mm there is 0.5 mm to spare. These figures
  are scaled from the drawing, +-0.4 mm, and hold for its LCD module, which is
  2.06 mm thick (3.14 mm with the bonding layer, the touch sensor and the
  0.55 mm cover lens). The display's product page shows the same drawing.
- The distance cannot be small either, because of the Ethernet jack. Its pins
  come out of the display side of the board behind the lower right corner of
  the LCD module, at least 1.45 mm long (the datasheet gives a minimum pin
  length of 3.05 mm and no maximum). Behind the metal back are pins 1 to 8, 11
  and 12 (signals, 3.3 V), one shield tab and one plastic post. The two 48 V
  pins 9 and 10 come out 0.8 and 2.1 mm beside the metal back (centre of the
  pin to the module's edge).
- So: **clip the jack's pins, tabs and posts to 1 mm** on the display side after
  soldering, stick **polyimide tape** on the LCD's metal back over that corner
  (x 66 to 80.4, y 69 to 89.4), wrapped 2 mm round the module's side edge next
  to pin 9, and mount the display **1.5 mm** in front of the board. Unclipped
  pins touch the metal back at 1.5 mm and may touch it at 2 mm.
- After the fold the contacts face the board, so J601 is a **bottom-contact**
  connector (Hirose FH12-40S-0.5SH) with its opening towards the slot.
- Seen from the component side, panel pin 1 is on the right. The connector's
  own pin 1 is on the left, so **connector pin k = panel pin 41 - k**. The
  schematic and the board already account for that.
- The folded flex covers the area x 11.5 to 62, y 76 to 89.5 and the tail up to
  the connector (`geometry.FLEX_KEEPOUT`). Only parts up to 0.9 mm high stand
  there: 0402, 0603 and 1206 passives, resistor arrays and test pads. The build
  stops if the body of any other part reaches into the area
  (`placement.check_flex_area`). The input capacitor C120 (6.3 mm, 7.7 mm
  high) and the TVS D107 stood in it until 25 November 2026; C120 now stands
  above it, between the DC converter and the proximity sensor, D107 left of
  the slot's end.

Not verified with a real panel: the exact fold length. With the display 1.5 mm
off the board the connector sits about 1.5 mm closer to the slot than the flex
end (0.7 mm for the shorter flex of a second drawing), so the flex bows slightly
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
| AliExpress item 1005005675144653, SUNMAXIC store, "4.0 inch TFT LCD Square Screen 480*480 ST7701S 40Pin", variant "Capacitive touch" | Shows the same mechanical drawing as the datasheet (84.3 x 84.3 mm, flex 25 mm from the lens edge, 40 pins at 0.5 mm) and the identical pin table | Touch controller is not named. The "No touch" variant has no touch layer |

Measure the flex of the panel you intend to buy in volume, not just any of
these.

LCSC had no panel of this type in November 2026. Its 4.0" 480 x 480 panel
(C17496207, Focus E40RC-FS1000-C) has the same driver and touch controller but
a MIPI DSI interface on a 20-pin flex and a 77 x 80 mm outline, so it does not
fit this board. The ESP32-P4 has a MIPI DSI port; using such a panel would be a
new display section, not a part swap.

### Enclosure hints

- Wi-Fi antenna: on the module, over the cut in the top edge (x 8.6 to 37.5).
  Keep metal away from the strip above the display for x below 50.5 mm: no
  screws, no metal face plate there unless it has a window over that strip
  (see "Wi-Fi antenna" for what a metal front costs).
- Both bottom corners of the board are cut away. The Ethernet jack opens
  downwards into the one on the right (16.5 x 51 mm), the DC jack into the
  one in the other corner (12 x 36 mm). Plugs and cables stay inside the board
  outline there and can go down or back into the wall.
- Room for the Ethernet plug, with the case in `case/`. What counts is the
  stiff part of the plug below the jack: body and boot, less the 13.5 mm that
  are inside the jack. Common moulded patch cables measure 24 to 31 mm there
  (37 to 44 mm over all).

  | Cable | Bend radius (4 x diameter) | Stiff part may end below the jack: cable into the wall behind the reader | Straight down through the bottom notch |
  |---|---|---|---|
  | Patch cable 5.5 mm | 22 mm | 31 mm | 49 mm |
  | Cat 6 patch cable 6.3 mm | 25 mm | 29 mm | 49 mm |
  | Slim patch cable 3.8 mm (28 AWG) | 15 mm | 37 mm | 49 mm |

  So a normal patch cable fits either way, with little to spare on the way into
  the wall; a slim one leaves the most room and carries this reader's PoE
  current (below 0.3 A) without trouble. Plugs for field termination are
  longer and sit on 7 to 8 mm installation cable that wants a 30 mm bend: they
  fit the bottom exit only. End installation cable in a socket and use a short
  patch cable from there.
- The Ethernet jack's pins stand out of the display side of the board at x 68
  to 86, y 71 to 88: behind the corner of the LCD module and under the edge of
  the lens. The enclosure must not press on them and no metal may touch them;
  pins 9 and 10 (x 81.2 and 82.5, the two nearest the board edge in the upper
  rows) carry 48 V. No wall of a display frame fits between pin 9 and the LCD
  module's edge: the pin is 0.5 mm from it and its solder pad 0.1 mm. The tape
  on the LCD is the insulation there.
- Depth behind the board: the case in `case/` leaves 13.9 mm, too little for the
  Ethernet jack's shield springs (see "Case fit against the 3D models").
- Depth between board and front: the display side of the board is 4.74 mm
  behind the front of the case (1.5 mm distance, 3.14 mm display, 0.1 mm
  recess). The case in `case/` is drawn for that.
- The DC cut-away is sized for a straight 5.5 mm barrel plug up to 11 mm
  thick. Check it with the plug of the supply you plan to ship.
- The DC terminal (WAGO 250-202, push-button) sits next to the DC jack. Its
  wires enter from the bottom edge side at 40 degrees to the board: out of
  the wall, or up through the DC cut-away. `+` and `-` are printed at the
  terminal. It has one pin per pole and uses two diagonal holes of the
  footprint (+ upper left, - lower right). The same four holes take the WAGO
  2601-3102 lever terminal (C20252913), whose wires enter at a right angle to
  the board.
- There is no screw next to the DC jack. Support the board there in the
  housing, so that pushing the plug in does not bend it.
- USB-C is on the side edge behind the display. It needs no opening in the
  housing if flashing is done before assembly.
- No tracks run on the outer layers within 3.3 mm of a mounting hole centre,
  so a screw head or standoff up to 6.6 mm across is safe. At the hole beside
  the NFC loop there is no copper pour either on the outer layers: that hole
  stands in the gap of the copper around the loop (see "NFC").
- Buzzer BZ701 fires sideways, along the board towards its lower edge (its
  sound port is on the side of the part that faces the level shifter U701).
  Leave an opening or a slot in the housing near it.
- LEDs need a diffuser in front of the windows.
- Do not put metal (screws, plates, shielded cable) inside or right behind the
  NFC loop.
- The display's metal back should be tied to the board's ground: it is a large
  plate close to the board, and discharges onto the glass end up on it. The
  display side of the board has four bare ground pads of 5 x 5 mm behind the
  LCD module, at (12.0, 23.5), (64.2, 37.2), (48, 17) and (43, 80). Put conductive
  tape or foam on at least two of them before the display goes on; leave them
  out of the area the mounting tape covers.

## Power

| Rail | Source | Loads |
|---|---|---|
| +5V | USB-C through the eFuse U105; the DC converter through the ideal diode U107/Q102; the PoE module through the ideal diode U106/Q101 | the two 3.3 V converters, backlight, LEDs, buzzer, PN532 |
| +5V_DC | AP63205 buck, 2 A, from the DC connectors (PTC fuse, TVS at the connector, reverse-polarity diode, damped input filter, TVS at the converter) | feeds +5V |
| +3V3 | TLV62569 buck U103, 2 A, from +5V | P4, PHY, sensors, panel logic, the core converter U202 |
| +3V3_WIFI | TLV62569 buck U302, 2 A, from +5V, always on | the Wi-Fi module U301 alone, with its EN RC and its pull-ups |
| VDD_HP 1.1 V | TLV62569 U202 from +3V3, controlled by the P4 | P4 core |
| P4 internal LDOs | VDDO_FLASH 3.3 V, VDDO_PSRAM 1.9 V | flash, in-package PSRAM |

Each source reaches the 5 V rail through a switch that blocks current in the
other direction. With two or more connected the highest one feeds the board;
none feeds another, and an unplugged connector stays at 0 V.

### Power budget

Worst case per load, from the makers' figures. "Sizing" is what the maker asks
the supply to deliver; "maximum" is the highest consumption the maker states.

3.3 V rail (TLV62569 U103, 2 A; current limit at least 3 A):

| Load | Sizing (A) | Maximum (A) | Source |
|---|---|---|---|
| ESP32-P4, I/O, flash, PSRAM | 0.380 | 0.200 | HDG v2.0 1.3.2: "minimum operating supply current ... 380 mA (including flash and PSRAM)"; datasheet v0.7 table 5-7: 150 mA at 400 MHz, dual core, all peripheral clocks on, "higher when accessing flash/PSRAM": 50 mA added (W25Q128JV: 25 mA at most) |
| ESP32-P4 core through U202 | 0.196 | (in the line above) | datasheet table 5-2: the core supply must deliver 0.5 A at 1.1 V; through U202 at 85 % that is 0.196 A at 3.3 V |
| IP101GRI PHY | 0.045 | 0.045 | datasheet R05: below 0.15 W at 100BASE-TX full duplex |
| VCNL4040 emitter | 0.200 | 0.005 (average) | datasheet rev. 2.0: 200 mA pulses at 1/40 duty or less |
| Display panel logic and touch | 0.060 | 0.060 | allowance: the panel's data gives no current; ST7701S and GT911 typically draw tens of mA together. Measured at bring-up |
| Jack LEDs (2 x 1.3 mA), accelerometer, hall switch, IO expander, pull-ups, supervisor | 0.010 | 0.010 | 1 k LED resistors; LIS2DH12 185 uA, DRV5032 2.7 mA peak, TCA9554 0.6 mA |
| **Total** | **0.89** | **0.32** | |
| Headroom to 2 A | **55 %** | 84 % | |

Wi-Fi module rail (TLV62569 U302, 2 A, the same circuit as U103; current limit at
least 3 A):

| Load | Sizing (A) | Maximum (A) | Source |
|---|---|---|---|
| ESP32-C5-MINI-1 | 0.600 | 0.426 | HDG 1.3.2: "output current is no less than 600 mA"; datasheet v1.4 table 6-2: IVDD 0.6 A. Table 6-5: 802.11a at 16.5 dBm, 100 % duty, 426 mA (338 mA at 2.4 GHz, 802.11b at 19 dBm, table 6-4) |
| EN pull-up, IO28 pull-up, five 51 k SDIO pull-ups | 0.001 | 0.001 | |
| **Total** | **0.60** | **0.43** | |
| Headroom to 2 A | **70 %** | 79 % | |

5 V rail, with the 3.3 V converters at 88 % efficiency and the rail at its lowest
(4.75 V):

| Load | Sizing (A) | Maximum (A) | Source |
|---|---|---|---|
| 3.3 V converter U103 | 0.70 | 0.25 | the first table above |
| Wi-Fi module's converter U302 | 0.47 | 0.34 | the second table above |
| Backlight (4S2P, 39 mA, through AP3032) | 0.13 | 0.13 | 13 V at 39 mA, 85 % |
| 8 SK6812MINI-E | 0.30 | 0.10 (firmware limit) | 12 mA per colour (spec C5149201); the firmware keeps the sum of all channels below 100 mA |
| PN532 | 0.12 | 0.12 | transmitter 100 mA (the matching keeps it below 60 mA, see "NFC") plus 20 mA |
| Buzzer | 0.10 | 0 while the NFC field is on | MLT-8530: 95 mA at 5 Vo-p; the firmware beeps after the field is off |
| Level shifter, bleed resistors | 0.003 | 0.003 | |
| **Total** | **1.82** | **0.94** | |

| Source | Rating | Headroom at the maximum | Headroom at the sizing figures |
|---|---|---|---|
| USB-C (eFuse current limit) | 1.8 A minimum (R110 1.65 k) | 48 % | -1 % |
| DC converter AP63205 | 2 A | 53 % | 9 % |
| PoE module DP9905M | 1.8 A up to 70 C (9 W), 1.2 A at 85 C (6 W) | 48 % (22 % at 85 C) | -1 % |

Both 3.3 V converters are sized for the makers' supply figures with at least
30 % to spare: U103 55 %, U302 70 %. Each 5 V source has at least 30 % to spare
at the highest consumption the makers state, with the two firmware limits in
the table (LED current, buzzer and NFC field not at once). The sum of every
supply-sizing figure, 1.82 A, is 1 % above the eFuse's lowest current limit
and the PoE module's 9 W. At that sum the eFuse would hold the USB current at
its limit (1.8 to 2.2 A) and let the 5 V rail sag, retrying after a fault
(TPS259470A: the auto-retry version); the PoE module would run 1 % over its
rating, which its own current limit covers; the DC converter keeps 9 %.
Nothing is damaged. The sum cannot be reached under the firmware's limits: the
LEDs stay below 100 mA (0.30 A in the sum), the buzzer is silent while the NFC
field is on (0.10 A), which leaves 1.52 A (16 % below the eFuse's and the PoE
module's ratings); and the sum stacks figures that do not coincide (the P4's
380 mA "minimum operating supply current" next to its core's 0.5 A, the
proximity emitter's 200 mA pulses at 1/40 duty, the Wi-Fi module's 0.6 A supply
figure against the 426 mA it draws at most). A PoE module in a case above 70 C
has less: the reader is specified for indoor use (40 C).

Before the Wi-Fi module had a converter of its own, U103 carried it too: 1.49 A
at the sizing figures with the C5's 0.6 A, 25.6 % below its 2 A, and 82 uF of
output capacitance with the module's own 33.4 uF (see "3.3 V converter").
Revision A's C6 module carried capacitors of its own as well, which the count
there did not include; its rail was probably above the 52.8 uF too. The second
converter settles both.

USB as the only source. A USB 2.0 port gives 500 mA, a Type-C source at Default
USB Power 500 or 900 mA, more only when its Rp says 1.5 or 3 A. The 5 V of the
DC converter and of the PoE module reach the IO expander through dividers (P5,
P7), so the firmware knows when USB is the only source; it then always takes
the smallest offer, 500 mA: LEDs and buzzer off, backlight at 30 % or less (an
estimated 0.45 A with the 3.3 V rails at their typical 0.37 A, the Wi-Fi module
receiving). Reading the source's CC level, which would let a 1.5 A
charger run the full board, was drawn and dropped: the free ADC pins are on the
MCU's far side, and no way to the USB-C connector was left without rerouting the
USB pair, the backlight line or the RMII bus. These limits, the LED limit and buzzer-or-NFC above are hard
requirements of the firmware, with a bring-up test each (firmware-port.md,
"Power limits per source"; bring-up.md, "Power sources").

The hardware stays safe without the firmware: the eFuse limits the USB current
to 1.8 to 2.2 A and opens when VBUS falls below 3.9 to 4.0 V, the DC converter
and the PoE module limit their own current, and a USB source that cannot
deliver protects itself. Without firmware (MCU in reset) the LEDs, the
backlight and the buzzer are held off by resistors.

### The 5 V rail's ceiling

The ideal diodes and the eFuse drop millivolts, so the 5 V rail follows its
source. What each source gives at most, and what each 5 V load takes:

| Source | Highest output | Reference |
|---|---|---|
| USB-C, a compliant source | 5.5 V | vSafe5V, USB PD R3.3 table 4.9 (4.75 to 5.5 V); USB 2.0 with the VBUS Max Limit ECN: 5.5 V |
| USB-C, a faulty source | 5.53 to 5.74 V, then the eFuse opens | OVLO below |
| DC converter AP63205 | 5.05 V (CCM), about 5.2 V in PFM at light load | DS41326 rev 3-2: 4.95 / 5.00 / 5.05 V; figures 6 and 7 (typical) |
| PoE module DP9905M | 5.25 V, about 5.5 V for a moment at a load step | datasheet: 4.75 / 5 / 5.25 V; load step 50 - 100 - 50 %: +276 mV (typical scope shot) |

| Load | Recommended maximum | Absolute maximum |
|---|---|---|
| TLV62569 VIN (both 3.3 V converters, U103 and U302) | 5.5 V | 6.0 V (SLVSDG1C 6.1, 6.3) |
| PN532 VBAT | 5.5 V | 6.0 V (PN532/C1 rev 3.6, tables 290 and 291) |
| SK6812MINI-E VDD | 5.5 V | 5.5 V "limit parameter"; no other figure (spec SK6812MINI-E-012 rev B, 7 and 9) |
| SN74LV1T125 VCC | 5.5 V | 7.0 V (SCLS745D 6.1, 6.3) |
| AP3032 VIN (backlight) | 9 V | 20 V |
| Buzzer MLT-8530 | 4.5 Vo-p | not stated; with R705 10 ohm in series the coil (16 ohm +- 3) sees at most 3.8 Vo-p at 5.74 V |
| LM74700 CATHODE, TPS25947 OUT | 60 V, 23 V | 75 V, 28 V |

The eFuse's divider (R107 330 k, R108 29.4 k, R109 97.6 k, all 0.1 %) sets
the lockouts. The thresholds of the TPS259470A are 1.183 to 1.223 V rising (UVLO
and OVLO alike) and 1.076 to 1.116 V falling (SLVSFC9C 6.5):

| | Nominal | Range (thresholds and 0.1 % resistors) |
|---|---|---|
| UVLO, rising | 4.32 V | 4.25 to 4.41 V |
| OVLO, rising | 5.62 V | 5.53 to 5.74 V |
| OVLO, falling (on again) | 5.14 V | 5.03 to 5.23 V |

So every compliant USB source gets through, and a faulty one is cut off before
the TLV62569 and the PN532 reach their 6.0 V. With 1 % resistors the window
would be 5.45 to 5.82 V: it could cut off a compliant source. At 23 V on VBUS
the divider puts 6.39 V on EN/UVLO and 4.91 V on OVLO, below the 6.5 V both
pins stand. The OVLO opens the eFuse within 1.2 us (tOVLO).

With every compliant source and with the DC converter, every 5 V load stays
within its recommended range. Two cases come close:

- The LEDs' 5.5 V is also their limit. They reach it only with a USB source at
  the top of vSafe5V and no load on the cable; the board's own current drops at
  least 40 mV in cable, fuse and ferrite. A faulty USB source between 5.53 and
  5.74 V would put up to 4 % more on the LEDs until it is unplugged.
- The PoE module's step response (typical, +276 mV) can lift the rail to about
  5.5 V for a few hundred microseconds when the load falls.

### Sources onto the 5 V rail

- USB: eFuse U105, TPS259470ARPWR. Slew rate 0.91 V/ms (C118 2.2 nF), current
  limit 1.8 to 2.2 A (R110 1.65 k), the lockouts above. It blocks current back
  into VBUS when off and when on: once OUT is 29 mV above IN it opens within
  1 us and closes again only when IN is 104 mV above OUT (50 us later). Pin
  functions, TI SLVSFC9C table 5-1 (pages 5 and 6): 1 EN/UVLO ("Do not leave
  floating"), 2 OVLO ("Do not leave floating"), 3 AUXOFF (TPS259470x: open
  drain output), 4 FLT (TPS259470x: open drain fault output), 5 IN, 6 OUT,
  7 DVDT, 8 GND, 9 ILM ("Do not leave floating"), 10 ITIMER ("Leave this pin
  open for fastest response to overcurrent events"). Pins 3, 4 and 10 are not
  connected; `test_new_ics_follow_their_makers_pin_tables` checks the symbol
  against the table and that only these three are open.
- DC and PoE: ideal diode controller LM74700-Q1 with an IRLML0030 each. The
  controller holds 20 mV across the MOSFET and turns it off within 0.45 us when
  the current reverses. Its charge pump keeps the gate 10.8 to 13.9 V above the
  source (SNOSD17G 6.5; at least 8 V at 3.2 V in), below the 15 V GATE-to-ANODE
  limit and the MOSFET's 20 V. The IRLML0030 has 27 mOhm at 10 V and 40 mOhm at
  4.5 V at most (25 C); at 8 V and a hot junction about 45 mOhm. At 2 A, the most
  either source gives, that is 0.18 W: 18 C above the board with the maker's
  100 C/W. At the 5 V rail's maximum of 0.90 A it is 0.04 W.
- Bleed resistors R104 (USB) and R105 (DC converter output), 4.7 k. With USB
  unplugged the eFuse leaks 4.86 uA (typical; IREVLKG(OFF), SLVSFC9C 6.5) from
  the rail back into VBUS, the ideal diode's cathode takes 2 uA from the rail
  (LM74700, typical): 23 mV and 9 mV across 4.7 k, where a USB-C host accepts
  0.8 V and the DC converter would start from its output at volts. Both
  figures are typical only; 4.7 k leaves a factor of 30 for VBUS. Each
  resistor costs 1 mA while its source is on.
- Simulated (`sim/powerup.cir`, `sim/switchover.cir`, with both 3.3 V
  converters): USB plugged in at 5.0 V behind 0.25 ohm and at 4.5 V behind
  0.5 ohm, 0.33 A on +3V3 and 0.12 A on +3V3_WIFI: both 3.3 V rails are up
  5.0 ms after the plug and the reset ends 4.7 ms later (the model shortens
  the supervisor's delay to 2 ms; the part has 120 to 280 ms); the 5 V rail
  runs at 4.82 and 4.18 V. With 0.67 A and 0.43 A from the good port, 4.58 V.
  At the plug 3.8 A flow for microseconds into C101 (10 uF, what USB 2.0
  7.2.4.1 allows at attach), then 47 mA while the eFuse ramps the rail at
  0.91 V/ms. Changing supplies with 0.9 A on +5V and 0.6 A at 3.3 V (0.17 A on
  +3V3, 0.43 A on +3V3_WIFI; DC to USB; USB at 4.75 V with DC at 5.05 V plugged
  in and pulled; PoE to DC; PoE and USB, PoE pulled): +5V stays at 4.06 V or
  above, +3V3 at 3.30 V, over the supervisor's 2.99 V, and +3V3_WIFI at 3.29 V,
  over the module's 3.0 V. Running on DC with USB unplugged, VBUS stays at
  0 mV; running on USB, the DC converter's output at 1 mV. The eFuse's reverse
  blocking (29 mV, 50 us re-enable) and R104 are in the model. Tried and left
  out of the checks: with the board's maximum (1.82 A at 5 V) on USB alone at
  4.75 V behind 0.43 ohm, the 5 V rail falls to the eFuse's undervoltage
  limit and the board turns off. That load is outside what USB alone may
  carry: the USB-only rule caps it ("Current from a USB-only supply").

### 3.3 V converter

TLV62569 (SLVSDG1C) with 2.2 uH (Sunlord WPN4020H2R2MT, 4.3 A saturation) and
R111 100 k / R112 22.1 k: 3.315 V.

- Output capacitance. TI's table 4 proves 2.2 uH with 10, 22 and 2 x 22 uF for
  outputs from 1.8 V, effective capacitance +20 / -50 %; 10 uF is TI's
  recommended value, and 8.2.2.5 names 10 to 47 uF. TI's engineer on E2E
  (thread 980956) takes the largest proven value plus 20 % as the limit:
  52.8 uF effective. Every capacitor on the 3.3 V rail counts, also the PHY's
  behind its ferrite. With Samsung's DC-bias data at 3.3 V (22 uF 0805
  CL21A226MAQNNNE: 13.69 uF; 10 uF 0603 CL10A106KP8NNNC: 4.46 uF) the rail
  had about 76 uF effective. Now: 10 uF at the converter (C109; the second
  22 uF is gone) and 4.7 uF at the proximity sensor's emitter (C715; Vishay
  asks 2.2 uF); the Wi-Fi module and its capacitors have a converter of their
  own (below). That is 44.5 uF counting the capacitors without data at their
  full value; the test `test_3v3_converter_output_capacitance_is_in_tis_table`
  adds it up.
- Feed-forward capacitor C108 12 pF across R111: a zero at 133 kHz. TI
  recommends 6.8 pF with 200 k (zero at 117 kHz). The loop crossover is not
  published; SLVA289 places the zero near it. Bring-up measures the load step
  (0.1 to 1 A) with and without C108.
- Current: 0.89 A at the sizing figures, 55 % below its 2 A (table above);
  the current limit is 3 A at least (DBV package).
- Layout (TI 10.2): turned so that VIN and FB face left and SW faces the
  inductor. C107 100 nF straight above VIN, C106 10 uF beside it; their ground
  vias and one under the converter close the input loop through the ground
  plane 0.2 mm below. SW reaches the inductor's pad after 1.1 mm of 0.6 mm track. The divider sits
  below FB, on the side away from SW, and senses the 3.3 V plane through its
  own via.
- The supervisor U204 (TLV803S, 2.93 V) holds the P4 in reset until the rail
  has been above its threshold for 120 to 280 ms, and resets it when the rail
  falls below that.

### The Wi-Fi module's converter

U302: the circuit of U103 (TLV62569, 2.2 uH WPN4020H2R2MT, R311 100 k / R312
22.1 k, 3.315 V, C306 12 pF across R311), for the ESP32-C5-MINI-1 alone. Its
parts are all on the board already, about 0.22 USD.

- Why. The module asks its supply for 0.6 A (HDG 1.3.2) and has 33.4 uF on its
  3V3 pin (datasheet v1.4, figure 8-1: C6, C21, C29 10 uF; C19, C20, C26 1 uF;
  C4, C8, C12, C15 100 nF; C14 10 nF). On U103 that made 1.49 A at the sizing
  figures (25.6 % headroom) and about 82 uF of output capacitance.
- Output capacitance: C301 22 uF (13.69 uF at 3.3 V) and C302 100 nF at the
  module's pin, Espressif's typical circuit (figure 9-1), and the module's
  33.4 uF at full value: 47.2 uF, inside the 52.8 uF; without the module's
  capacitors still 13.8 uF, above TI's smallest proven value (10 uF - 50 %)
  (`test_wifi_converter_output_capacitance_is_in_tis_table`). C301 is both the
  converter's output capacitor and the module's.
- Current: 0.60 A at the sizing figure, 0.43 A at most: 70 % below its 2 A.
- Always on, as the C6's supply was: EN through R310 100 k from the 5 V rail,
  no switch (a module whose supply an IO expander switched did not start,
  esp-hosted issue 127). Everything that sets the module's pins at reset hangs
  on its own rail: the EN RC (R301 10 k, C303 1 uF), the IO28 pull-up R303 and
  the SDIO pull-ups R305 to R309
  (`test_wifi_module_supply_is_always_on_and_carries_its_pull_ups`).
- Power-up order. Both converters start from the 5 V rail together (each at
  2.45 V, with the same soft start): +3V3 and +3V3_WIFI are up within
  microseconds of each other, 5.0 ms after a USB plug in the simulation. The
  module's EN rises 13.4 ms later (its RC to 0.75 x 3.3 V). The supervisor
  holds the P4 in reset for 120 to 280 ms after +3V3, so no P4 pin drives the
  module before its rail is up and its straps are read; esp-hosted's later
  resets run with both rails up. When the 5 V rail goes, both rails fall
  together and the supervisor resets the P4 below 2.93 V.
- Layout (TI 10.2), in the column left of the module: turned 90 degrees, so
  that SW, GND and EN face up to the inductor and VIN and FB face down. C305
  100 nF straight below VIN, C304 10 uF beside it, their ground vias and one
  under the converter between its pad rows close the input loop through In1.
  SW runs straight up into L301's pad; L301's output pad lies level with C301's
  + pad, and C301's ground pad faces the module's ground pins 1 and 2, its +
  pad the module's 3V3 pin (pin 3). The divider sits below FB and senses the
  rail at C302 along the module's edge (`routes_wifi.wifi_buck_routes`).
- On the routed board (`scripts/layout_report.py`, pad centres): the input
  loop is C305 to VIN 1.4 mm along copper and 5.1 mm back through the fill,
  1.1 mm2, switch-node copper 7.4 mm2, as small as U103's ("Switching
  converters: hot loops"). C301's + pad lies 1.8 mm from the module's 3V3 pin
  and 3.2 mm from L301's output pad; its ground pad 1.8 mm from the module's
  ground pins 1 and 2, with a via 0.75 mm away into In1, and 7.2 mm from
  U302's GND pin, which it reaches through In1 (that via, and the 0.6 mm via
  between U302's pad rows). Both makers want this capacitor at their pin;
  it sits nearer the module's, because the output loop carries the
  inductor's triangular ripple, not the input loop's chopped current, which
  TI names the critical one.

### DC input

Meant for 12 V or 24 V supplies; 28 V is the most it stands continuously. The
jack is rated 24 V. The converter (AP63205) works up to 32 V, stands 35 V
continuously and 40 V for 0.4 s.

From the connectors: PTC fuse F102 (1.1 A hold), TVS D107 (SMBJ28CA,
bidirectional), reverse-polarity diode D105 (SS310, 100 V), C117 2.2 uF and
the electrolytic C120 47 uF, filter inductor L103, TVS D106 (SMBJ28A) and the
converter's C112/C113. Both TVS stand off 28 V and conduct from 31.1 to 34.4 V.
A reversed supply stays below D107's stand-off and D105 blocks it.

- Plugging in a live supply. The cable's inductance and the input capacitors
  ring; C120's ESR damps it. Simulated (`sim/dc_hotplug.cir`): at 24 V the converter sees at most
  31.0 V (1.5 m of thin cable), 27.6 to 29.1 V with thicker and longer cables;
  at 26.4 V (24 V + 10 %) 34.7 V at most; at 28 V 32.6 V, with no current in
  the TVS. C120's ESR 0.1 to 0.8 ohm, the TVS at the top of its range. Without
  C120 the same cases reached 38 V.
- Surges. Which test applies:
  - The board has radios, so the RED applies and with it EN 301 489-1 V2.2.3:
    its table 2 and 9.8 ask for surges on AC mains and wired network ports only.
    A DC power port gets none.
  - EN 55035 does not apply (EN 301 489 takes precedence, its clause 1), and it
    would test a DC port fed by a dedicated adapter on the adapter's AC side
    (3.1.12).
  - EN 61000-6-1 does not apply: it is for products without a product or
    product-family standard (its clause 1), and access control has one,
    EN 50130-4.
  - EN 50130-4:2011, clause 13, is what access-control customers expect. On
    extra-low-voltage DC lines it applies the slow high-energy surge line to
    earth only, through 42 ohm (2 ohm generator, 40 ohm). The 1995 edition's
    levels are 0.5 and 1 kV; the 2011 levels are to be read from the purchased
    standard before the lab.
  - The PoE/Ethernet port is a wired network port: 0.5 kV line to ground when
    its cable may be longer than 30 m indoors (EN 301 489-1 9.8.2.2).

  Simulated (`sim/dc_surge.cir`): 1.2/50 us, +-1 kV behind 42 ohm, applied
  across the input instead of line to earth (the board has no earth, so in the
  real test far less of it flows through the input), the supply connected
  through the coupling network's 1.5 mH, both TVS at the top of their breakdown
  range with the slope of their 10/1000 us rating, C120 at -20 % with low and
  high ESR, L103 unsaturated and saturated: 

  | Supply | +1 kV: converter, D105 reverse | -1 kV: converter, D105 reverse, input TVS |
  |---|---|---|
  | 12 V | 35.8 V, 40 V | 34.7 V, 62 V, 21.5 A |
  | 24 V | 38.6 V, 26 V | 35.5 V, 72 V, 21.8 A |
  | 26.4 V | 39.3 V, 22 V | 35.6 V, 74 V, 21.8 A |
  | 28 V | 39.6 V, 19 V | 35.7 V, 75 V, 21.8 A |

  The converter stays below its 40 V (0.4 s), D105 below its 100 V; the input
  TVS takes up to 22 A of an 8/20 us pulse, where ST gives 68 A at 59 V for the
  same part. The converter's input dips after the surge (to 4 V at 12 V, to
  17 V at 24 V): the coupling network's 1.5 mH rings with C120, undamped by
  the converter, which draws constant power. A test lab's network can do the
  same; the board then restarts. Supply cables have microhenries, not
  millihenries, and do not ring this way.

  Before, with the SS34 and no TVS at the connector, the converter saw 40.6 V
  at 28 V supply, and a negative surge drove D105 into breakdown with 22 A. A
  line-to-line surge of 0.5 kV behind 2 ohm (IEC 61000-4-5's test for power
  ports, which no standard for this board asks of a DC port) drives some 200 A:
  that would need a converter rated for 60 V and a larger TVS.
- Input filter: C117, L103 and C112/C113 form a pi filter, so the converter's
  1.1 MHz ripple current does not run out on the supply cable. It takes 40 to
  50 dB off at 1.1 MHz (calculated, not measured). It has no common-mode
  choke: if the lab finds emissions from the cable above 30 MHz, a clip-on
  ferrite at the cable is the first remedy. The ceramic capacitors are 2.2 uF /
  100 V X7R: they keep 2.0 uF at 12 V and 1.5 uF at 24 V, where a 10 uF / 50 V
  part keeps 3.4 and 1.35 uF and lets the input ring higher.
- The DC converter sits in the left column behind the display, right above the
  two DC connectors, away from the NFC loop.

Other notes:

- Nothing but the TVS may sit across the PoE input. Extra capacitance there
  breaks the PoE detection signature.
- The PoE module needs a minimum load (100 mA DP9905M, 200 mA Ag9905M). With the
  backlight on the board draws more than that. A deep-sleep mode would need a
  dummy load. A PoE module that is connected but carries no load because
  another source is higher may whistle, and the switch may turn the port off and
  on. Nothing is damaged.
- The firmware cannot tell which source powers the board. That was left out on
  purpose; a divider to a spare GPIO would add it.
- The core converter must be a TLV62569DBVR. Espressif lists the part numbers
  that work; converters with output discharge keep the P4 from waking up.

## PoE isolation

The 48 V side consists of jack pins 9 and 10, FB102, FB103, D103 and module
pins 5 to 8. It lives in the right-hand strip of the board. No ground or supply
copper is poured there on any layer, and the PoE net class keeps 2 mm from every
other net. That rule compares copper on one layer only; from layer to layer the
keep-out areas do its job: no pour on any layer comes closer than 2 mm to 48 V
copper (below C102's 48 V pad the inner pours used to end 0.9 mm from it).
C102 bridges the barrier for EMC: a certified X1/Y2 safety capacitor (Murata
GA352QR7GF102KW01L, 1 nF, 250 V AC, proof-tested at 2000 V AC for 60 s by its
maker) in the 2211 case, on a land pattern with 4.5 mm between its pads. C410
(1 nF, 3 kV, Fenghua 1808B102K302NT) and R413 tie the jack shield to ground;
both of them are on the secondary side.

Three places need more than the 2 mm rule, which only looks at copper against
copper on one layer:

- Under the PoE module. Its isolation barrier is not at the pin row but under
  the module body, 2.3 mm from the output pins at one end and 5.3 mm at the
  other (Silvertel's drawing for the Ag9900 family; the SDAPO datasheet shows
  none). From that line to the 48 V pins the board has no copper on any layer.
- At the jack's metal shell. The shell is on the secondary side (shield). No
  48 V copper and no part at 48 V lies on the component side within 1 mm of the
  shell's rear wall; the two 48 V nets pass under that wall on the inner layer.
- At the display. The jack's two 48 V pins come out of the display side of the
  board beside the LCD module's metal back: pin 9 with 0.5 mm between pin and
  module edge, pin 10 with 1.8 mm. Air alone does not hold 1500 V over 0.5 mm.
  The polyimide tape on that corner of the LCD, wrapped round its edge, is the
  insulation (see "Display mounting and flex"). No 48 V track runs on the back
  layer, which faces the display: the two lines from the jack and the filtered
  negative line beside the module (19 mm) run on the inner layer In2.

The 2 mm figure is a design choice, not a certified creepage distance.
Silvertel asks for 3 mm between the two sides of the barrier; the board has
2.0 mm and more. The jack itself has 2.3 mm between its PoE pins and its signal
pins. IEEE 802.3 (§33.4.1) has the powered device stand one of: 1500 V RMS
for 60 s, 2250 V DC for 60 s, or ten 1500 V impulses of 10/700 µs (TI
application report SLUA818; IEEE interpretation interp-3-0704). Until the
industry review C102 and C410 were 2 kV DC parts, below the 2.1 kV peak of the
first test and below the second. The Y2 part's 2000 V AC proof test (2.8 kV
peak) covers all three. Test the isolation on an assembled unit before the lab
does, and ask the lab whether it tests it at all: for the safety standard both
sides are safe to touch.

## NFC

- Loop: 4 turns, 35 x 37 mm, 0.5 mm track, 0.9 mm pitch, on the display side.
  Simulated from the board's copper (`sim/nfc_loop.py`), at 13.56 MHz:

  | | Inductance | Resistance |
  |---|---|---|
  | in free air | 1.27 uH | 1.20 ohm |
  | on the board, wall of wood or stone | 1.25 uH | 1.23 ohm |
  | on the board, metal wall 18 mm behind the loop | 1.20 uH | 1.24 ohm |

  The pours around the loop take 2 %, because they are open on one side (see
  the end of this section); the display's metal back takes nothing that
  counts. The loop also has about 2.4 pF of its own (between its turns, to the
  copper around it, pads and feed tracks), which acts like 2.5 % more
  inductance. Not in the simulation: the DC terminal 6 mm away and, on the lan
  version, the Ethernet plug and cable 8 mm beside the loop's right edge. They
  lower the inductance a little, and so does a card or a phone in the field.
- Damping: 1.5 ohm in each leg, giving a quality factor of about 25.
- EMC filter: 560 nH and 220 pF per side (corner at 14.3 MHz).
- Matching: series 39 pF, parallel 180 pF + 10 pF. These are not the values
  for the best match at one inductance. They are chosen so that the
  transmitter and the receiver input stay inside their limits for the loop on
  either kind of wall, with room below for what a card or a phone takes off:

  | Loop | Load between TX1 and TX2 | Transmitter supply current | Receiver input |
  |---|---|---|---|
  | 1.00 uH | 5 + 15j ohm | about 79 mA | 3.1 Vpp |
  | 1.10 uH | 12 + 24j ohm | about 49 mA | 1.8 Vpp |
  | 1.20 uH | 59 + 13j ohm | about 35 mA | 1.2 Vpp |
  | 1.25 uH | 36 - 26j ohm | about 41 mA | 1.9 Vpp |
  | 1.30 uH | 15 - 22j ohm | about 56 mA | 2.9 Vpp |

  The PN532 allows 100 mA in the transmitter (60 mA typical, 150 mA is its
  limiting value) and 4 Vpp at the receiver input (its analog supply plus 1 V).
  Two sets of values came before these. The first (27 pF, 150 pF + 22 pF) was
  calculated for a larger loop of 1.35 to 1.4 uH; with 1.2 uH it would have
  drawn about 140 mA. The second (parallel 180 pF + 18 pF, receive divider
  2.7 k) was calculated for 1.2 uH and without the loop's own capacitance.
  With the simulated loop of 1.25 uH it gives 57 mA and 3.8 Vpp, and with the
  parts' tolerance 45 boards in a hundred are above the receiver's limit and
  five above 100 mA. The figures come from a model (`sim/nfc_match.py`: driver
  4 ohm per side, 2 to 5 ohm over the spread; transmitter supply 3.0 V, 2.7 to
  3.4 V; filter inductor 1 ohm), not from a measurement. A time-domain run
  with the square wave of the real bridge (`sim/nfc_tx.cir`) gives the same
  current.

  The table is for exact part values. The capacitors and the two filter
  inductors are 5 % parts, and the filter's corner (14.3 MHz) lies close to
  the carrier, so their spread moves the result as much as another loop does:

  | Parts within 5 % | Transmitter current stays below 100 mA for loops of |
  |---|---|
  | exact values | 0.93 to 1.39 uH |
  | spread evenly: fewer than one board in a hundred above | 1.08 to 1.27 uH |
  | every part at its worst end at once | 1.12 to 1.25 uH |

  The receiver input stays below 4 Vpp on 99 boards in a hundred for loops of
  1.06 to 1.26 uH. Further out it gets worse quickly: at 1.0 uH one board in
  five is above 100 mA, at 1.3 uH one in twenty (up to 210 mA; the chip's
  limit is 150 mA). So measure the loop before the field is switched on, and
  the current when it first is (bring-up plan).
- The damping resistors carry the loop's current: 20 to 35 mW each with these
  values, and at most 75 mW with any spread of the parts for loops up to
  1.25 uH (they are rated 0.1 W).
- Receive path: 3.9 k, 1 nF, 1 k to VMID. NXP's reference has 2.7 k there; with
  it the input saw 3.8 Vpp at 1.25 uH. With 3.9 k it sees 1.2 to 1.9 Vpp for
  loops of 1.2 to 1.25 uH, well above the 0.5 Vpp it needs.

These are starting values. Measure the loop first, then tune C513/C517,
C514/C515/C518/C519, R504/R505 and R506 with a network analyser on an assembled
unit with the display fitted, and check the read range with the cards in use.
The two assembly versions differ here: a shielded plug and its cable lie next
to the loop, so tune the lan version on its own, with the cable plugged in.

Copper around the loop is open at one place (a 2.5 mm gap in all layers on the
side towards the Ethernet cut-away). A closed ring of copper around the loop
would act as a shorted turn: simulated, metal across that gap turns the loop's
1.25 uH into 1.03 uH and its 1.23 ohm into 1.36 ohm. One of the four mounting
screws stands in the gap. So the outer layers carry no copper within 3.3 mm of
that hole: neither the screw's head on the component side nor the insert under
the board can join the two ends of the copper, even where they cut through the
solder mask. (Up to 24 November 2026 the pours ran under both, on both sides
of the gap.)

## Ethernet

Wiring follows the Espressif ESP32-P4-Function-EV-Board: IP101GRI with a 25 MHz
crystal, the PHY drives the 50 MHz RMII clock, PHY address 1. The transformer
centre taps go to ground through 100 nF (voltage-mode PHY, no termination
resistors).

The jack datasheet prints no + and - at the transformer pins. The polarity
follows from the winding dots in its schematic and the standard contacts of the
jack (1 TX+, 2 TX-, 3 RX+, 6 RX-): pin 1 is RD+, pin 2 RD-, pin 5 TD+, pin 6
TD-. At the PHY the positive pin of each pair leads to the outer of the two
tracks, at the jack it is the inner pin. Both lines of a pair run side by side
on the component side down to the jack. Just above it each changes to the back
layer through one via, and there the two swap sides. (A swapped pair would
still link: 10BASE-T receivers correct it and 100BASE-TX does not depend on
polarity.)

The pairs pass under the rear wall of the jack's metal shell on the back layer,
the two 48 V nets on the inner layer, and no part sits within 1 mm of that
wall. Only the two centre-tap tracks and, at the shell's left side, the LED and
shield tracks run under the shell on the component side; a contact between one
of those and the shell would do no harm.

The PHY has no reset circuit of its own. Its reset pin hangs on an IO expander
pin that is an input with a weak pull-up after power-up, so the PHY starts
together with the supply, without the 10 ms of reset its datasheet asks for.
The firmware has to pulse the pin low before it uses the PHY (see
[firmware-port.md](hardware/touch-p4/firmware-port.md)). The Espressif ESP32-P4 board works the
same way.

The 25 MHz crystal (ESR up to 50 ohm) is above what the PHY datasheet allows
(40 ohm). Typical parts are far below both. If a board ever fails to bring up
the Ethernet clock in the cold, look here first.

## Wi-Fi antenna

The ESP32-C5-MINI-1 carries its own dual-band PCB antenna, fed through a
diplexer, in the 5.85 mm at the top end of the module (datasheet v1.4, fig.
11-1). Nothing else is bought or fitted for the radio; the external antennas,
their cable and the antenna bay of the C6-MINI-1U are gone.

Its place, from `scripts/bootstrap/geometry.py` (board coordinates, mm):

| | |
|---|---|
| Module | pad centre (27.8, 13.9): body x 20.1 to 35.5, y 0.3 to 21.6, antenna up |
| Antenna area | x 20.1 to 35.5, y 0.3 to 6.15; its lower boundary (the module's ground edge) at y 6.15 |
| Cut in the top edge | x 8.6 to 37.5, 6.0 deep: no board under the antenna and on both sides of it. Its floor lies 0.15 mm above the antenna's lower boundary; it reaches 2 mm beyond the module on the right (the antenna's ground point) and 11.5 mm on the left (its open end) |
| Copper keep-out | x 0 to 50.5, y 0 to 6.3, on all six layers: the antenna area and 15 mm beside it on both sides, down to 0.2 mm above the module's top row of pads |
| Ground at the edge | the module's nine ground pads with twelve vias between them, as Espressif's land pattern shows them: 0.45 mm, their rims just touching the pads (`post_route.py` leaves them at that size rather than widen them into the pads); filled and capped by the order, so none draws solder. No via in the module's pads: the autorouter's via in the upper left ground pad, laid out for the C6, is removed with its track (`build_pcb.py`, `same_net_in_stale_pads`). Ground fill on all layers below the keep-out, stitched by `post_route.py` |

Espressif's guide (HDG 1.4.7, figures 22 and 23) recommends the antenna beyond
the board edge, the antenna's ground point (its right end) at a board edge or
corner, and "a clearance of at least 15 mm in all directions" inside the
housing. Where the antenna cannot stand out, it asks for the board cut away on
both sides of the antenna and below it. On this board:

- The antenna stays inside the outline, because the case has 1.5 mm to its top
  wall; the cut is the fallback the guide names.
- The ground point lies on the board's inner side, 51 mm from its right edge
  and 35 mm from the left one. Figure 22 ticks only the right-hand corners for
  this orientation: the top right corner (position 3) is where USB-C, its
  eFuse path and a mounting hole sit.
- The cut reaches 11.5 mm beyond the open end, not 15 mm: the upper left
  mounting hole stops it.
- In the case the antenna has 1.8 mm to the top wall, 4.7 mm to the front wall
  (both printed), 13.1 mm to the dock plate (printed) and, with the reader on a
  metal wall, 15.6 mm to the wall. The display's metal back (x 5.6 to 80.4, y
  12.8 to 89.4) lies 6.7 mm below the antenna area, on the board's other side
  and 3.9 mm behind the antenna's plane; it is tied to the board's ground on
  four pads.

What that costs is in the full-wave model below, against the same stand-in at
Espressif's position 3, and recorded under "Accepted deviations".

Front materials. The model has the case's top strip printed (ABS or PETG), a
wooden or printed face plate behaves like it. An aluminium face plate over the
strip above the display costs 1.5 to 1.9 dB at 2.4 GHz and 0.7 to 1.2 dB at 5 GHz
against the printed front; with a window over the antenna and its keep-out (x
up to 50.5 mm) it costs nothing. So: printed, wood or other non-metal fronts
anywhere; a metal front only with that window.

Full-wave model (`sim/wifi_antenna.py`, openEMS). Espressif does not publish
the antenna's shape. A stand-in of the same size and kind, an inverted-F with a
long arm for 2.4 GHz and a short branch off the feed for 5 GHz, ground point on
the right, was tuned on a 40 x 55 mm evaluation board with the antenna out over
its edge to 2.429 GHz (-10 dB) and 5.435 GHz (-8 dB). Then the same stand-in on
this board: in its place (top left), and in the top right corner with the
antenna out over the edge, its right end 1 mm inside the board's (Espressif's
position 3, fig. 23 "Max 1"), with the case grown by as much, so that the
antenna has the same distances to its walls. Radiated of the power fed in (the
mismatch included), and in brackets of the power accepted, in dB:

| Case | 2.4 GHz: resonance | ch. 1 / 7 / 13 | 5 GHz: resonance | 5.18 / 5.50 / 5.70 GHz |
|---|---|---|---|---|
| Evaluation board | 2.429 | -2.4 / -2.4 / -2.6 (-1.9 / -1.9 / -1.9) | 5.440 | -6.8 / -4.8 / -5.4 (-4.4 / -3.9 / -3.3) |
| This board, top left | 2.375 | -2.7 / -2.9 / -3.4 (-1.7 / -1.6 / -1.4) | 5.435 | -3.9 / -2.8 / -4.0 (-1.8 / -2.0 / -1.7) |
| with the display | 2.377 | -2.7 / -3.0 / -3.4 (-1.7 / -1.6 / -1.4) | 5.440 | -4.0 / -2.6 / -4.2 (-1.9 / -1.8 / -2.0) |
| **in the case, with the display** | 2.325 | **-3.0 / -3.5 / -4.1** (-1.5 / -1.4 / -1.3) | 5.430 | **-3.8 / -2.5 / -4.0** (-1.9 / -1.7 / -1.9) |
| in the case, metal wall 16.4 mm behind | 2.308 | -4.7 / -4.9 / -5.2 (-2.6 / -2.4 / -2.3) | 5.430 | -4.3 / -3.0 / -4.6 (-2.6 / -2.4 / -2.7) |
| in the case, aluminium face plate | 2.321 | -4.5 / -5.2 / -6.0 (-1.9 / -1.8 / -1.7) | 5.425 | -4.5 / -3.2 / -5.2 (-2.2 / -2.0 / -2.5) |
| aluminium face plate with a window over the antenna | 2.325 | -2.8 / -3.5 / -4.2 (-1.6 / -1.5 / -1.4) | 5.430 | -3.7 / -2.4 / -4.0 (-1.8 / -1.7 / -1.9) |
| Position 3, on the board | 2.487 | -1.7 / -1.4 / -1.3 (-1.1 / -1.2 / -1.2) | 5.820 | -9.3 / -5.4 / -3.6 (-3.6 / -2.9 / -2.7) |
| **Position 3, in the case, with the display** | 2.427 | **-1.1 / -1.1 / -1.2** (-1.1 / -1.1 / -1.0) | 5.800 | **-9.3 / -5.0 / -3.2** (-3.9 / -2.9 / -2.5) |
| Position 3, in the case, metal wall | 2.433 | -2.6 / -2.6 / -2.7 (-2.4 / -2.4 / -2.3) | 5.805 | -10.9 / -6.1 / -4.4 (-5.3 / -4.1 / -3.7) |

In the case with the display, the top left place radiates 1.9 / 2.4 / 2.9 dB
less than position 3 at 2.4 GHz and 5.5 / 2.5 dB more to 0.8 dB less at 5 GHz.
Of the power the antenna accepts it radiates 0.3 to 0.4 dB less at 2.4 GHz and
0.6 to 2.0 dB more at 5 GHz: the difference at 2.4 GHz is mostly matching. The
cut and the keep-out pull the stand-in down by 54 MHz, the case by 50 MHz more
(2.429, 2.375, 2.325 GHz), so channel 13 sits on the upper edge of the match; at position 3 the
board pulls the 5 GHz resonance up to 5.8 GHz instead. Both places are within
3 dB of each other in every channel, the limit set for keeping the top left
place (review of 25 November 2026). The absolute figures are the stand-in's;
Espressif's own antenna on its test board radiates 77 to 83 % (-0.8 to -1.1
dB) at 2.4 GHz and 51 to 68 % (-1.6 to -2.9 dB) at 5 GHz (antenna report for
FCC ID 2AC7Z-ESPC5MINI1, "ESP-DUAL BAND-ANT C", Sporton, 1 December 2025).
The display's metal back changes almost nothing; a metal wall costs 1.1 to 1.7
dB at 2.4 GHz and 0.5 to 0.6 dB at 5 GHz and sends most of the rest forward (76 % and 88 %
towards the room against 47 %).

Range against the C6 readers in use is measured at bring-up, on both bands
(bring-up plan).

## Wi-Fi and Bluetooth: the ESP32-C5 behind the ESP32-P4

The P4 has no radio. The C5 module runs Espressif's esp-hosted firmware and is
the P4's Wi-Fi adapter and Bluetooth controller over SDIO. This pairing has a
reputation for trouble. On 24 November 2026 the reports in Espressif's
esp-hosted tracker and in the trackers of ESPHome and Arduino were read for
what caused them, and each cause was held against this board. They were about
the ESP32-C6, the co-processor of most P4 boards, and were read again on 25
November 2026, after the switch to the C5, for whether their cause depends on
the module.

What Espressif asks of the hardware
([getting started](https://github.com/espressif/esp-hosted-mcu/blob/v3.1.0/docs/getting-started-mcu.md#1-sdio);
for the tracks, the C5's hardware design guide, HDG 1.4.9),
and what the board has:

| Asked for | Here |
|---|---|
| The C5's fixed SDIO pins (CLK 9, CMD 10, D0 8, D1 7, D2 14, D3 13), chip revision v1.0 or later | as asked; the module's chip is revision v1.0 or v1.2 |
| On the P4 the pins of slot 0, which are wired straight to the SDIO unit, for the best timing; slot 1 goes through the pin matrix | slot 0 (GPIO39 to 44). Most boards with this pair, Espressif's included, use slot 1, because their slot 0 holds the SD card |
| 51 k pull-ups on CMD and D0 to D3 | R305 to R309, 51 k, to the module's own 3.3 V rail |
| A reset line from the host to the module's EN pin | GPIO45 through 1 k (R302) to EN, which has 10 k (R301, to the module's rail) and 1 uF (C303). esp-hosted's 10 ms pulse takes EN to 0.3 V and holds it below its threshold for 8.4 ms |
| Lengths, layers and ground (HDG 1.4.9): command and data within 50 mil (1.27 mm) of the clock, serpentines if needed; at most 2000 mil (50.8 mm); 50 ohm +-10 %; no change of layer; an unbroken reference plane below; ground copper round the clock | A bus laid out by hand (`routes_sdio.py`): the six lines on the back layer over the ground plane In4, 0.15 mm (49 ohm). Every line 40.3 mm from pad to pad, the clock through its 22 ohm (R304) at the P4: serpentines in the straight run make them equal to within 0.01 mm. The clock on the bus's west edge, 1.2 mm from its neighbour, with ground fill on both sides, stitched every 2.5 mm. Each line changes layer once at each end, with a ground via within 0.7 to 1.7 mm of each signal via; that is short of "no change of layer", see "Accepted deviations" ("SDIO tracks to the Wi-Fi module") |
| A supply at the module that does not dip, at least 0.6 A (HDG 1.3.2) | a converter of its own, U302 (TLV62569, 2 A), with Espressif's 22 uF (C301) and 100 nF (C302) at the module's pin (see "The Wi-Fi module's converter") |

The reports, by cause:

| Report | Cause | Here |
|---|---|---|
| Wi-Fi does not associate, `Dropping packet(s) from stream`, restart loops ([ESPHome 10956](https://github.com/esphome/esphome/issues/10956), [esp-hosted 151](https://github.com/espressif/esp-hosted-mcu/issues/151)) | The co-processor ran another esp-hosted version than the P4. Bought boards come with an old one, or none | The module comes empty. We flash it, through its test points, and keep both sides on one version |
| `send_op_cond returned 0x107`, `card init failed` at start ([esp-hosted 127](https://github.com/espressif/esp-hosted-mcu/issues/127), [Arduino 11404](https://github.com/espressif/arduino-esp32/issues/11404)) | The co-processor was held in reset by the wrong reset polarity in the configuration, was not powered (its supply switched by an IO expander), or had no firmware | The module's supply is not switched. The polarity is a firmware setting ([firmware-port.md](hardware/touch-p4/firmware-port.md)) |
| `Unrecoverable host sdio state` (0x107) after minutes or hours ([esp-hosted 167](https://github.com/espressif/esp-hosted-mcu/issues/167), [121](https://github.com/espressif/esp-hosted-mcu/issues/121)) | By Espressif's analysis of 18 November 2026, three things: a display library that called the chip's ROM cache functions while SDIO was busy; a fault in esp-hosted 3.0.9, fixed in 3.1.0; and on one custom board something not found yet, where Espressif asked about noise on the pins that share the SDIO pins' supply and about the module's 3.3 V | Firmware, for the first two. On the third: the SDIO pins' supply group (GPIO39 to 48) also carries the module's reset, the buzzer signal and the LED data line here, all of them slow signals into high impedances, and no power stage |
| CRC errors (0x109) under load on a custom board ([esp-hosted 167](https://github.com/espressif/esp-hosted-mcu/issues/167)) | Not settled. Espressif reads it as the timing margin between the two chips, which depends on track length and load: its own board shows none at 50 MHz with the C6's default clock edges and many with the other edges. The reporter found no host timing that cured it and suspects the C6's SDIO unit | The board's share of the timing is 1.01 ns (see above). Stay with the default edges, which the C5's slave driver has as well (sending and sampling on the rising edge). Whether the C5's SDIO unit behaves like the C6's is not known: the bring-up plan reads the throughput and the error count at 40 and 50 MHz |
| Downloads stall after about 100 kB ([esp-hosted 184](https://github.com/espressif/esp-hosted-mcu/issues/184)) | The access point: gone with other access points, and on one Wi-Fi 6 network gone when the C6 was kept from 802.11ax | Firmware; the C5 has 802.11ax as well |
| Double free in the SDIO receive task ([esp-hosted 210](https://github.com/espressif/esp-hosted-mcu/issues/210)) | `esp_wifi_remote` older than the esp-hosted it was built with | Firmware |
| The co-processor's firmware cannot be updated over SDIO any more ([esp-hosted 143](https://github.com/espressif/esp-hosted-mcu/issues/143)) | Co-processor firmware 2.1 to 2.8 flashed first: its boot loader does not start later images | Firmware: the first image flashed is a newer one. The test points remain as a way back |
| Bluetooth scan goes silent after 90 s ([esp-hosted 180](https://github.com/espressif/esp-hosted-mcu/issues/180)) | The board had the module without an antenna of its own (MINI-1U) and no antenna plugged in | Was this board's module. The C5-MINI-1 has its antenna on board; nothing to plug in |
| Bluetooth: connecting as central never completes for some devices ([esp-hosted 204](https://github.com/espressif/esp-hosted-mcu/issues/204)) | A fault on the host side. A patch posted in the report in July 2026 cured it for the reporter; the report was still open in November 2026 | Firmware. It matters: the reader's Bluetooth proxy is a central that scans and connects |
| "The early board had wrong crystal capacitors and a fault in the radio part" (a comment on [esp-hosted 155](https://github.com/espressif/esp-hosted-mcu/issues/155)) | A board with a bare C6 chip | Certified module with its own crystal, antenna and match |

None of the causes that were found is in the circuit or the layout of this
board. Nearly all are firmware versions and settings, which
[firmware-port.md](hardware/touch-p4/firmware-port.md) lists, and one is in the assembly (an
empty module; the missing antenna went with the C6-MINI-1U). Two reports from custom boards are not
settled, though: the timeouts whose cause Espressif has not found, and the CRC
errors it puts down to timing margin. A board of our own can have a fault of
that kind too, and no report can rule it out for a board nobody has built. So
the bring-up plan runs esp-hosted's raw throughput test on the link before
anything else is put on it.

## Tamper detection

Three sensors tell the firmware that someone is handling the reader. The firmware
does not read them yet; this is what it will find.

| Sensor | Part | Detects | How it is read |
|---|---|---|---|
| Accelerometer U702 | LIS2DH12TR | knocks and drilling (shock), the reader being swung open or torn off (tilt against the direction it had when installed), falling | I2C0, address 0x19. Its event registers latch, so polling them is enough. INT1 is on test point TP814 (`INT`) |
| Proximity sensor U704 | VCNL4040M3OE | the reader on or off its dock: it sends infrared pulses (940 nm) into the closed space behind the board and measures what the dock's plate, 13.9 mm away, reflects. It also measures the visible light in that space | I2C0, address 0x60. Proximity and ambient light as 16-bit values. It compares the proximity value with a lower and an upper threshold by itself and latches a flag when the value leaves that band. INT (open drain, 10 kΩ pull-up) is on test point TP815 (`INT`) |
| Hall switch U703 | DRV5032FA | the reader on or off its dock: a magnet in the dock lies in front of the switch | `DOCK_N` on the IO expander's P6: low on the dock, high off it. The switch samples 20 times a second |

- The magnet is a neodymium disc of 10 x 3 mm (N35 or stronger, magnetised
  through its thickness, either pole up). It lies in a ring on the dock plate,
  in front of board point (12.5, 38.2), 10.3 mm from the switch. That gives
  about 22 mT at the switch. The switch turns on for certain within 19 mm
  (4.8 mT) and lets go for certain beyond 45 mm (0.5 mT), typically at 29 mm.
- So the hall switch reports the reader as removed once it is lifted off, not
  when the two lock screws come out: swinging the bottom out by 20 mm moves the
  switch only 5 mm away. The accelerometer covers that part: the same swing
  tilts the reader by 7 degrees.
- A second magnet held to the case from outside can keep the hall switch on.
  That is why the proximity sensor is there. Its light goes from the board to
  the dock's plate and back, inside the closed case. To keep its reading where
  it was while the reader comes off, something would have to stay in front of
  it at the same distance and with the same brightness, and that needs a hole
  in the case first.
- The proximity sensor is at board point (21.6, 52.4), below the serial number
  field, its emitter at the upper end. The emitter's light ends about 30° off
  its axis, which is a spot of 7.4 mm radius on the plate. The plate is flat
  for 9 mm around: the magnet's holder ends 9.4 mm from the middle of the
  spot, the screw holes and the cables are further away. No cover is in front
  of the sensor, so off the dock it reads close to zero.
- How much it reads on the dock depends on the plate's colour and has to be
  measured. The charts in Vishay's application note give, for a grey card
  that reflects 18 % and 12.8 mm from the top of the part: about 50, 75 and
  120 counts at 50, 100 and 200 mA with the shortest pulse (1T), and about
  400 to 1100 with the longest (8T). By the same charts the reading falls by
  about a fifth for every 2 mm the reader is lifted. A white plate reflects
  several times more than the grey card, a plate coloured with carbon black
  much less. The firmware should store the reading of the mounted reader and
  report when the reading leaves a band around it.
- The sensor measures its own pulses and subtracts steady light. The white
  plastic lets some infrared through, so check on the first unit whether
  sunlight or a strong lamp on the case moves the reading.
- The same part measures visible light. The space behind the board is dark
  while the reader is on its dock, apart from what the status LEDs and the
  plastic let through. Light there is one more sign of an open case; how dark
  the closed case is has to be measured too.
- The hall switch and the magnet stay on revision A as a second, independent
  way to see the dock. If the proximity sensor proves itself on the first
  boards, U703 and C713 can be left off and the dock printed without the
  magnet; nothing else changes.
- What the hardware does not sense: a cut cable or lost supply (the server
  sees the reader go offline), and the board being taken out of the cap (that
  needs the reader off its dock first).
- All three sensors are fitted on both versions. The place of accelerometer and
  hall switch, left of the MCU, is 15 mm from the middle of the buzzer and
  22 mm from the nearest inductor, so that the magnet does not disturb them. Do
  not move the magnet towards the PoE module, the converter inductors or the
  NFC matching network.
- The buzzer shakes the board at 2.7 kHz. The firmware should ignore the
  accelerometer while it beeps.
- The MCU's free pins (GPIO27, 48, 53, 54) could not be used: capacitors sit
  in front of three of them at the pad row and the fourth is boxed in by the
  Ethernet signals. That is why the hall switch goes through the IO expander.

## ESD per port

The target is EN 301 489-1 V2.2.3 clause 9.3.2, which parts 3 (NFC) and 17
(Wi-Fi) apply to the enclosure: "The test severity level for contact discharge
shall be ±4 kV and for air discharge ±8 kV", applied "to all exposed surfaces
of the EUT except where the user documentation specifically indicates a
requirement for appropriate protective measures". Criterion B (EN 301 489-17
clause 6.4): the reader may reset, but must recover by itself. Cable ports get
transients and surge, not ESD (EN 301 489-1 table 2). EN 55035 defers to the
EN 301 489 series for radio equipment (its common modification 1). IEC
61000-4-2 clause 8.3.2 leaves out points reached only in service, if the
manual gives ESD measures, and the contacts inside a metal connector shell.
Ratings below are from the makers' datasheets.

| Port | What can be touched | Target | Protection, rating | Margin |
|---|---|---|---|---|
| USB-C, shell and pins | nothing in use: reached only with the reader off the dock (service) | left out as service (the manual's ESD measure); otherwise 4 kV contact on the shell | shell to ground; D+/D- U101 USBLC6-2SC6, "IEC 61000-4-2 level 4: 15 kV (air discharge), 8 kV (contact discharge)" (ST); VBUS D101 SMAJ5.0A, 30 kV air and contact | 2x and more |
| DC jack and terminal | inside the case; air at the cable notch | 8 kV air at the notch | D107 SMBJ28CA at the connector, 30 kV air and contact (Littelfuse), then 2.2 uF + 47 uF | 3.75x |
| Ethernet and PoE | inside the case; plug enclosed | coupling-plane discharges only | jack magnetics 1500 V RMS (HanRun), PHY rated 12 kV contact (IP101G); PoE side D103 SMAJ58A and the 1500 V isolated module; shield through C410 1 nF / 3 kV | isolated |
| Display glass, face | 0.55 mm glass | 8 kV air | the arc stops on the glass | no gap |
| Display glass edges, flex behind them | the 0.25 mm seam round the glass; the flex leaves the display at the lower edge | 8 kV air | touch lines (TP_INT, TP_RST, I2C0 SDA and SCL): U603, U604 USBLC6-2SC6 at the connector (added in review stage 4); the display's metal back tied to ground through conductive gaskets on the four bare pads; tape over the flex (installation manual) | parts rated 15 kV air |
| NFC area | solid 2.4 mm front wall | 8 kV air | no opening; the loop is shunted to ground by its matching network | no gap |
| LED windows, buzzer holes, lock screws, seams | diffusers in eight windows, holes near the buzzer, two floating M3 screws from below | 8 kV air; 4 kV contact on the screws | none on the board: SK6812MINI-E rated 2 kV HBM, buzzer and its FET without a figure, screws float | not shown by datasheets: accepted deviation below |
| Wi-Fi antenna | printed on the module, inside the case, behind the cap's top wall | 8 kV air at the seam | the RF line has no ESD part (the module leaves its ESD diode D2 unfitted, datasheet v1.4 fig. 8-1); the antenna lies 1.8 mm behind the top wall and 4.7 mm behind the front wall, with no conductive path to the outside | not shown; ESD pre-test on the top wall (bring-up plan) |
| Buttons and test points | on the board, in service only | left out as service | CHIP_PU 10 k + 1 uF + supervisor; BOOT behind 1 k | service |

Sources: ETSI EN 301 489-1 V2.2.3 (2019-11) clauses 6.2, 7.2, 9.3; EN 301 489-17
V3.3.1 clause 6.4; IEC 61000-4-2 Ed. 2.0 clause 8.3.2; EN 55035:2017 common
modification 1; ST USBLC6-2SC6 datasheet rev. 5 p. 1; R+O SMAJ datasheet rev.
2.2 p. 1; Littelfuse SMBJ datasheet (07/04/25) p. 1; HanRun HY931147C REV.A/1;
IC Plus IP101G datasheet R01 clause 7.1; OPSCO SK6812MINI-E spec B/2;
Espressif ESP32-C5-MINI-1 datasheet v1.4 fig. 8-1.

## Layout rules used

| Class | Track | Clearance | Nets |
|---|---|---|---|
| Default | 0.15 | 0.127 | signals |
| Power | 0.25 | 0.127 | 3.3 V, core rail, small supply rails |
| Power5V | 0.6 | 0.15 | 5 V input path |
| DCIN | 0.6 | 0.25 | DC input up to the converter |
| PoE | 0.6 | 2.0 | 48 V side |
| NFC_RF | 0.3 | 0.127 | transmitter to antenna |
| USB | 0.14 | 0.127 | USB data: a coupled pair, 0.15 mm apart, 90 ohm |
| MDI | 0.155 | 0.127 | Ethernet pairs: 50 ohm lines at the jack's 1.27 mm pitch, 100 ohm |

The widths are the ones tracks are laid with. After the routing,
`scripts/bootstrap/post_route.py` widens every supply track as far as the copper
beside it allows (towards 0.6 mm for the core rail, 0.5 mm for 3.3 V, 0.8 mm for
the 5 V nets, 0.4 mm for the other supply nets) and the autorouter's 0.112 mm
neck-downs to 0.127 mm. A track that ends on a pad stays as narrow as the pad.
Of the 527 track segments of the Power class 88 are narrower than 0.25 mm after
that, all of them at fine-pitch pins or between pads; two signal segments are
still 0.112 mm wide.

Minimum via 0.45 mm pad, 0.2 mm drill. Of the 753 vias with a 0.2 mm hole 620
have a 0.5 mm pad (ring 0.15 mm); the 133 others have no room for it. The
ESP32-P4 has 0.35 mm pin pitch with 0.15 mm pads.

Every P4 supply pin has a via just inside the pad row, straight down to the
3.3 V plane or to the core-rail copper on the back layer. Decoupling capacitors
connect to the same planes with their own vias.

Ground does not depend on the copper fill of the outer layers, which the
routing cuts into pieces. Every ground pad has a via into the ground plane or a
track to a pad that has one: the converters, the USB protection diodes, the
flash, the IO expander, the LED buffer and the connectors each have a via at
their ground pin, the Wi-Fi module has four between its nine ground pads, the PoE
module two at its output ground pad, and the ground pins of the three QFN parts
run straight into their exposed pads.

Four vias lie in pads, on purpose, at the MCU's upper left corner where there
is no room beside the pads: in the ground pads of C208 (10 uF), C223 and C226
(1 uF each), and in C223's supply pad, where the flash supply changes to In2. JLCPCB fills and caps every via of a six-layer board (resin,
then plated over), so the solder cannot run into these four.

No other via hole lies under solder paste, where the solder would run into it: the
vias of the MCU's and the PHY's exposed pads sit in the lanes between the paste
windows, the four of the PN532's pad in its middle with the paste windows in a
ring around them, the Wi-Fi module's where four of its ground pads meet, and
the fan-out vias of the small parts beside their pads (between two pads of one
net where capacitors stand 1.1 mm apart). The PN532's four are part of its
footprint, as plated pads; `test_design.py` checks the footprint library for
paste on a plated hole.

The pads of the 0402 and 0603 two-pad parts connect to the ground fill through
thermal spokes (0.25 mm wide, 0.2 mm gap). Solid in the fill on one side and on
a thin track on the other, such a part can stand up in the oven. Larger parts,
ICs and vias are solid in the fills.

Ground vias tie the fills and planes together (`post_route.py`): one next to
the via of every fast signal (RMII, SDIO, USB, Ethernet pairs), so the return
current can change planes where the signal does, and stitching vias every 5 mm,
every 2.5 mm along the top edge and around the Wi-Fi module. A piece of fill
without vias beside the antenna would resonate near 2.4 GHz; the strip right of
the antenna had none over 40 mm. Of the 42 vias of fast signals 25 have a ground
via within 1.5 mm and 6 none within 3 mm (3.8 mm at most): the Ethernet vias
above the MCU and those at the PHY stand too close together for more.

Routed by hand (script) and locked:

- the 48 V nets, the Ethernet pairs and the centre-tap tracks,
- the DC input from the connectors through fuse, diode and filter to the
  converter, the buzzer circuit and the output of the PoE module,
- the PHY pins on its left and lower side,
- the antenna feeds,
- the accelerometer's supply, ground and address links (its pads are 0.5 mm
  apart),
- the proximity sensor's link between its two cathode pins (it runs under the
  part, between the pad rows), its supply and its interrupt output,
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

Two layers are not enough to get all signals away from the MCU, so the inner
layer In2 carries signal tracks as well: 1130 mm of them, 28 % of all tracks.
Ground is filled in between them. The 3.3 V plane (In3) lies right below, the
ground plane In1 above; the back layer has the second ground plane (In4) as its
reference. No track runs on In1, In3 or In4, and each of the three is one piece.
The 3.3 V plane has a strip that runs down to the NFC parts left of the antenna.

The core rail's pour on the back layer reaches from under the MCU up to the
converter's second output capacitor (C235). Three vias of 0.3 mm beside that
capacitor's pad take the current down to it, and the tracks from the inductor
to the capacitors are 0.6 mm wide. The fourth core pin (54, behind the 0 ohm
link R203) is fed by a track of 0.2 to 0.3 mm on the back layer, 11 mm long.

Placement around the MCU follows from the routing. The signals on its left
side need a free strip, so only two capacitors sit next to those pins (in the
gaps of unused pins); the other 3.3 V capacitors of that side are 10 to 18 mm
away and rely on the vias into the planes. The regulator capacitors above the
MCU sit 2.4 mm from the pad row for the same reason.

Track width: 0.15 mm for signals. The autorouter narrows tracks to 0.112 mm
next to fine-pitch pins, so the board's minimum is set to 0.11 mm (the
manufacturer's limit is 0.09 mm). All but two of those neck-downs are widened to
0.127 mm afterwards.

Lengths of the fast buses on the routed board: the six SDIO lines to the Wi-Fi
module are 38 to 46 mm, the RMII lines to the PHY 40 to 48 mm and its 50 MHz
clock 59 mm, with two to four vias each. Both are well inside what these
interfaces tolerate. The Ethernet pairs from the PHY to the jack are 11 to
18 mm. The RMII transmit lines have no series resistors (there is no room for
them at the MCU); the firmware sets their drive strength instead (see
[firmware-port.md](hardware/touch-p4/firmware-port.md)).

Solder paste on the MCU's exposed pad is printed as nine windows of 2.1 mm
(70 % of the pad), not as one opening of 7.5 mm: with paste over the whole pad
the package can float on it and lift off its 0.35 mm pitch pins. The pad has
16 ground vias of 0.3 mm in the lanes between the windows. The PHY's pad has
four windows and five vias in the same way. The PN532's pad (4.42 mm) has
eight windows of 1.15 mm, 54 % of the pad, around its four vias.

The LEDs use KiCad's footprint for this part with pads 0.1 mm shorter. Its
cut-out is 3.4 x 3.0 mm with relieved corners: a milled opening has round
inside corners, and the LED body (3.2 x 2.8 mm) has square ones. KiCad's pads
end 0.25 mm from those corners, and a milled outline may lie 0.2 mm off; the
shorter pads keep 0.3 mm, like all other copper (0.31 mm is the least on the
board).

RMII_TXD1 is GPIO35, which is also the boot-mode pin. The BOOT button and its
test point are about 70 mm away. They hang behind a 1 kohm resistor (R217) that
sits at the line, next to the strap resistor, so the 50 MHz line has no long
open branch. With the button pressed the pin sees 0.3 V.

The silkscreen (`scripts/bootstrap/silk.py`) is for the person with the reader
open in front of them.

- Reference designators: wherever one fits beside its part
  (`scripts/bootstrap/silk_refdes.py`): above, below or beside the part, upright
  or turned, on no pad (0.15 mm), no part body, no other text (0.35 mm between
  two designators, so neighbours do not read as one word) and no footprint
  silkscreen. 143 of the 262 parts get one. The others stand
  where a designator has no room: around the MCU's 0.35 mm pitch pins, at the
  resistor arrays, between the NFC chip's matching parts. The assembly drawing
  (`fab/jlcpcb/attractap-touch-p4-assembly.pdf`) shows every designator, pin 1
  and polarity, with detail sheets of the MCU, the PHY, the NFC chip and the
  power section at 6 to 9 : 1.
- Test pads TP816 to TP830 (the rails, both I2C buses, the RMII clock, the
  PHY's supply) each carry the net's short name (`VDC`, `5V_DC`, `5V_USB`,
  `5V_POE`, `VDD_FLASH`, `TVDD`, `AVDD`, `DVDD`, `BL_A`, `SDA`, `SCL`,
  `NFC_SDA`, `NFC_SCL`, `REF_CLK`, `PHY_3V3`), set by `silk.test_point_labels` at
  the first side of the pad where it touches nothing. The pads stand next to
  their circuit rather than in one row; the older ones (C5, P4 UART0, power) are
  in labelled groups. TP831 (`3V3_WIFI`) is the Wi-Fi module's rail, beside its
  converter; TP832 (`GND`) is the ground pad of the C5 group, for the clip of a
  USB-serial adapter.

- Component side, the side one sees with the reader off its dock: test points
  in named groups (C5, P4 UART0, power), how to get into download mode, the
  limits of the connectors, the border of the 48 V side, the LED numbers as the
  firmware counts them, and a white field of 10 x 2 mm beside `S/N`: JLCPCB
  prints a number that differs from board to board into a field of that size
  if the order asks for it (see the [overview](hardware/touch-p4/overview.md#ordering-at-jlcpcb)). A reader that comes back can then
  be told apart even when it no longer starts. The free area behind
  the NFC loop holds the logo, the board's name and revision, a short GPIO map
  and where the documents are. The numbers of the GPIO map are taken from the
  circuit description (`circuit_core.P4_GPIO`), so they cannot drift from the
  netlist.
- Display side, hidden in the finished reader: the assembly hints for the
  display (the four ground pads, the jack's pins to clip, which of them carry
  48 V), the LED numbers, the keyhole at the tap point, and a note for whoever
  takes the display off.
- Texts are 1.0 mm high with 0.15 mm lines. The build stops if a text
  lies on a pad, on another text or within 0.3 mm of the board edge.
- The logo is drawn from the vector files in `case/logo/`. The mascot is not
  used: by the brand rules it keeps its natural colours, and a silkscreen has
  one.

### Impedance

Two kinds of lines are laid to an impedance, both on the outer layers, each over
its ground plane (In1 under the component side, In4 under the back layer):

- USB D+/D-: one via at each end, the rest a coupled pair on the back layer,
  0.14 mm wide with a 0.15 mm gap, both lines the same length with the same
  number of vias (`scripts/bootstrap/routes_signal.py`). USB 2.0 asks for 90 ohm
  +-15 % between the lines; at full speed (12 Mbit/s) a mismatch would not show,
  but the pair costs nothing extra.
- The two Ethernet pairs from the PHY to the jack: 0.155 mm lines (50 ohm each)
  at the jack's pin pitch of 1.27 mm, 1.115 mm apart. At that distance, eleven
  times the height over the plane, the lines barely couple, so the pair is
  twice one line: 100 ohm, what 100BASE-TX asks for (+-15 %).

| Line | Width / gap (mm) | JLCPCB calculator | 2D field solution | Closed form (TI SNLA187) |
|---|---|---|---|---|
| USB pair, differential | 0.14 / 0.15 | 90.4 ohm | 90.9 ohm | 91.9 ohm |
| Ethernet line alone | 0.155 | 50.3 ohm | 51.2 ohm | 48.9 ohm |
| Ethernet pair, differential | 0.155 / 1.115 (0.95 where the transmit pair steps aside of the PoE pin) | 100.1 ohm | 100.5 (transmit) / 99.1 (receive) ohm | 97.8 ohm |

Sources. JLCPCB's impedance calculator for its stack-up JLC06161H-3313 (its
calculation service with the web page's inputs: prepreg 3313, 0.0994 mm,
er 4.1; 1 oz outer copper; solder mask 1.0 mil on the laminate and 0.6 mil on
the copper, er 3.8; read 25 November 2026). The 2D field solution is
`sim/field2d.py` on the routed board: `pcb.sh simulate` measures width and gap
of each pair from its tracks and solves the cross-section (odd mode); a pair
of lines 1.5 mm apart against twice the single line is one of its self-tests.
The closed form is the microstrip and edge-coupled formula in TI's LVDS Owner's
Manual (SNLA187, fig. 5-1, p. 39), which leaves out the solder mask (the mask
lowers the impedance by 2 to 3 ohm here); the Hammerstad-Jensen formula, also
without mask, gives 53.3 ohm for the single line. The calculator's figures are
the ones the order uses: the fabrication drawing asks for impedance control to
+-10 % with these targets and lets the fab adjust the widths
([overview](hardware/touch-p4/overview.md#ordering-at-jlcpcb)).

### Margins to JLCPCB's limits

The smallest features of the routed board (`scripts/fab_margins.py`, which reads
the board file) against JLCPCB's published capabilities for boards with six
layers (https://jlcpcb.com/capabilities/pcb-capabilities, read 25 November 2026;
the page carries no date of its own):

| Feature | This board | JLCPCB | Margin | Why it stands where it does |
|---|---|---|---|---|
| Track width | 0.112 | 0.09 | +0.022 | The autorouter's neck-downs between fine-pitch pins; every other track is 0.127 mm or more |
| Track to track, track to pad | 0.127 (rule; DRC clean) | 0.09 | +0.037 | KiCad's rule for the whole board |
| SMD pad to pad, two nets | 0.150 | 0.15 | **0** | **At the limit**: the ESP32-P4's 0.35 mm pitch with Espressif's 0.20 mm pads, and the accelerometer's LGA pads (U702). The MCU's corner pads are trimmed to keep it (0.163 mm across each corner) |
| Solder mask web | 0.100 | 0.10 (green, 1 oz) | **0** | **At the limit**, same pins: mask 0.025 mm larger than each pad. Green is the only colour with a 0.10 mm web, so the order says green |
| Via, hole / diameter | 0.20 / 0.45 | 0.15 / 0.25; 0.20 hole with less than 0.45 mm costs extra | 0.05 / 0.20; **0** to the price step | 0.45 / 0.2 is the smallest via without a surcharge |
| Via annular ring | 0.125 | (0.05 from the via sizes above; 0.15 mm preferred) | +0.075 | Most vias have 0.5 mm pads; 137 of them keep 0.45 mm where there is no room |
| Plated hole ring (parts) | 0.155 (the PN532's thermal vias, part of its land pattern) | 0.15 minimum, 0.20 recommended | +0.005 to the minimum, -0.045 to the recommendation | The four vias in the PN532's exposed pad, which its land pattern draws as plated pads (0.3 mm hole); taken as vias, as they are made, JLCPCB asks 0.05 mm. Of the connectors, the Ethernet jack's shield pins have the smallest ring, 0.199 mm (HanRun's pattern) |
| Hole to hole, vias | 0.385 | 0.20 | +0.185 | |
| Hole to hole, part holes | 0.69 | 0.45 | +0.24 | |
| Via hole to track | 0.254 | 0.20 | +0.054 | KiCad's hole clearance is set to JLCPCB's value; the closest pair is an Ethernet via beside the next Ethernet line in the via field above the MCU |
| Part hole to track | 0.31 (the PN532's thermal vias to a track on In2) | 0.28 minimum, 0.35 recommended | +0.03 to the minimum, -0.04 to the recommendation | The same vias of the PN532 (as vias: 0.2 mm, +0.11). Connector holes keep 0.383 mm or more (the Ethernet jack) |
| Copper to board edge | 0.31 | 0.20 (milled) | +0.11 | Rule 0.3 mm |
| Silkscreen line | 0.15 | 0.15 | **0** | **At the limit**: JLCPCB's smallest, chosen to fit the labels and designators |
| Silkscreen text height | 1.0 | 1.0 | **0** | **At the limit**, as above. Legibility, not yield, is what suffers if the print smears |
| Silkscreen to pad | 0.15 (generator) | 0.15 | **0** | **At the limit**: the generator keeps exactly what JLCPCB asks |
| Impedance tolerance | +-10 % | +-10 % (+-5 % on request) | 0 | The standard; USB and Ethernet at their speeds need no more |

Every feature at the limit is one of three kinds: the MCU's land pattern (pad
gap, mask web), the cheapest via, and the silkscreen. None of them is a yield
risk of the bare board at JLCPCB's stated capability; the pad gap and the mask
web are the ones to look at on the first boards (solder bridges at the MCU,
which the assembly's AOI and X-ray would find).

### Switching converters: hot loops

The loop that carries each converter's switched current, measured on the routed
board by `scripts/layout_report.py`: for a buck, from the input capacitor to the
IC's VIN pin and back from its ground pad to the IC's GND pin; for the backlight
boost, from the diode's cathode to the output capacitor and back to the IC's GND
pin. The makers ask for the capacitor right at those pins and a small switch node.

| Converter | Capacitor | Supply side (copper path) | Ground side (straight, through the fill) | Loop area | Ground vias within 1 mm (IC GND pin + capacitor) | Switch-node copper |
|---|---|---|---|---|---|---|
| U104 AP63205, DC input to 5 V | C113 2.2 uF | 3.8 mm | 2.4 mm | 6.3 mm2 | 1 + 1 | 10.1 mm2 |
| U103 TLV62569, 5 V to 3.3 V | C107 100 nF | 1.0 mm | 3.9 mm | 2.6 mm2 | 0 + 1 | 7.4 mm2 |
| U302 TLV62569, 5 V to 3.3 V for the Wi-Fi module | C305 100 nF | 1.4 mm | 5.1 mm | 1.1 mm2 | 0 + 1 | 7.4 mm2 |
| U202 TLV62569, 3.3 V to 1.1 V | C232 10 uF | 2.1 mm | 4.6 mm | 1.3 mm2 | 1 + 1 | 3.7 mm2 |
| U601 AP3032, backlight boost | C606 1 uF | 2.5 mm | 5.2 mm | 0.3 mm2 | 0 + 1 | 5.5 mm2 |

Every loop closes on the component side: the capacitor's ground pad and the
IC's GND pin lie in one piece of ground fill, with In1 (ground) right below it.
The loops are a few square millimetres, the switch nodes no larger than the IC
pin, the inductor pad and the track between them. U103, U302 and U601 have no
via at their GND pin: in SOT-23 the GND pin sits between the switch pin and the
inductor's pad, with no room for one; their ground reaches In1 through the
capacitor's via and the fill (U302 also through a via between its pad rows,
1.3 mm from the pin).

### Decoupling and crystal at the MCU

Copper path from each supply pin of the ESP32-P4 to its nearest capacitor, along
tracks, via barrels and planes (`scripts/layout_report.py` on the routed board),
against the review's targets: 3 mm for the core, memory, regulator, analog, USB
PHY and battery pins, 5 mm for the 3.3 V IO pins. "24 Nov" is the board before
review stage 3.

| Pin | Supply | Target | 24 Nov | Now | Capacitor |
|---|---|---|---|---|---|
| 9 | VDD_LP | 5 | 8.1 | 8.0 | C206 |
| 21 | VDD_IO_0 | 5 | 8.7 | 9.4 | C203 |
| 26 | VDD_HP_0 | 3 | 9.5 | 10.2 | C219 |
| 30 | VDD_FLASHIO | 3 | 9.4 | 9.2 | C224 |
| 51 | VDD_USBPHY | 3 | 4.2 | 4.4 | C216 |
| 54 | VDD_HP_1 | 5 | 6.8 | 6.9 | C220 |
| 59 | VDD_PSRAM_0 | 3 | 13.8 | 13.7 | C226 |
| 62 | VDD_IO_4 | 5 | 9.8 | 9.7 | C204 |
| 67 | VDD_PSRAM_1 | 3 | 11.0 | 10.9 | C226 |
| 71 | VDDO_FLASH | 3 | 3.5 | 3.6 | C223 |
| 72 | VDDO_PSRAM | 3 | 3.2 | 3.3 | C226 |
| 73 | VDDO_3 | 5 | - | **3.5** | C230 |
| 74 | VDDO_4 | 3 | 4.6 | 4.6 | C231 |
| 75 | VDD_LDO | 3 | 9.2 | 5.8 | C208 |
| 76 | VDD_HP_2 | 3 | 6.1 | 9.1 | C221 |
| 77 | VDD_DCDCC | 3 | 9.0 | **2.0** | C208 |
| 85 | VDD_IO_5 | 5 | 8.4 | 7.0 | C208 |
| 91 | VDD_HP_3 | 3 | 1.3 | **1.4** | C222 |
| 96 | VDD_IO_6 | 5 | 1.2 | **1.3** | C206 |
| 101 | VDD_ANA | 3 | 6.2 | 6.1 | C206 |
| 102 | VDD_BAT | 3 | 3.2 | 3.4 | C214 |

Bold: within the target. The "24 Nov" column was measured before the report
counted a track that ends on another track (a T-junction) as connected, so a
value there can read a little long. Two pins lost ground: VDD_HP_2 (76) gave
its short way to the corner capacitor and reaches C221 through the core rail's
pour; VDD_HP_0 (26) runs the same way as before, through its via, the back
layer and the via at C219.

What the component side allows:

- The upper edge has seven supply pins in a row (71 to 77, 2.1 mm). A 0402
  capacitor is 0.64 mm wide and needs 0.4 mm beside it for a track, so one
  capacitor fits per 1.05 mm of pad row within reach: three of the seven, if
  the pins between them had another way out. They have not: only every other
  pin can have a via inside the pad row (0.35 mm pitch, 0.45 mm vias), and the
  strip above the row carries those of the seven that go up. Rearranged here:
  the 10 uF of VDD_DCDCC sits in the corner beside pin 77 (2 mm of track,
  ground through a via in its pad), which also puts 10 uF within 6 mm of
  VDD_LDO; VDDO_4 and VDD_HP_2 are routed by the script.
- The other edges carry the escapes: the twenty display signals at the lower
  edge, the SDIO, NFC and crystal lines on the left, the flash on the right,
  Ethernet and UART above. A capacitor there takes a signal's only way out
  (see "Layout rules used").
- The pins that miss the target reach their capacitors through the via inside
  the pad row and the plane (3.3 V on In3, the core rail on the back layer),
  which the path counts as two via barrels and the way through the plane.
  Simulated, the board's share of the impedance from a pin to its capacitors
  is 1.2 to 2.4 nH ("Simulation"), about what the package adds itself.

Two ways to meet every target were looked at; revision A takes neither (see
"Accepted deviations"):

- 0201 capacitors on the component side. They are 0.3 mm narrower than 0402,
  but what limits the pad row is not the part: one capacitor needs its own
  track out of the row, and at 0.35 mm pitch only every other pin can have a
  via inside the row. Outwards the escapes take the room (above). An 0201 is an
  extended part at JLCPCB (no 0201 capacitor is a basic part), so it would add a
  loading fee and change no pin's path.
- 0201 capacitors on the back side, each on the via of its pin inside the pad
  row: about 2.3 mm of path for every pin (the pin's track to the via, the
  barrel through the board, the capacitor's pad). This needs assembly on both
  sides (51.12 instead of 25.56 USD setup and 16.42 instead of 8.21 USD stencil,
  about 34 USD more per order; JLCPCB help article "PCB Assembly Cost", read 25
  November 2026), and the parts face the display's grounded metal back 1.5 mm
  away. The board stays single-sided for assembly.

Crystal Y201: a 40 MHz crystal of 2.0 x 1.6 mm (Hosonic E1SB40E00001AE, LCSC
C2689435; second source Tai-Saw TZ1269D, C501798, same pads and load) in place
of the 3.2 x 2.5 mm part, and without the two 0 ohm links that stood in its
lines. XTAL_N 6.8 mm and XTAL_P 6.5 mm of track from the pins to the
crystal's pads (8.1 and 10.6 mm before; target 5 mm).

- Espressif's requirements (ESP32-P4 Hardware Design Guidelines, release
  master of 12 November 2026, section 1.3.5 "Clock Source"): "The ESP32-P4
  firmware only supports 40 MHz crystal", and "the accuracy of the selected
  crystal should be within ±10 ppm". The Hosonic part is ±10 ppm at 25 °C and
  ±10 ppm from -30 to +85 °C; the Tai-Saw part ±5 ppm and ±15 ppm from -40 to
  +85 °C (makers' datasheets). Espressif states no ESR limit for the P4's
  40 MHz crystal: the guideline names one only for the optional 32.768 kHz
  crystal (70 kohm), and the P4 datasheet (v0.7) has no crystal table. Both
  parts have an ESR of 40 ohm at most, the same as the 3.2 x 2.5 mm part they
  replace, and a drive level of 100 uW at most.
- Load capacitors, from Espressif's formula CL = C1 x C2 / (C1 + C2) + Cstray
  (same section): CL 9 pF, Cstray estimated at 3 pF (the pins, about 7 mm of
  track and the pads), so C1 = C2 = 2 x (9 - 3) = 12 pF, C0G (C238, C239, the
  values fitted before). Espressif's own board implies about 4 pF of stray
  capacitance (15 pF crystal with 22 pF capacitors); with 4 pF the crystal
  would want 10 pF. The guideline says the values "need to be further adjusted
  after an overall test": the bring-up plan measures the frequency and steps to
  10 pF if it is low.
- Layout (section 1.4.2 "Crystal"): "The gap should be at least 4.5 mm" from
  the clock pin; "no vias for the clock input and output traces"; the load
  capacitors "on the two sides of the crystal ... at the end of the clock
  trace"; no signal under the crystal. The crystal is turned 45 degrees so
  that its two crystal pads face the two pins and the lines pass either side of
  its ground pad; its body stands 4.75 mm from the package edge. No via in
  either line, the load capacitors at the far ends with their ground pads at
  the crystal's ground pad, and a keep-out for tracks under the crystal on
  every other layer. The lines run on the component side over unbroken ground
  (In1) with the ground fill beside them.
- Why not 5 mm: the 4.5 mm gap alone takes most of it, and the spot is fixed
  between the NFC lines' four vias above it and the VDD_BAT parts below it.
  The two signal pads of a four-pad crystal lie on a diagonal, so each line has
  to pass the ground pad that stands between them.

## Cost

Parts at JLCPCB per board, in USD, prices of November 2026:

| | 5 boards | 100 boards |
|---|---|---|
| Wi-Fi version | 27.90 | 19.80 |
| Ethernet/PoE version | 38.70 | 27.60 |

The table is from before the design review. The review added parts worth about
0.3 USD per board (input filter, three resistors, another level shifter) and
one extended part line, the buzzer resistor. The tamper sensors add about
2.7 USD per board (accelerometer 0.89, proximity sensor 1.57, hall switch
0.17, five capacitors, two resistors) and three extended part lines; the dock
needs a magnet of a few cents. The ESP32-C5 switch adds about 0.4 USD from 100
pieces (the module 0.16, its converter 0.22) and no new lines; the external
antenna the C6-MINI-1U needed, never in the table, is no longer bought.

The table is for the parts only. The bare boards, from JLCPCB's order form on
21 November 2026 (86 x 143.5 mm, 1.6 mm, green, slowest build time, without
shipping and tax), in USD per order:

| Boards | Four layers, ENIG | Six layers, ENIG | Six layers, OSP | Six layers with ENIG, per board |
|---|---|---|---|---|
| 5 | 50.70 | 59.00 | 41.00 | 11.80 |
| 10 | 59.70 | 68.40 | 49.00 | 6.84 |
| 30 | 95.90 | 106.00 | 80.80 | 3.53 |
| 50 | 132.00 | 143.60 | 112.70 | 2.87 |
| 100 | 208.50 | 253.50 | 208.30 | 2.54 |

The prices are from the form filled in by hand, without the Gerber files, so
JLCPCB's review of the files can still change them. Six layers cost 8 to 12 USD
more per order up to 50 boards and 45 USD more on 100 (0.45 USD per board).
They take 7 to 9 working days to build, four layers 3 to 6.

The vias cost nothing extra. The form's option "Min via hole size/diameter"
charges for holes below 0.3 mm, but its note says that on boards with inner
layers a 0.2 mm hole is free when the via is 0.45 mm wide or more, and that is
the board's smallest via. The option stays at "0.3mm/(0.4/0.45mm)". Choosing
"0.2mm/(0.3/0.35mm)" there adds 39 USD on 5 boards and 91 USD on 100 (the
option itself, TG155 material and a four-wire test).

ENIG is 18 USD of the price on 5 boards and 45 USD on 100. OSP, which JLCPCB
offers at no charge and selects for six layers unless told otherwise, is as
flat as ENIG and takes the 0.35 mm pitch MCU as well. But it protects copper
only until it is soldered, and JLCPCB excludes it for contact areas. The board
has them: the four bare ground pads for the display's metal back, on the side
without parts, where assembly cannot tin them, and the 30 test points, four of
which carry the first flash of the Wi-Fi module. Bare boards with OSP also keep
for three months only, and about a week once unpacked. The board stays with
ENIG.

Splitting the board into a small six-layer board for the MCU (45 x 45 mm:
48.80 USD for 5, 97.10 USD for 100) and a carrier with fewer layers (four
layers: 50.70 and 208.50 USD; two layers: 28.00 and 148.70 USD) does not pay.
With a four-layer carrier the two boards cost more than the one six-layer board
at every quantity. With a two-layer carrier they cost more on 5 boards and
0.08 USD less per reader on 100, before the connector pair between the boards
and the second assembly order.

Once per order JLCPCB adds 3 USD for every extended part line (50 lines on the
Wi-Fi version, 57 on the Ethernet/PoE version by its catalogue of 25 November
2026, with the power path of review stage 3; preferred parts not counted), the
setup and stencil fees, the bare boards and shipping. On five boards the
extended-part fees alone are 30 to 34 USD per board, so a small prototype order
costs far more per board than the table shows.

The largest lines are the ESP32-P4 (6.15), the PN532 (5.89), the Wi-Fi module
(4.19) and the flash (2.26); on the Ethernet/PoE version also the PoE module
(6.70), the jack (2.60) and the PHY (1.03).

The Wi-Fi module is now the ESP32-C5-MINI-1-N4-V1.2 (C54951860): 4.90 USD for
one, 3.78 from 30 pieces, 3.36 from 100 (JLCPCB, 25 November 2026), against
4.13, 3.42 and 3.20 for the ESP32-C6-MINI-1U-H4 the table was made with. Its
own 3.3 V converter adds about 0.22 USD from 100 pieces (TLV62569, 2.2 uH,
22 uF, 10 uF and small parts, all already lines of the parts list). No antenna
or cable comes on top any more.

Savings that were looked at and not taken:

| Change | Saves per board | Why not now |
|---|---|---|
| 16 MB flash GD25Q128ESIG (C2758105) instead of the Winbond part | 0.5 to 0.8 | It is an extended part, so the fee eats the saving below about ten boards. Same footprint: a change of the LCSC number. |
| DC jack DC-005C-20A (C84007, 24 V, 3 A) instead of the CUI PJ-002A | 0.8 | Its pins are 6.65 mm apart instead of 6.0 mm, so the footprint needs wider slots. |
| Generic 40-pin display connector instead of the Hirose FH12 | about 0.4 | Different solder tabs: a footprint change at the densest connector of the board. |
| Reader chip of the RC522 family (FM17580, Si522, MFRC522 second sources, 0.3 to 1 USD) instead of the PN532 | about 5 | These chips are only the radio front end. The firmware would need a new driver that includes the ISO 14443-4 protocol, which the PN532 runs itself, and the board a new matching network. |
| USB protection SRV05-4-P-T7 (C85364, a preferred part) instead of the USBLC6-2SC6 | 3 USD per order (one extended line less) | Same package, and the board's wiring suits it: it has four lines where the USBLC6 has two, and each USB line already goes to two pins. But it is another maker's part at the one connector an ESD test will hit, and its angle in JLCPCB's library is unchecked. |

Where a part has an equivalent in JLCPCB's basic or preferred list, the design
uses that one (the TVS diodes of USB and PoE, the DC input's reverse-polarity
diode, 1 uF / 50 V). The core converter's divider is
the 499 k that Espressif's checklist demands, an extended part like the 510 k
that was fitted before. The one exception is
the three capacitors of the DC input: the basic 10 uF / 50 V part fits their
pads and is the wrong part there (see "Power"). The five other extended
passives (39 pF, 180 pF and 220 pF of the NFC matching, 1.5 ohm and 6.19 k)
have no basic or preferred part of the same value: the parts with these values
in the series the basic parts come from are extended parts as well (looked up
on 22 November 2026). Three of the five (39 pF, 180 pF, 1.5 ohm) are tuning
values that the first boards will change anyway. The 10 pF of the matching is
a basic part and the 3.9 k of the receive divider a preferred one (looked up
on 24 November 2026).

The power path of review stage 3 brought extended lines of its own: the eFuse,
the ideal-diode controller and its MOSFET, the supervisor, the two TVS of the
DC input (SMBJ28A, SMBJ28CA), the 47 uF electrolytic, the three 0.1 %
thin-film resistors of the eFuse's divider, and 1.65 k, 22.1 k and 2.2 nF
(looked up on 25 November 2026). Whether a basic part of the same value
exists for the last three was not looked up. The 3.3 V converter adds no line:
it is the part of the core converter.

## Sourcing risks

Stock figures are JLCPCB's of 22 November 2026. Every line of both parts
lists was looked up that day; the lines not named here have more than 2000
pieces.

| Part | Risk |
|---|---|
| ESP32-P4NRW32X | No stock at JLCPCB or LCSC. Has to be ordered in before assembly. Use the X part (silicon v3.x); the part without X is end of life. |
| PN532 | Fitted is the Tokmas PN5321A3HN (C53457895, about 6 USD, 123 in stock): same package and pinout as the NXP part, but its datasheet says nothing about the firmware inside, and it is not yet proven with ours. If it misbehaves, the NXP original (C28925, about 13 USD, none in stock) fits the same pads. JLCPCB's library draws the two parts a quarter turn apart: the placement file corrects the angle for the Tokmas part and for no other, so run `check-footprints` after changing the part number. NXP steers new designs to the PN7160. |
| DP9900M-5V | 38 in stock, ten fewer than two days before. Of the Silvertel Ag9905 only the types Ag9905-M and Ag9905-MT fit the footprint; the Ag9905-MTB and -LPB that Silvertel prefers have five pins in another order. JLCPCB lists no Ag9905. |
| DC jack PJ-002A (J102), inductor CKCSA252012-2.2uH/M (L103, L201, two per board) | 1022 and 1171 in stock: enough for a first order, low for a series. |
| Inductor CKCSA4020-6.8uH/M (L102) | 2228 in stock, but JLCPCB's library has no footprint for this part number, so `check-footprints` cannot compare it. It shares its 4 x 4 mm footprint with L101, has two pads and no polarity. Look at it in the placement preview. |
| Display panel | Commodity part without a guaranteed part number. Agree on a fixed type with the supplier. |
| ESP32-C5-MINI-1-N4-V1.2 (U301, Wi-Fi module) | 614 in stock on 25 November 2026, the only stocked C5 module with a PCB antenna; none of the ESP32-C5-WROOM-1. Its alternates had no stock (parts.md). |

The 3.3 V converter U103 was an AP63203WU-7, of which JLCPCB had two pieces and
LCSC none. It is now a TLV62569DBVR, the part of the core converter U202, with
490416 in stock on 25 November 2026.

## Accepted deviations

Targets of the industry review that revision A does not fully meet, because
meeting them would cost more than they are worth or the board has no room for
them. Each one is decided, not forgotten: what the target was, what the board
reaches, why it stops there, what covers the gap, and what a later revision can
do. Everything else in the review meets its target.

### Decoupling at the MCU (review item 5.3)

- **Target.** A capacitor within 3 mm of copper (via included) of every
  supply pin of the core, memory, regulator, analog, USB PHY and battery
  supplies (VDD_HP, VDD_PSRAM, VDD_FLASH, VDDO_4, VDD_USBPHY, VDD_BAT, VDD_LDO,
  VDD_DCDCC, VDD_ANA), within 5 mm for the 3.3 V IO pins; 10 uF close to
  VDD_LDO and VDD_DCDCC.
- **Reached.** 4 of the 21 pins (table in "Decoupling and crystal at the
  MCU"): VDD_DCDCC 2.0 mm with its 10 uF, VDD_HP_3 1.4 mm, VDD_IO_6 1.3 mm,
  VDDO_3 3.5 mm (target 5). The others 3.3 to 13.7 mm; VDD_LDO has the 10 uF
  at 5.8 mm.
- **Why.** The ESP32-P4 has 21 supply pins at 0.35 mm pitch. Only every other
  pin can have a via inside the pad row, one capacitor fits per 1.05 mm of row
  outwards, and the signals need that room to get out. 0201 parts on the
  component side do not change it (the row, not the part, is the limit), and
  on the back side they would need assembly on both sides, about 34 USD more
  per order: the board stays single-sided for assembly (decided 25 November
  2026).
- **Mitigation.** The pins reach their capacitors through the via inside the
  pad row and the planes (3.3 V on In3, the core rail's pour on the back).
  Simulated, the board's share of the impedance from a pin to its capacitors is
  1.2 to 2.4 nH, about what the package adds itself ("Simulation"). The
  bring-up plan runs a CPU and PSRAM stress test at full clock for an hour, cold
  and warm in the case, with the supplies on the scope (bring-up plan, "MCU",
  step 5).
- **Later revision.** 0201 capacitors on the back side, each on its pin's via
  (about 2.3 mm for every pin), with a polyimide film between them and the
  display's metal back; or the P4 in a module.

### Crystal track length (review item 5.5)

- **Target.** At most about 5 mm of track from each crystal pin to the crystal.
- **Reached.** XTAL_N 6.8 mm, XTAL_P 6.5 mm with a 2.0 x 1.6 mm crystal and no
  links in the lines (8.1 and 10.6 mm before).
- **Why.** Espressif's layout guide asks for at least 4.5 mm between the
  crystal and the clock pins, which takes most of the 5 mm. The spot is fixed
  between the NFC lines' vias above it and the VDD_BAT parts below it, and the
  crystal's two signal pads lie on a diagonal, so each line passes the ground
  pad between them.
- **Mitigation.** No vias, ground fill on both sides and unbroken ground below,
  no track under the crystal on any layer. The longer track adds about 0.3 pF,
  inside the 3 pF stray capacitance the load capacitors are sized for. The
  bring-up plan measures the frequency and the load capacitors are changed if
  it is off (bring-up plan, "MCU", step 3).
- **Later revision.** Move the NFC lines' vias to the left and the crystal up
  to 5 mm, with a new route of that corner.

### Current from a USB-only supply (review item 2.4)

- **Target.** Read the current the USB-C source offers (its CC level) and
  limit the board to it.
- **Reached.** A fixed limit: the firmware knows when USB is the only source
  (DC and PoE present on the IO expander) and then keeps the board within
  500 mA, the smallest any source offers (estimated 0.43 A).
- **Why.** The free ADC pins are on the MCU's far side, and no way to the
  USB-C connector was left without rerouting the USB pair, the backlight line
  or the RMII bus.
- **Mitigation.** A hard firmware requirement with a bring-up test
  (firmware-port.md, rule 19; bring-up plan, "Power sources"). Without the
  firmware the eFuse limits the current to 1.8 to 2.2 A and a source that
  cannot deliver protects itself.
- **Later revision.** CC1/CC2 to two ADC pins, so a 1.5 A or 3 A source can
  run the board at full brightness.

### Features at JLCPCB's limits (review item 6.2)

- **Target.** Nothing at the fab's limit unless the part's pitch forces it.
- **Reached.** Five features at the limit, none with a negative margin (table
  in "Margins to JLCPCB's limits"): the pad gap and the mask web at the MCU's
  0.35 mm pitch and the accelerometer's LGA, and the silkscreen's line width,
  text height and distance to pads.
- **Why.** Espressif's land pattern for the P4 sets the pad gap and the web;
  the silkscreen is at JLCPCB's smallest so that designators fit at all.
- **Mitigation.** Green solder mask, the only colour with a 0.10 mm web; the
  assembly's AOI and X-ray look for bridges at the MCU; first boards inspected
  (bring-up plan).
- **Later revision.** None needed unless the first boards show bridges.

### Wi-Fi antenna placement (review item 9.3)

- **Target.** Espressif's placement for a module with PCB antenna (ESP32-C5
  HDG 1.4.7, figures 22 and 23): the antenna beyond the board edge, or over a
  cut on both sides and below it with at least 15 mm on the open end's side;
  the antenna's ground point within 1 mm of a board edge, at a corner (only the
  right-hand corners are ticked for this module); 15 mm of free space round the
  antenna inside the housing.
- **Reached.** The module at the top edge, its antenna over a cut 6.0 mm deep
  from x 8.6 to 37.5: 11.5 mm beyond the open end, 2 mm beyond the ground
  point, the cut's floor 0.15 mm above the antenna's lower boundary; no copper
  on any layer within 15 mm beside it (keep-out x 0 to 50.5). The ground point
  lies on the board's inner side, 51 mm from the right edge. Inside the case
  1.8 mm to the top wall and 4.7 mm to the front wall. In the full-wave model,
  in the case with the display, the stand-in radiates -3.0 / -3.5 / -4.1 dB of
  the power fed in at 2.4 GHz (channels 1, 7, 13) and -3.8 / -2.5 / -4.0 dB at
  5.18 / 5.50 / 5.70 GHz, against -1.1 / -1.1 / -1.2 and -9.3 / -5.0 / -3.2 dB
  at Espressif's position 3: within 3 dB in every channel (Wi-Fi antenna, full-
  wave table).
- **Why.** Position 3 is the board's top right corner, where USB-C, its eFuse
  path, its ESD part and a mounting hole sit and the USB pair starts: moving
  them would re-route the impedance-controlled USB pair and move the case's
  boss (review items 5.2, 4.5 and 2.3, at A- today). Out over the edge the
  antenna would need a case 7 mm taller. 15 mm of clearance does not fit in a
  case with 1.5 mm to its walls. The upper left mounting hole stops the cut at
  11.5 mm.
- **Mitigation.** The cut on both sides and below the antenna, the copper keep-out
  on all layers, the ground vias under the module, a printed front over the
  antenna (an aluminium face plate only with a window over x 0 to 50.5 mm;
  without it the model loses 1.5 to 1.9 dB at 2.4 GHz). The module's certificate
  covers its antenna; the reader's radiated tests are done in the lab with the
  reader in its case (compliance.md). Range on both bands against a C6 reader
  in use is measured at bring-up.
- **Later revision.** The module in the top right corner with the USB-C
  connector moved down the right edge or to the top edge left of the module, or
  a case with room for the antenna out over the edge.

### SDIO tracks to the Wi-Fi module (review item 5.2)

- **Target.** Espressif's layout rules for the C5's SDIO lines (HDG 1.4.9):
  command and data within 50 mil (1.27 mm) of the clock's length, serpentines
  if needed; 2000 mil (50.8 mm) at most; 50 ohm +-10 %; "Ensure that SDIO
  traces do not cross layers", over an unbroken reference plane; ground copper
  round the clock.
- **Reached.** All but one: the six lines are 40.3 mm each from pad to
  pad, equal to within 0.01 mm (`scripts/layout_report.py`), 0.15 mm on the back
  layer over the ground plane In4 (49 ohm), the clock with ground fill on both
  sides. The one rule missed: each line changes layer twice, once beside the
  MCU and once below the module (two vias per line, the same in all six). A
  ground via stands within 1.7 mm of every one of them (0.7 to 1.45 mm below
  the module, 0.9 to 1.7 mm beside the MCU; `routes_sdio.py` places those
  that the post-route step finds no room for).
- **Why.** The pads of both chips are on the front layer, and the front layer
  between them is taken: the core converter (U202, L201 and its capacitors)
  stands in the way, and the 5 V feed (0.8 mm) and the core supply (0.6 mm)
  cross it on that layer. Moving the converter away would lengthen the MCU's
  core decoupling paths (review item 5.3, which may not drop). So any other
  layer means a via at each end.
- **Mitigation.** Both changes of layer go between two ground planes (In1
  under the front layer, In4 over the back layer) with a ground via within
  1.7 mm of each signal via, so the return current changes plane close by;
  equal via counts keep the lines equal in delay. The timing on the routed board
  (`sim/si.py`): clock and data arrive within 0.18 ns of each other, and
  clock out and data back take 1.01 ns, which leaves the P4 5.0 ns at 50 MHz
  (10.0 ns at 40 MHz) after a module that answers within the 14 ns of the SD
  standard.
  Bring-up runs esp-hosted's raw throughput test at 40 and 50 MHz and counts
  CRC errors and timeouts before anything else uses the link.
- **Later revision.** The module next to the P4's slot-0 pins, with the core
  converter moved to the P4's other side, would allow a front-layer bus.

### ESD at the LED windows, the buzzer and the lock screws (review item 9.1)

- **Target.** Every port and surface reaches the ESD test level (4 kV contact,
  8 kV air, criterion B), shown by the protecting part's rating.
- **Reached.** Every cable port, the display's edges and flex, the NFC area and
  the glass: table in "ESD per port". Not shown: the LED windows (the
  SK6812MINI-E is rated 2 kV HBM, a handling figure), the buzzer holes (no
  rating for the buzzer or its FET) and the two floating lock screws.
- **Why.** A diode on each of the eight LEDs, the buzzer and the screws is not
  practical on this board; what decides these is the air and surface path
  through the case, which no datasheet gives.
- **Mitigation.** An ESD pre-test on the first readers before the lab: 8 kV air
  on every LED window, the buzzer holes, the seams and the glass edges, 4 kV
  contact on the lock screws (bring-up plan).
- **Later revision.** If the pre-test fails: diffusers with a flange that
  closes the seam, buzzer holes offset from the port, nylon lock screws.

### Designators of the small passives (review item 7.6)

- **Target.** Every part's designator on the silkscreen; where a few cannot
  fit, the assembly drawing covers them.
- **Reached.** Every IC, crystal, inductor, bead, diode, transistor, connector,
  switch, fuse, array and the buzzer carries its designator (23 of them with a
  leader line; a test fails if one is missing). Of the 0402 and 0603 passives,
  114 around the MCU, the PHY and the NFC chip carry none.
- **Why.** At 1.0 mm text, JLCPCB's smallest, there is no room for them
  between the parts without covering pads.
- **Mitigation.** The assembly drawing (fab/jlcpcb/*-assembly.pdf) shows every
  designator, with enlarged pages of those areas.
- **Later revision.** None planned.

## Design review

In November 2026 the design was checked before the first order: every part
against its datasheet (pin numbers, supply scheme, values), every footprint
against JLCPCB's library footprint of the same part number, the board against
JLCPCB's published limits, and the mechanics against the drawings of the
display and the connectors. Nothing was built or measured.

### Found and changed

| Finding | Change |
|---|---|
| Buzzer: both coil pads were on one net, the transistor switched two pads that only hold the part. It would have stayed silent. | Coil pads 1 and 2 on the two nets, pads 3 and 4 unconnected. |
| Ethernet jack behind the display: its pins stand at least 1.45 mm out of the display side, and the notes asked for the display within 1 mm of the board. | The jack stays (moving it below the display would cost 19 mm of plug room, and the case would have to grow by that). Instead the display distance is set from both sides: 1.5 mm, 2.0 at most for the flex, with the jack's pins clipped to 1 mm and polyimide tape on that corner of the LCD. The two 48 V pins are beside the metal back, not behind it. |
| Placement angle of four parts differed from JLCPCB's library: the PN532 (second source), the transistor and the resistor arrays (KiCad's footprints), later the new level shifter. The PN532 would have been placed a quarter turn off. | The export corrects these angles. New target `check-footprints`. |
| NFC matching was calculated for a larger loop: about 140 mA transmitter current with the loop on the board, limit 100 mA. | Values that stay below 90 mA for any loop between 1.0 and 1.3 uH when every part has its exact value (with the parts' tolerance: 1.12 to 1.22 uH). Changed once more after the simulation, see below. |
| 48 V parts and tracks directly at the rear wall of the jack's metal shell (0.1 to 0.3 mm), and the centre-tap capacitors as well. | Parts moved 2 mm away, 48 V nets under the shell on the inner layer, Ethernet pairs on the back layer. |
| Copper pour under the PoE module where its isolation barrier lies. | No copper there on any layer. |
| DC input without a filter: the converter's ripple would go out on the supply cable. | Pi filter C117, L103. |
| Unpowered inputs float up through the leakage of the OR-ing diodes; a USB-C host may then not power the port. | Bleed resistors R104, R105. (The diodes since replaced, see "Power"; the resistors stay.) |
| Buzzer resistor: 0.16 W in a 0.1 W part. | 0.25 W part of the same size. |
| Level shifter 74AHCT1G125 is specified from 4.5 V; the 5 V rail can be lower. | 74LV1T125 (1.6 to 5.5 V), same pads. |
| LED data line floats while the MCU is in reset. | Pull-down R705. |
| LED windows 3.4 x 3.0 mm with round inside corners for a body of 3.2 x 2.8 mm with square ones. | KiCad's footprint with relieved corners. |
| MCU exposed pad: paste over the whole 7.5 mm pad. | Nine windows, 70 %. |
| Wi-Fi antenna: copper 3.4 mm beside it, board under it. | No copper for 44 mm along the edge, board cut away under the antenna. |
| Labels of the four Wi-Fi test points overlapped. | Two of them moved 1.4 mm. |
| The display's metal back had no connection to ground. | Four bare ground pads on the display side for conductive tape. |

### Checked and found right

- Every pin of the ESP32-P4, the ESP32-C6 module, the PHY, the jack, the PoE
  module, the PN532, the converters and the small ICs against the
  manufacturers' pin tables. The P4's supply scheme, straps, flash wiring and
  pin functions (RMII, SDIO slot 0, USB) against Espressif's documents.
- The panel's pin table against the panel datasheet and Waveshare's schematic,
  the backlight (two strings of four LEDs, 40 mA together), and the mirrored
  pin order at the connector: panel pin 1 lands on connector pad 40, and the
  contacts face the board after the fold.
- The polarity of all diodes and of the electrolytic capacitor in JLCPCB's
  library against the board.
- All part numbers of the parts list: each is the value, size and rating the
  design means.
- Electrical and design rule checks, schematic against board, and the board
  against JLCPCB's limits (tracks 0.11 mm against 0.09, vias 0.45 / 0.2 mm
  without surcharge, copper to milled edges 0.31 mm against 0.2).

### Review against layout rules

Later in November 2026 the routed board was measured against a collection of
layout rules (reference planes and return paths, supply routing, decoupling,
stitching, soldering and ordering). The design rule check was clean before and
after; it does not look at any of this.

| Finding on the four-layer board | Change |
|---|---|
| The 3.3 V pour shared the inner layer In2 with 1150 mm of signal tracks, which cut it into five pieces. The back layer had that pour as its reference: 23 % of the length of the fast signals on the back layer, and 28 % on In2, had no copper of a plane next to them (the 50 MHz Ethernet clock over 18 of its 47 mm). | Six layers. The routing is the same; the 3.3 V plane has a layer of its own and the back layer a ground plane. 7 % of the fast signals' length on those two layers is still without a plane next to it, at vias and where the planes end. |
| 17 of the 42 vias of fast signals had no ground via within 3 mm, the six SDIO vias at the Wi-Fi module none within 6 to 12 mm. | A ground via beside each, where there is room: 6 are left without one within 3 mm (3.8 mm at most). |
| About 1000 mm2 of each outer ground fill lay more than 10 mm from a ground via; the strip right of the Wi-Fi antenna had none at all. | 342 stitching vias. No fill is more than 5.6 mm from a ground via. |
| Core rail: the pour on the back layer did not reach the converter, because its outline visited one corner twice and KiCad filled only the square under the MCU. The rail hung on one track of 0.2 mm and one via with a 0.2 mm hole. | One outline; three 0.3 mm vias at the output capacitor into the pour; supply tracks widened. |
| A 48 V track on the back layer (19 mm beside the PoE module), where these notes said there was none. Inner pours 0.9 mm from the 48 V pad of C102. | The track is on the inner layer. Pours end 2 mm from 48 V copper on every layer. |
| PN532: the capacitors of its analog supply were 8.3 mm from the pin. | The 100 nF is 4.1 mm from it. Nearer is not possible: the transmitter's vias and tracks take the space above the pin. |
| 104 small parts stood with one pad solid in the ground fill and the other on a thin track (tombstoning). | Thermal spokes at the pads of all 0402 and 0603 parts. |
| Vias under solder paste: 9 of 25 in the MCU's exposed pad, all in the PHY's and the Wi-Fi module's ground pads, one in a capacitor pad. | None now. |
| The four inductor footprints were marked as through-hole parts. A placement export for surface-mount parts only would have left them out (this project's export did not). | Marked as surface-mount. |
| LED pads 0.25 mm from the milled windows, with an outline tolerance of 0.2 mm. | Pads 0.1 mm shorter: 0.3 mm and more. |
| TVS of the DC input: 45 V at its rated current against the converter's 40 V. | SMBJ26A (since replaced by an SMBJ28A, see "Power"). |
| Silkscreen text of 0.9 mm; the marker `JLCJLCJLCJLC` for an order number that JLCPCB stopped printing in May 2026. | Text 1.0 mm; a field for JLCPCB's serial number. |
| No stack-up in the board file. Part counts and bus lengths in these documents were out of date. | Added and corrected. |

Looked at and left as it is:

- The flash's supply pin has its 100 nF 5.3 mm away. Below the pin run the
  data-out and chip-select tracks, beside it lies the flash's body; there is no
  nearer place on this side of the board.
- The seven RMII vias above the MCU cut one slot of 4 x 1.6 mm into the planes.
  Spreading them would take the fan-out of the MCU's upper edge apart.
- Teardrops. KiCad makes them only in its board editor, not from a script. The
  larger via pads do part of their job.
- The fourth core supply pin and the supply tracks at fine-pitch pins stay
  narrow (see "Layout rules used").

### Check before the first order

On 22 November 2026 the circuit was compared once more with the documents it
rests on, pin by pin, and the power path was calculated. The documents:
Espressif's hardware design guidelines for the ESP32-P4 (version 2.0 of
12 November 2026) and its datasheet (0.7), the schematic of the
ESP32-P4-Function-EV-Board (1.52), the configuration file of esp-hosted, and
the datasheets of every IC, the jack, the PoE module, the diodes, fuses,
inductors and crystals. Nothing was built or measured.

| Finding | Change |
|---|---|
| PN532: its footprint had solder paste over the whole exposed pad and one more opening on each of the four thermal vias in it, on both sides of the board. The solder would have run into the four holes, and the order would have carried a paste layer for the side without parts. | Eight paste windows around the vias, none on a hole, on the component side only. A test now reads the footprint library for paste on plated holes. |
| NFC matching: these notes called the fitted values safe for any loop from 1.0 to 1.3 uH. That holds for exact part values; with the 5 % parts fitted it holds from 1.12 to 1.22 uH. | No part changed then: the values were right for the loop expected (1.2 uH). The simulation below found a larger loop and changed them. |
| Plugging in a live 24 V supply: these notes said the TVS keeps the converter's input below 40 V. That rested on a current of 11 A at most. The three input capacitors (10 uF / 50 V) keep 1.35 uF each at 24 V by their maker's curve, and simulated with that curve the input reached 41 to 45 V, with up to 19 A in the TVS, for 3 to 10 m of ordinary installation wire. | C112, C113 and C117 are 2.2 uF / 100 V X7R in the same size: 38 V at most. Figures and what it costs in "Power". (The 47 uF electrolytic C120 since added, see "Power".) |
| USB port while another supply runs the board: the bleed resistor holds the unplugged port below what a USB-C host accepts only as long as the OR-ing diode leaks no more than the typical one at 75 °C. | No part changed. Figures in "Power", a check with the reader warm in the bring-up plan. (The OR-ing diode since replaced by the eFuse U105, see "Power".) |

Checked and found right, beyond what the first review lists:

- ESP32-P4: all 105 pin numbers of the symbol against the datasheet's table.
  Every supply pin has the capacitors the guidelines ask for (10 uF and
  100 nF at the supply of the regulators, of the converter control, of the low
  power domain and of the battery pin; 100 nF at every IO supply, at the analog
  supply and at each of the four core pins with 10 uF at the first; 1 uF at
  each regulator output; 10 nF, 100 nF and 4.7 uF at the USB PHY). Reset: 10 k
  and 1 uF, the values the guidelines have named since July 2026. Straps: GPIO35
  high through 10 k and low through the button, GPIO36 high through the 1.5 k
  that is fitted on both versions (download mode needs it high), GPIO34 high
  through 10 k (it has no pull resistor of its own), GPIO37 and 38 free. The
  PHY's inputs on GPIO34 and 35 have no pull resistors that could fight these.
  Crystal: 9 pF load, 10 ppm, with 12 pF on each side.
- Core converter: pinout, 2.2 uH, 22 pF across the upper resistor, and two
  22 uF at the output, which is what TI's table names for outputs below 1.2 V
  (Espressif's board has one). The inductor saturates at 2.3 A, below the
  converter's own limit of 3 A, and far above what the core draws.
- The Wi-Fi module's pins against its datasheet; its SDIO pins are fixed, and
  so are the MCU's for slot 0. esp-hosted lists exactly this pairing for the
  P4 (command 44, clock 43, data 39 to 42). It takes any pin for the reset
  once its board preset is off; the preset it picks by itself is Espressif's
  board, with other pins (see [firmware-port.md](hardware/touch-p4/firmware-port.md)).
- The PHY against its datasheet and Espressif's board: straps, address 1, the
  clock output tied to the clock input, the unused pins (its pin 21 is an
  output). The jack's LEDs: anodes on pins 11 and 13, as wired.
- PN532: interface select (I0 high, I1 low is I2C in NXP's application note;
  the datasheet's table alone can be read the other way round), the supply
  scheme with the chip's own regulator feeding the analog and the transmitter
  supply, reset threshold (0.9 of the 3.3 V supply, although the chip runs
  from 5 V), crystal load. The matching network recalculated: the table in
  "NFC" is right.
- The three converters, the backlight driver, the IO expander, the level
  shifter, the three sensors, the USB protection and the PoE module against
  their datasheets: pin numbers, values, voltage ratings of the capacitors
  around them.
- Currents. With everything on at once (which the firmware never does) the
  5 V rail carries 1.5 A, 7 W: the 3.3 V converter then delivers 1.1 A of its
  2 A, the DC converter 1.5 A of 2 A, and the PoE module is below its 9 W. The
  OR-ing diode fitted then dissipated 0.6 W. The ideal diodes that replace it
  (see "Power") dissipate about 0.04 W in each IRLML0030 at 0.9 A. The DC input then draws 0.75 A at 12 V. Its fuse
  holds 1.1 A at 25 °C and 0.7 A at 60 °C, so it is the tightest part of the
  chain: fine for the 4.5 W peak these notes assume (0.5 A), no margin for
  7 W in a warm case.
- Start-up: the 3.3 V converter starts at 3.5 V on the 5 V rail and ramps for
  4 ms; the reset pins of the MCU and of the Wi-Fi module follow 14 ms later;
  the core runs from the chip's own regulator until the firmware switches the
  converter on. Backlight, LEDs, buzzer and PN532 are held off by resistors
  until then. (Since changed: the 3.3 V converter is a TLV62569 and the
  supervisor U204 holds the MCU in reset for 120 to 280 ms, see "Power".)
- Pin map: no GPIO is used twice, the four USB pads are respected (GPIO26, the
  backlight, is one of them; Espressif's board uses it for its backlight too),
  the Ethernet signals are on pins the MAC can reach without the GPIO matrix.
- Manufacturing files: drill table (smallest plated hole 0.2 mm, smallest
  unplated 0.6 mm, slots 0.8 and 1.0 mm wide), stack-up in the job file, and
  the paste layer of the display side, which is empty now.

Looked at and left as they are:

- The core converter's divider had 510 k twice where Espressif's guidelines
  say 499 k "must be populated". Changed to 499 k in the industry review
  (see "Industry review" below).
- The 100 k from the converter's enable input to ground is not in Espressif's
  circuit. It only matters while the chip does not drive the pin.
- The SDIO lines have a series resistor in the clock only. The guidelines ask
  to reserve one in every line; Espressif's own board has none.
- Rails without a test point: the two regulator outputs of the MCU (flash,
  PSRAM), the PN532's 3.0 V, the PHY's 1.1 V, the outputs of the DC converter
  and of the PoE module, the backlight. The bring-up plan names a capacitor or
  a diode to measure each at; a test point each would need room near the MCU
  that the board does not have. (Since review stage 3 all of them but the
  PSRAM supply and the PHY's 1.1 V have a small test point.)

### Simulation

On 24 November 2026 the routed board was simulated where a simulation can
answer. The copper is read out of the board file and the part values out of
the circuit description, so the figures are for this layout, not for a
textbook one. The scripts are in `sim/` and run as the `simulate` target, which
fails when a limit of a part is missed; [simulations](hardware/touch-p4/simulations.md) says
what each one models. Two field solvers were written for it (inductance and
field of tracks and copper areas; impedance of a track in the layer stack).
Both are checked against closed-form results on every run. The circuits run in
ngspice, and the Wi-Fi antenna in openEMS, a full-wave solver (the
`simulate-antenna` target). Nothing was built or measured.

Cross-checks against independent references (run with every `simulate`, or
worked by hand where noted):

| What | Model | Reference | Agreement |
|---|---|---|---|
| NFC loop in free air | 1.269 uH (`sim/peec.py`, the routed loop) | 1.239 uH by the modified Wheeler formula and 1.313 uH by the current-sheet expression for square spirals, Mohan, Hershenson, Boyd and Lee, IEEE J. Solid-State Circuits 34(10), 1999, eqs. 1 and 2, tables I and II, typical error 2 to 3 %; the 35 x 37 mm loop taken as a square | +2.4 % and -3.4 %, inside the formulas' own error and the square approximation |
| Inductance and field of a single loop, a loop in a shorted ring, a loop over a plate | the same solver | Neumann's double integral and the closed forms in `sim/test_solvers.py` | within 1.5 % (210.6 against 210.5 nH for the loop alone) |
| Impedance of the USB pair and the Ethernet lines | `sim/field2d.py` on the routed cross-sections | JLCPCB's impedance calculator for the stack-up, and TI's closed form (SNLA187) | within 1 ohm of the calculator (table in "Impedance") |
| Stripline between two planes | `sim/field2d.py` | Cohn's closed form with the thickness correction | 53.8 against 54.3 ohm |
| Voltage drop on supply tracks | `sim/irdrop.py` | Ohm's law on made-up nets: track, via and track in series; two tracks side by side | equal to 0.1 % (51.1 mohm) |
| Heat in the closed case | `sim/thermal.py`: the board's mean rise, PoE, typical use, +30 K | by hand: the 3.4 W leave through the board's faces with the model's surface coefficients (6.9, 5.1 and 4.2 W/(m2 K) for the display side under the LCD, the display side beside it and the component side) over the board's 0.0107 m2 (the LCD covers 0.0057 m2 of it): 3.4 W / 0.11 W/K = 31 K | within 3 %; the textbook coefficients themselves are what the stated +-40 % is for |

| Finding | Change |
|---|---|
| NFC loop: 1.25 uH on the board and 1.20 uH on a metal wall, where these notes expected 1.1 to 1.25 uH. The pours around the loop are open on one side and take only 2 %. Together with the loop's own 2.4 pF that put the fitted matching, calculated for 1.2 uH, at the edge of its range: 3.8 Vpp at the receiver input against a limit of 4 Vpp, above it on 45 boards in a hundred with the parts' tolerance, and the transmitter above 100 mA on five. | Parallel capacitors C515 and C519 10 pF instead of 18 pF, receive divider R506 3.9 k instead of 2.7 k: 41 mA and 1.9 Vpp at 1.25 uH, 35 mA and 1.2 Vpp at 1.20 uH, and no board in a hundred outside either limit. Figures in "NFC". |
| The mounting screw beside the NFC loop stands in the gap that keeps the copper around the loop from being a shorted turn. The ground pours ran under its head and under the insert on the other side, on both sides of the gap, with only solder mask in between. Metal across the gap takes the loop from 1.25 to 1.03 uH. | No copper pour on the outer layers within 3.3 mm of that hole. |

The board was built again by the generator for these two changes. Every track
and via is where it was; three part values and 16 mm2 of pour on each outer
layer differ.

Simulated and found right:

- DC input, a live 24 V supply plugged in: 35 to 38 V at the converter for
  the cables of the table in "Power" (38.1 V and 8.6 A in the TVS with 5 m of
  1.5 mm2), 39.9 V from a 26.4 V supply. This second, independent model agrees
  with that table within 1.5 V. The filter capacitor in front of the inductor
  (C117) sees more, up to 43 V; it is a 100 V part. (Since then the 47 uF
  electrolytic C120 damps the input, see "Power".)
- Power-up from USB: the 3.3 V rail is up after 3.8 ms. The MCU's reset input
  is at 0.53 V then and passes 0.83 V, the highest level it still takes for
  low, 1.1 ms later; the chip asks for 50 us. On a weak port (4.5 V behind
  0.5 ohm) the 5 V rail runs at 3.8 V, the least the 3.3 V converter works
  from: enough, with nothing to spare. Plugging in draws 7.5 A for some
  microseconds, into about 50 uF where the USB standard allows a device 10 uF.
  Ports stand that; it is one more reason why this is a service port. (Since
  changed: the eFuse U105 ramps the 5 V rail, and at plug-in the port sees
  C101's 10 uF only, see "Power".)
- Track impedance on this layer stack, 0.15 mm track with the ground fill
  beside it: 49 ohm on the outer layers, 46 ohm on In2 (5.7 and 7.0 ps/mm).
- Reflections on the fast lines, with the routed lengths. The lines with a
  series resistor (RMII clock and receive lines, SDIO clock, display clock)
  show none. The lines without one (RMII transmit, SDIO data and command, 40
  to 48 mm) overshoot by 0.13 V at the MCU's default drive strength, and by
  0.6 to 0.8 V at the strongest, where the level then swings back to 3.0 V.
  The firmware must leave these pins at the default strength or below
  ([firmware-port.md](hardware/touch-p4/firmware-port.md)).
- Supply tracks with everything on at once, 1.5 A on the 5 V rail: 0.13 V lost
  at most, at the far LED row, and no track of the outer layers carries more
  than the current for a 20 K rise. The USB input's 1.5 A runs through 13 mm
  of inner layer 0.62 mm wide, more than the rule for a free inner track
  allows; this one lies 0.1 mm from a plane that takes its 70 mW.
- SDIO link to the Wi-Fi module (the C5, routed again on 26 November 2026):
  all six lines are 40.3 mm from pad to pad. The clock arrives 0.59 ns after
  it leaves the MCU, the data lines 0.41 to 0.42 ns, so they stay within
  0.18 ns of each other: the clock's 22 ohm and the module's input slow it,
  not its length. Clock out and data back take 1.01 ns. After a module that answers within the 14 ns of the SD
  standard that leaves the MCU 10.0 ns at 40 MHz and 5.0 ns at 50 MHz. The
  board is not what limits this link (see "Wi-Fi and Bluetooth").
- Wi-Fi antenna, in a full-wave model (`sim/wifi_antenna.py`, the
  `simulate-antenna` target; rerun on 25 November 2026 for the C5-MINI-1).
  The module's antenna is not published, so a dual-band stand-in of the same
  size and kind (an inverted F with a 2.4 GHz arm and a 5 GHz arm) was tuned on
  a small evaluation board to 2.429 and 5.440 GHz and then put on this board
  unchanged, in the C5's place and at Espressif's position 3 for comparison:
  on the board, with the display, in the printed case, with a metal wall
  behind and with a face plate of aluminium, with and without a window. The
  table and what follows from it are in "Wi-Fi antenna". In short: in the case
  with the display the stand-in radiates -3.0 to -4.1 dB of the power fed in at
  2.4 GHz and -2.5 to -4.0 dB at 5 GHz, within 3 dB of position 3 in every
  channel; a closed aluminium face plate costs up to 1.9 dB more at 2.4 GHz.
  The absolute figures are the stand-in's, not the module's.
- Supply impedance at the MCU, the board without the chip's package: above
  30 MHz the core rail looks like 1.1 nH (2.4 nH for one pin alone), a pin of
  the 3.3 V rail like 1.2 nH. That is about what a package of this kind adds
  per pin itself, so the capacitors' distance (see below) does not stand out.
- NFC field, averaged over a card held parallel to the reader: 4.1 A/m at a
  card that lies on the case, 3.3 A/m with the reader on a metal wall. ISO/IEC
  14443 wants 1.5 to 7.5 A/m at the card. The field falls to 1.5 A/m 19 mm in
  front of the case (15 mm on a metal wall): up to there a card that needs
  the standard's full minimum is powered. Most cards need less and are
  powered further out; whether the reader still hears their answer there is
  not in the model. More range, if the first board wants it: the transmitter
  runs at 41 mA of its 100 mA, so the matching has room (bring-up plan).
- PoE isolation: the shortest way from 48 V copper to any other copper is
  2.01 mm along a layer and 2.02 mm through the board, at the jack's pin 10 on
  every layer; nowhere does 48 V copper lie over or under other copper. In air
  2.0 mm stand a peak of 3.0 kV (IEC 60664-1); the 1500 V RMS test reaches
  2.1 kV. Not in this figure, because they are inside parts: the 4.5 mm
  between the pads of C102 (1.8 mm until the industry review), the PoE
  module's own barrier, and the 0.5 mm
  between the jack's pin 9 and the display's metal back, which the polyimide
  tape has to hold (see "PoE isolation").
- Heat in the closed case, estimated within 40 % (textbook figures for still
  air, rise over the room):

  | Supply | Typical use | Board | Warmest spot | Display | Wi-Fi module: board under it, cavity | Everything on for a long time: board, LED rows, Wi-Fi module's board, cavity |
  |---|---|---|---|---|---|---|
  | USB | 2.5 W | +22 K | +33 K | +16 K | +27 K, +16 K | +39 K, +70 K, +48 K, +29 K |
  | DC, 12 V | 2.9 W | +26 K | +37 K | +19 K | +30 K, +19 K | +46 K, +75 K, +54 K, +34 K |
  | PoE | 3.5 W | +31 K | +40 K | +23 K | +35 K, +23 K | +52 K, +82 K, +60 K, +38 K |

  (Run again on 25 November 2026 with the C5, its converter and their
  places, and on 26 November 2026 on the board routed again for the SDIO bus,
  with the same figures but 1 K more at the LED rows on DC; with the C6 each
  case had 0.1 W less and up to 1 K less.) In a room of 25 °C
  typical use is far from every limit. In a room of 40 °C on PoE the estimate
  puts the display at 63 °C (limit 70 °C), the air around the PoE module at
  71 °C (85 °C) and the air right outside the Wi-Fi module between 63 °C (the
  cavity) and 75 °C (the board under it; limit 85 °C): inside the limits, for
  the display and the PoE module by less than the estimate is exact. The DC
  input's fuse then holds 0.66 A against 0.28 A drawn. The module's losses,
  the bounds and the transmit limit that follows: "Wi-Fi module:
  ESP32-C5-MINI-1". Everything on at once
  for a long
  time is beyond what the case can shed: the LED rows, on narrow copper
  between the cut-outs, get 70 to 80 K warmer than the room. The firmware
  limits the LEDs and watches the chip's temperature
  ([firmware-port.md](hardware/touch-p4/firmware-port.md)).
- Hall switch: 22 mT from the dock's magnet at the switch, 10.3 mm from its
  face, and still 16 mT with the weakest magnet, 4 mm off its axis and 40 K
  warmer; the switch needs 4.8 mT. Lifted off, it may switch after 9 mm and
  has switched for certain after 33 mm.
- Read again for the limits used: the PN532 data sheet (transmitter current,
  driver resistance, receiver input) and the LED's (its drawing shows the lens
  side; mounted upside down the pads are its mirror image, which is what the
  board has). All 82 footprints against JLCPCB's library after the change of
  the three part numbers: no problem.

What this does not say: whether pins and footprints are right (that is what
the reviews above are for), whether the flex of the display that gets bought
reaches (its length is a figure from a drawing; no model makes it more
certain), whether the reader hears a card at the edge of its field, how the
board does in an EMC test, whether the second-source PN532 behaves like the
original, and anything about firmware. The models use the makers' typical
figures. The list below stands, shorter in some points and with one more.

### Industry review

In November 2026 the design was graded against industry practice: schematic
readability, parts and parts list, layout, fabrication and assembly documents,
EMC and safety, verification. ERC and DRC were run, every sheet was rendered and
read, and the claims below were checked against their primary sources. The changes
are made in the generator, which stays the source of truth (see
[release.md](hardware/touch-p4/release.md)). The grading scale, what each grade asked for, the grades
before and after, and the decisions taken on the way are in [review.md](hardware/touch-p4/review.md).

| Finding | Change |
|---|---|
| Core converter: two 510 k in the feedback divider. Espressif's hardware design guidelines (v2.0, schematic checklist, chip revision v3.0 and later): "The two 499 kΩ feedback resistors and one 22 pF feedforward capacitor must be populated". | R204 and R205 499 k 1 % (UNI-ROYAL 0402WGF4993TCE, C25793). |
| C102 (across the PoE barrier) and C410 (shield to ground) were 1 nF / 2 kV parts. IEEE 802.3 §33.4.1 has the powered device stand 1500 V RMS for 60 s, or 2250 V DC for 60 s, or ten 1500 V 10/700 µs impulses (TI SLUA818; IEEE interpretation interp-3-0704). 2 kV is below the 2.1 kV peak of the first and below the second. | C102: certified X1/Y2 capacitor, Murata GA352QR7GF102KW01L (C91599), 2211 case, proof-tested at 2000 V AC for 60 s (2.8 kV peak), on a land pattern with 4.5 mm between the pads (Murata's test board). C410: 1 nF / 3 kV, Fenghua 1808B102K302NT (C967608). No 1 nF part of 3 kV or more is stocked in 1206 (checked at JLCPCB and LCSC on 25 November 2026). The PoE clearance rule no longer exempts C102. |
| Schematic: every part stood alone, joined to the rest only by labels; text overlapped in several places (U103's value over its pins, the jack's text over its pins, the PHY's top labels, a group title over another, the USB-C pin numbers over the pin names, the NFC antenna cut by the sheet frame). | Redrawn by a new generator (`scripts/bootstrap/sch_*.py`): wired blocks that read from left to right, supplies up and ground down, labels only between blocks and for buses. An overlap lint fails the build unless it finds nothing. KiCad's netlist of the redrawn sheets matches the circuit description pin by pin. |
| Symbols: D101, D103, D106 drawn as Zener diodes; U702 drawn as LIS2DE12, U703 as DRV5033, U701 as 74AHCT1G125, U104 as AP63203, U301 as MINI-1-N4. | Unidirectional TVS symbols; every symbol named after the fitted part (`make_lib.derived_symbols()`). |
| Capacitor values without voltage and dielectric. | Every capacitor shows its rating (for example `16V X7R`), the resistors whose tolerance matters (feedback divider, current sense, NFC tuning, PHY bias) theirs; the rating comes with the part number from the maker's code. |
| Title blocks without date; no revision history. | Date, drawn by, checked by, and the revision history on the root sheet. |
| The overlap lint saw labels and part fields only: a field over another symbol's pin name or number, over its own body or a label over a pin's text went through. The PN532 body was too narrow for its pin names. | The lint also takes every pin's name and number (as KiCad places them), the pin lines and the bodies, with 0.25 mm between texts; the build fails on any hit. Text widths were measured on KiCad's font. The PN532 is 63.5 mm wide with its top pins spread, its reference and value outside the body. Every sheet was rendered at 200 dpi and read block by block. |
| Parts lists with LCSC number and value only. | Every line carries manufacturer, part number, a full description (with rating and tolerance), an alternate and, for ICs and modules, the maker's lifecycle status (`scripts/bootstrap/parts_info.py`; [parts.md](hardware/touch-p4/parts.md) lists the sources). The display and the Wi-Fi antenna, which JLCPCB does not assemble, are in the parts lists too (the antenna since gone with the C5's PCB antenna). A test fails when a fitted part lacks these data. |
| No fabrication drawing, no netlist for the bare-board test. | `fab/jlcpcb/attractap-touch-p4-fab.pdf` (outline, dimensions, holes and cut-outs, stack-up, drill table, material, finish, IPC class, via fill) and `attractap-touch-p4.ipc` (IPC-D-356), both written by `export`. |
| 3D models for the display connector only. | A model for every footprint with a body (`kicad/lib/attractap.3dshapes/`, `scripts/bootstrap/collect_models.py`); a test fails when one is missing. |
| Supply OR-ing with three Schottky diodes: the 5 V rail sat at about 4.6 V, the diodes leaked back into an unplugged USB port when warm, and nothing limited the USB inrush. | USB through an eFuse (TPS259470A: soft start, 2 A limit, reverse blocking, lockouts), DC and PoE through ideal diodes (LM74700-Q1 with IRLML0030); see "Power". |
| 3.3 V converter AP63203: no stock at LCSC or JLCPCB. | TLV62569 (the core converter's part), laid out as TI shows. |
| The 5 V rail now follows its source; its ceiling was not stated against what the 5 V loads stand. | Table in "The 5 V rail's ceiling"; the eFuse's OVLO with a 0.1 % divider opens between 5.53 and 5.74 V. |
| DC input: the TVS clamps 45 V at its rated current against the converter's 40 V; which surge test applies was not stated. | Standards worked out (EN 301 489-1: none on DC power ports; EN 50130-4: line to earth through 42 ohm); a bidirectional TVS at the connector and a 100 V reverse-polarity diode; `sim/dc_surge.cir`: 39.6 V at most at the converter. |
| 3.3 V rail: about 76 uF effective at 3.3 V on a converter that TI has proven up to 52.8 uF. | About 49 uF: one 10 uF at the converter, 10 uF at the Wi-Fi module, 4.7 uF at the proximity emitter; a test adds it up. Since the C5: 44.5 uF, the Wi-Fi module on a converter of its own with 47.2 uF, its own capacitors counted; a test for each rail. |
| DRC run with lowered severities (50 warnings at KiCad's defaults). | KiCad's default severities, no rule switched off or lowered: 0 errors, 0 warnings, 0 unconnected. Silkscreen cut back from pads and board edges in the generator; fiducials with a copper keep-out; 3 mm PoE spacing everywhere. |

#### Land patterns against the makers' drawings

`check-footprints` compares every footprint with JLCPCB's library, the same EasyEDA
source most of them were converted from. The critical ones were also measured against
the makers' own drawings (pad tables read from the footprint files by a script; the
drawings' figures, in the PDF's vector graphics where the text gave no number).
Tolerance used: within 0.05 mm is a match; a pad longer or shifted by up to about
0.2 mm with the terminal still covered is an acceptable deviation; a wrong pitch, pin
order or hole position is a defect.

| Part | Document | Result | Change |
|---|---|---|---|
| U201 ESP32-P4 (QFN-104, 0.35 mm) | Datasheet v0.7 fig. 6-1 (package); Espressif's KiCad footprint `ESP32-P4.kicad_mod` (espressif/kicad-libraries, 2025-10-07), as neither datasheet nor guidelines give a land pattern | Pitch, count, pin 1 and numbering match (worst 0.005 mm). The converted pads were 0.15 x 0.65 mm, 0.125 mm further out than Espressif's 0.20 x 0.65 mm, and stored partly turned, partly with width and length swapped | Espressif's 0.20 x 0.65 mm from 4.55 to 5.20 mm off the centre, mask margin 0.025 mm (web 0.10 mm). The eight corner pads end 0.04 mm earlier on the inside: 0.163 mm across each corner, where Espressif's pattern has 0.113 mm and JLCPCB asks for 0.15 mm between pads. The converter had rounded the pad positions to 0.01 mm (gaps of 0.14 mm in places); every pad now sits on the 0.35 mm grid (`make_lib.p4_signal_pads`) |
| U105 TPS259470A (VQFN-10 RPW, 2 x 2 mm) | TI SLVSFC9C, RPW0010A package and example board layout | The converted pads are TI's polygons, drawn with a 0.1 mm outline that adds 0.05 mm of copper all round | Outline removed: the copper is TI's land (`make_lib.custom_pad_strokes`) |
| U301 ESP32-C5-MINI-1 | Datasheet v1.4 fig. 11-1 (read at 300 dpi), pin layout fig. 3-1 | 60 pads 0.40 x 0.80 at 0.85 mm, 15 per side, first to last 11.90, rows 14.00 apart centre to centre; corner pads 62 to 65 0.80 x 0.80 at the row crossings; nine ground pads 1.20 mm at 1.65 mm (4.50 overall; the drawing writes the pitch as 1.7), centred on the module; antenna area 5.85 mm, its boundary 7.75 mm above the pad centre, the module's lower edge 7.70 below it; numbering from pin 1 at the top of the left side, counter-clockwise, 46 to 60 along the antenna edge: all match within 0.05 mm. The drawing chamfers one ground pad as a pin 1 mark; the footprint's is square | none |
| J101 USB-C TYPE-C-31-M-12 | HRO drawing 2020-12-08 | Pitch, pin order, signal pads, locating holes and shell slot positions match. **The four power pads were polygons with a 0.1 mm outline: 0.70 x 1.40 mm in copper, 0.10 mm from VBUS to GND** where the drawing has 0.20 mm. Pads 0.19 mm further back than drawn and shell slots 0.2 mm wider: acceptable | Power pads 0.6 x 1.3 mm (`make_lib.usb_c_power_pads`); the DRC exception that allowed 0.09 mm at J101 is gone |
| J102 PJ-002A | Same Sky datasheet rev 1.05 | Terminal positions, slots and orientation match | none |
| J103 WAGO 250-202 / 2601-3102 | WAGO data sheets 250-202 (2019-05-01), 2601-3102 (2022-08-15) | Pitch 3.5, rows 5.0 and outlines match; pin 1 front right on both. Holes 1.2 mm suit the 2601 and are 0.1 mm over the 250's maximum | none; check the hole fill on the first boards |
| J401 HY931147C | HanRun REV.A/1, mounting pattern | Signal and shield pins and pin 1 within 0.005 mm; large holes 11.40 against 11.43 mm; LED holes 1.10 against 1.02 mm | none |
| J601 FH12-40S-0.5SH(55) | Hirose FH12 catalogue (2016-11-01) | Pitch, span, fixing tabs and pin 1 match. Signal pads 0.25 mm, Hirose's stencil opening, against 0.30 mm copper | Copper 0.30 mm, paste 0.25 mm (`make_lib.fpc_signal_pads`) |
| U102 DP9900M / Ag9905M | SDAPO DP9900 series datasheet, section 4.1 (package and PCB footprint); Silvertel Ag9900 V3.5 figs. 3, 19, 23 | Pads 1.25 x 4.0 mm, 2.54 mm pitch, groups 13.56 apart (SDAPO 13.57), rows 14.00: SDAPO's pattern within 0.01 mm; Silvertel's pins within 0.03 mm. **The keep-out under the module was not Silvertel's stepped 3 mm band** | The band of fig. 23, free of copper on every layer (stage 3, with the 3 mm isolation) |
| U501 PN532 (QFN-40) | Tokmas datasheet (Dec 2025); NXP SOT618-1 reflow footprint (2022-11-25) | Pads 0.28 x 0.665 mm at 6.485 / 5.155 against NXP's 0.29 x 0.90 at 7.00 / 5.20: 0.24 mm beyond the body (NXP 0.50, IPC 0.30), acceptable; exposed pad fits both makers | none |
| U401 IP101GRI (QFN-32) | IC Plus datasheet R01 (2014); IPC-7351B nominal goals (toe 0.30, heel 0, side -0.04, as in KiCad's footprint generator) | Pitch, pin 1 and toe right; heel 0.10 mm short, acceptable; exposed pad 2.80 against 2.70 | none |
| L102 CKCSA4020-6.8uH (no JLCPCB footprint) | CENKER datasheet, recommended pattern | Pads 1.6 x 3.5 mm 1.6 apart against 1.4 x 3.7, 1.2 apart: the terminals are covered. Terminals along x: placement angle 0 (or 180), as the export writes | none |

#### Case fit against the 3D models

The board was exported with every part's model (`kicad-cli pcb export step`), placed
in the case design (`case/cad/attractap-touch-case.sc`: component side at `z_pf`,
X = 103 − x, Y = 79.15 − y in KiCad coordinates) and checked with SolidCraft's
interference and clearance checks against cap, dock, display frame and the LCD
module. Heights are the makers' where they give one.

| Part | Height above the board | Nearest case part | Gap |
|---|---|---|---|
| J401 RJ45 | body 13.95 max; shield springs at the mouth 15.21 ± 0.50 (HanRun HY931147C REV.A/1, side view) | dock plate, 13.9 mm from the board (`cav`), with a recess 0.8 mm deep under the jack and a window through it under the two springs | body 0.90 mm to the recess, 0.70 mm at its maximum; springs 1.70 mm to the wall behind the window, 1.14 mm at their maximum, 1.0 mm to the window's sides |
| U102 DP9900M | 13.35 ± 0.5 (SDAPO datasheet 4.1) | dock plate, with a recess 0.8 mm deep under the module | 1.35 mm, 0.80 mm at the maximum |
| J103 WAGO 250-202 | 13.2 (model) | dock plate | 0.70 mm |
| J102, J103 pins | 1.95 mm out of the display side | cap front wall | 0.44 mm |
| J401 pins | 1.45 mm out of the display side, unclipped | LCD module, 1.5 mm off the board | 0.1 mm; 0.5 mm clipped to 1 mm as the manual says |
| J101 USB-C | 3.25 | cap side wall | 0.63 mm |
| C120 47 uF electrolytic, 6.3 mm | 7.7 (model) | dock plate; cap side wall | 6.2 mm; 13.9 mm |
| Parts of review stage 3: D106, D107 (SMB), F102, U105, U106, U107, Q101, Q102, U204 | 2.4 at most | none within 3 mm | more than 3 mm |

Checked again on 25 November 2026 with the parts of review stage 3 (SolidCraft's
clearance check, 3 mm and 15 mm). C120 also keeps clear of the folded display flex,
which the case design does not model: its model (x 13.9 to 21.7, y 60.7 to 67.3)
ends 8.7 mm before the area the flex lies on (y 76 and beyond) and 10.8 mm left of
the flex tail's way to J601 (x 32.5 to 55.5); the fold itself is in the slot at
y 89.5 to 92.5, 22 mm away. The build stops if a part taller than a small passive
reaches into the flex area (`placement.check_flex_area`).

The dock's plate under the jack and the PoE module (25 November 2026). As first
drawn, the jack's two shield springs reached 1.3 mm into the plate and the module
stood 0.55 mm off it. Measured on the parts' models in the case: of the jack only
the two springs, 1.9 mm wide each at the jack's mouth, come closer than 13.9 mm to
the board; its body and the rest of the shield stay at 13.75 mm, the module at
13.3 mm. The plate now has a recess 0.8 mm deep under each part (1 mm wider than
the part all round) and, under the two springs, a window through the plate
(9.5 x 6.9 mm), so at the makers' maximum heights every part keeps at least
0.70 mm (table above). The lower pair of wall screws, the one that matches a
flush-mount box, stood under the springs; it moved 8.5 mm down, and the cable
opening below it lost 2 mm at its top edge to keep a web around the screws'
countersinks. The plate stays 2.2 mm thick in the recesses, prints without
supports on its back, and lies flat on the wall or the stand. The openings stand
47 mm from the proximity sensor's axis, whose light on the plate ends 8 mm from
it (`geometry.DOCK_OPENINGS`; a test checks the distance), and 56 mm from the
magnet's axis: the sensor's reading on the dock and the hall switch's
field (`sim/dock.py`: 22 mT, 16 mT at worst) are unchanged. The drilling template
in the installation manual shows the new screw positions and the openings.

Three of the converted models were placed off their pads by easyeda2kicad: the DC
jack by 8 mm, the USB-C receptacle by 2.2 mm and the display connector by 2.6 mm.
`collect_models.py` now moves each model onto its pads and holes (`model_fit.py`), and
a test fails when a model's pins miss the holes or its terminals the pads.

### Open: cannot be settled on paper

- **The display flex and the jack's pins.** They pull in opposite directions:
  the flex wants the display close to the board (2.0 mm at most by the
  drawing, +-0.4 mm), the jack's pins want it away (they are at least 1.45 mm
  long). At 1.5 mm with clipped pins each side has 0.5 mm. A second drawing of
  the same panel shows a flex 0.8 mm shorter, and panels from other makers may
  differ. A board cannot be repaired if the flex is short. Before ordering, lay
  the panel you will buy on a 1:1 print with a 1.5 mm spacer (first step of the
  bring-up plan), and measure how far the pins of a real jack stand out. If the
  flex does not reach at 1.5 mm, the fallback is the jack below the display
  (commit 74add084d has that board) with a case 19 mm longer.
- **Decoupling at the MCU.** 4 of its 21 supply pins have a capacitor
  within the review's target (3 mm of copper for the core, memory and
  regulator pins, 5 mm for IO); the others reach theirs through vias and the
  planes (see "Decoupling and crystal at the MCU"). Simulated, the board's
  share of the way from a pin to its capacitors is 1.2 to 2.4 nH, about what
  the package adds itself. If the MCU proves unstable at full clock speed,
  this is the first suspect; see "Accepted deviations" for why revision A
  stays single-sided and what a later revision can do.
- **NFC range and tuning**, the second-source PN532, and the effect of the
  Ethernet plug and cable next to the loop on the lan version. The loop's
  inductance is simulated (1.25 uH on the board, 1.20 uH on a metal wall), not
  measured. With the values fitted every board is sure to stay inside the
  transmitter's limit between 1.12 and 1.25 uH, and 99 in a hundred between
  1.08 and 1.27 uH. The field is simulated too: it powers a card up to 19 mm
  in front of the case (15 mm on a metal wall). What no model here says is
  how well the reader hears the card.
- **Wi-Fi antenna and range.** The antennas are chosen and the case has a
  bay for one, with the cable's way drawn (see "Wi-Fi antenna"); whether the
  certified antenna fits it waits for its drawing. The antenna model above was
  made for the module with PCB antenna and says nothing about an antenna in
  the bay. Compare the first reader with a current one (bring-up plan).
- **Isolation of the PoE side** under a 1500 V test (see "PoE isolation").
  The board's copper keeps 2.0 mm everywhere, measured on the routed board,
  which is enough in air for that test. What a test has to show is what lies
  inside parts and in the assembly: the module, C102, and the tape between
  the jack's pin 9 and the display.
- **Heat.** The estimate above has the reader inside its limits in typical
  use, with little to spare on PoE in a room of 40 °C. Measure it: closed
  case, on the wall, after an hour (bring-up plan). If it is warmer than
  estimated, the LEDs and the backlight are what the firmware can take back.
- **Tamper sensors.** What the proximity sensor reads on the dock and off it,
  with docks of the colours in use, and whether light on the case moves that
  reading. Whether the hall switch turns on and lets go at the distances
  calculated (simulated again: on for certain on the dock, off after 9 to
  33 mm of lift), whether the dock's magnet changes the buzzer's sound, and which
  accelerometer thresholds tell a knock from a door closing.
- **Hot-plugging a 24 V supply.** By simulation the converter's input stays
  below 35 V, against its limit of 40 V, now that the 47 uF electrolytic C120
  damps the input (see "Power"). The figure is from a model, so measure it on
  the first board, with a few metres of thick wire to a stiff supply
  (bring-up plan).
- **The USB port on a warm reader that runs from another supply.** R104 holds
  the unplugged port's VBUS near 0 V against the few microamps the eFuse U105
  leaks back (see "Power"). Check on the first board, warm, that a USB-C host
  still switches its supply on (bring-up plan).
- **The 3.3 V converter's stability.** The rail's capacitors come to about
  49 uF effective, at the upper end of what TI has proven stable for the
  TLV62569 (see "Power"). A load step on the first board, with and without
  the feed-forward capacitor C108, shows the margin (bring-up plan).
- **What the power budget assumes.** It relies on the firmware keeping the
  LEDs below 100 mA together and beeping only while the NFC field is off, and
  it assumes 60 mA for the display panel's 3.3 V supply (see "Power"). Measure
  the panel and check both firmware limits on the first board (bring-up plan).
