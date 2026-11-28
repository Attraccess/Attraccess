# Design
<!-- llms-description: The current Touch P4 board design and the reason for each choice: mechanics, power, PoE isolation, NFC, Ethernet, Wi-Fi, tamper detection, ESD and layout. -->

What the board is and why, one section per block, for hardware developers. The targets the design is measured against
are in [Design standards and review criteria](hardware/touch-p4/review.md); where the board falls short of one, see
[Known limitations](hardware/touch-p4/limitations.md).

Coordinates on this page: KiCad top view of the component side, origin top left of the board, x right, y down,
millimetres. The user looks at the other side.

## Decisions

| Block | Choice | Reason |
|---|---|---|
| MCU | ESP32-P4NRW32X (chip, silicon v3.x) | Display performance. The P4 has no radio |
| Wi-Fi and Bluetooth | ESP32-C5-MINI-1-N4-V1.2 over SDIO, running esp-hosted | Wi-Fi 6 on 2.4 and 5 GHz, certified module with its own PCB antenna, stocked at JLCPCB |
| Wi-Fi antenna | the module's dual-band PCB antenna, over a cut in the top edge | Nothing to buy or fit; covered by the module's certificate |
| Display | commodity 4.0" 480 x 480 RGB panel (ST7701S, GT911) | Size and resolution of today's readers; MIPI panels of this size cost several times more |
| NFC | PN532 on the board, in its own zone below the display | Keeps the firmware's NFC stack. The LCD's metal back shields 13.56 MHz, so the loop cannot sit behind the screen |
| LAN/PoE | same PCB, parts left off on the wifi version | One design to maintain and certify |
| PoE | ready-made isolated module (SDAPO DP9900M-5V or Silvertel Ag9905M) | No transformer design |
| Supply | DC 12 to 24 V, PoE or USB-C onto one 5 V rail, each through a switch that blocks reverse current (eFuse for USB, ideal diodes for DC and PoE) | Any combination may be connected; no source feeds another; the switches drop almost nothing |
| DC connectors | barrel jack 5.5 / 2.1 mm and WAGO 250 push-button terminal in parallel | Plug-in supplies and bare wires both work. The terminal footprint also takes the WAGO 2601 lever terminal (13 times the price) |
| Ethernet jack | behind the lower right corner of the display, 51 mm above the lower board edge | A plug with boot and the cable's bend into the wall need 49 mm below the jack inside the case. Below the display the case would be 19 mm longer. Cost: the jack's pins stand out behind the display (see [Display mounting and flex](#display-mounting-and-flex)) |
| USB-C | service port at the board edge next to the MCU | Flashing and debugging only, never offered to users |
| Tamper detection | accelerometer, infrared proximity sensor looking at the dock plate, hall switch facing a magnet in the dock | Knocks and tearing off; off-dock from inside the closed case; a second, simpler off-dock signal. All on I2C |
| Assembly | all parts on one side | The display is taped to the other side; one assembly side is cheaper |
| Layers | six: signals on both outer layers and In2, each next to a plane of its own | Two signal layers are not enough around the MCU; on four layers the third signal layer cut the 3.3 V plane apart and left the fast buses without a return plane |

## Alternatives considered

- ESP32-S31-WROOM-1 (one module with Wi-Fi 6 and an Ethernet MAC): not stocked, preview support only in ESP-IDF.
- Waveshare ESP32-P4 module: no radio certificates.
- ESP32-S3: no speed gain over today's readers.
- ESP32-C5-WROOM-1: certified, but no variant stocked at JLCPCB or LCSC.
- ESP32-C5-MINI-1U / C5-WROOM-1U (external antenna): no published RED certificate for the MINI-1U; the WROOM-1U needs
  the corner laid out again and an antenna on top.
- ESP32-C5-MINI-1 variant -N8R2 (8 MB flash, 2 MB PSRAM): not at JLCPCB; the co-processor needs neither.
- Reader chips of the RC522 family instead of the PN532: radio front end only; the firmware would need a new driver
  including ISO 14443-4, and the board a new matching network.
- Splitting the board into a six-layer MCU board and a cheaper carrier: costs more at every quantity once the
  connector pair and second assembly are counted (figures in [Parts and sourcing](hardware/touch-p4/parts.md)).

## Mechanics

The 3D-printable case itself is described in [Case](hardware/touch-p4/case.md).

| Item | Position |
|---|---|
| Board | 86 x 143.5, corner radius 2, both bottom corners cut away |
| Strip above the display | y 0 to 7: the Wi-Fi antenna, two mounting holes |
| Wi-Fi module | x 20.1 to 35.5, y 0.3 to 21.6 (pad centre 27.8, 13.9), antenna up; its converter in the column left of it |
| Cut in the top edge under the Wi-Fi antenna | x 8.6 to 37.5, y 0 to 6.0; no copper on any layer for x below 50.5, y below 6.3 |
| Display cover lens (84.3 x 84.3) | x 0.85 to 85.15, y 7.0 to 91.3 |
| LCD module (metal back) | x 5.6 to 80.4, y 12.8 to 89.4 |
| Flex slot (behind the display) | x 33.05 to 54.65, y 73.3 to 83.8 |
| Ethernet jack | x 68.8 to 84.9, y 71.2 to 92.8, opens downwards into its cut-away. Pin rows at y 73.0 and 75.55, behind the display |
| Cut-away for the Ethernet plug | x above 69.5, y above 92.5 (16.5 x 51) |
| Cut-away for the DC plug | x below 12, y above 107.5 (12 x 36) |
| Tap tile (on the case) | centred at (43, 117), on the case's centre line; loop, LED ring and tile share this centre |
| NFC loop | 35 x 37, centre (43, 117), on the display side |
| LEDs | 16 on a square ring 21.4 from (43, 117) on every side (x 21.6 and 64.4, y 95.6 and 138.4), four per side at 5.35 and 16.05 from the side's middle, 10.7 apart along the ring; each in a 3.4 x 3.0 window with relieved corners, long side along the ring |
| LED supply | switch U705, level shifter U701 and the 100 uF C725 in a row between the flex slot and the ring's top side, x 36 to 58, y 84 to 93; the second 100 uF C726 between the DC cut-away and the ring's left side (x 12.6 to 19.2, y 110 to 117); the data line's carrier filter R709 (in the gap round the loop) and C727 at LED 6 (D707) |
| PN532 block | below the display, chip at (21.5, 80.1), transmitter pins down towards the antenna feeds |
| Mounting holes (3.2 mm) | (4, 3.5), (82, 3.5), (17.4, 140), (16, 122) |
| DC jack | x 0.2 to 9.2, y 93.6 to 108, opens downwards into the DC cut-away |
| DC terminal | centre (15.5, 100.2), wires enter from below at 40 degrees |
| USB-C | right board edge, y 13.5 to 22.5, opens sideways |
| Display ground pads (5 x 5, bare, display side) | (12.0, 23.5), (64.2, 37.2), (48, 17), (18, 36.5) |

### Display mounting and flex

Panel drawing used for the pinout: Hongxiangrui HXR040WQI-H401-R4018 (same pinout as the Waveshare
ESP32-S3-Touch-LCD-4). The mechanics come from a sample panel measured on 26 November 2026: glass 84.23 x 84.25 mm,
3.5 mm from the front of the glass to the metal back (the drawing says 3.14). The LCD module's outline matches the
drawing: the display frame printed from it fits the sample.

- The flex leaves the LCD module's bottom edge 1.9 mm above the lens edge, contacts facing away from the glass. The
  touch panel's own tail carries the touch controller and is soldered onto the main tail. Together they are stiff
  from just under the glass edge to about 13.5 mm past it (chip piece about 10 x 8 mm at x 15 to 25, its joint and a
  side tab of the main tail): no bend may cross that part. Beyond it only the plain contact strip continues, 20.4 mm
  wide, its stiffened contacts from 19.4 mm, its end 25.6 mm from the lens edge.
- The first layout ran the flex through a slot just below the module edge and round onto the component side. Both of
  its bends fall inside the stiff part, so that route does not work with the real panel.
- Now the flex folds 180 degrees round the module's bottom edge and lies flat on the metal back, which it does
  without strain (tried on the sample). The touch controller faces the board: 1.3 mm from the flex's underside to the
  chip's top. Past the stiff part the contact strip goes through a slot behind the display (x 33.05 to 54.65,
  y 73.3 to 83.8, centred on J601), in an S-bend onto the component side and into J601. The folded flex reaches
  25.6 mm from the lens edge; after the S-bend its end lies about 3.6 mm inside the connector's opening (y 72.3).
- The slot is 10.5 mm long. On the first print it was 3 mm (y 73.3 to 76.3) and the strip entered J601 at an angle;
  the longer slot lets it run in at a shallow angle. The stiff part's end (13.5 mm from the lens edge, read off
  photos, +-0.5 mm) now lies over the slot, which is fine: the stiff part rests on the metal back, not on the board.
  The slot allows that end anywhere from 7.5 to 18 mm.
- The board-to-metal-back distance is bounded by the chip (1.3 mm, plus 0.2) and the Ethernet jack's pins below, and
  by the S-bend's flex length above: **1.5 to 2.0 mm**. The case holds the display at **1.7 mm**.
- The case's display frame fills that gap: a 1.5 mm floor on the board, taped to the whole metal back with 0.2 mm
  double-sided tape, so the display rests on it when the screen is pressed. The floor is open over the flex area
  and along the module's bottom edge, over the four ground pads and over the jack's pins and the USB-C socket's
  tabs; the board clamps the frame against the cap's front wall (see [Case](hardware/touch-p4/case.md)).
- The Ethernet jack's pins stand at least 1.45 mm out of the display side (datasheet minimum pin length 3.05 mm, no
  maximum). Behind the metal back are pins 1 to 8, 11, 12 (signals, 3.3 V), one shield tab and one plastic post; the
  48 V pins 9 and 10 come out 0.8 and 2.1 mm beside it.
- So: **clip the jack's pins, tabs and posts to 1 mm** on the display side after soldering and put **polyimide tape**
  on the metal back over x 66 to 80.4, y 69 to 89.4, wrapped 2 mm round the module's side edge next to pin 9. At
  1.7 mm the clipped pins clear the metal back by 0.7 mm; unclipped they would clear it by 0.25 mm at best.
- After the fold and the S-bend the contacts face the board: J601 is a **bottom-contact** Hirose FH12-40S-0.5SH with
  its opening towards the slot. Panel pin 1 is on the right seen from the component side, so **connector pin k =
  panel pin 41 - k**; schematic and board account for it.
- On the component side the flex only covers the strip from the slot into J601 (`geometry.FLEX_KEEPOUT`, x 32.5 to
  55.5, y 66 to 84.5). Only parts up to 0.9 mm high stand there; `placement.check_flex_area` stops the build
  otherwise. On the display side it covers x 14.5 to 62.5, y 72.5 to 89.4 (`geometry.FLEX_BEHIND_LCD`); no ground pad
  lies there (a test checks it).
- The metal back is tied to board ground through conductive tape or foam on at least two of the four bare ground pads,
  which reach it through square holes in the display frame's floor, kept out of the mounting tape's area. Discharges onto the glass end up on the metal back.

Panel sources. The panel is a common type: 84.3 x 84.3 mm, 40-pin 0.5 mm flex, pins 16 to 33 are DB0 to DB17. The
board uses 16 data lines; pin 16 (blue LSB) and pin 28 (red LSB) are tied to ground. The drawing comes from the
datasheet Makerfabs publishes for its 4.0" display (maker Shenzhen Hongxiangrui); no shop lists the maker's model
number.

| Listing | Matches | Not confirmed |
|---|---|---|
| Elecrow DIS16804D, 4" square IPS 480x480, SPI+RGB, ST7701S | Outline, driver, identical 40-pin table. Comes on an HDMI driver board; the panel unplugs | Touch controller |
| Waveshare / Luckfox LF40-480480-ARK (SKU 27738) | Outline (84.2 x 84.2), GT911 | Pin table and driver |
| Panel of the Waveshare ESP32-S3-Touch-LCD-4 (current readers) | Pinout (from that board's schematic) | Flex length against this layout |
| AliExpress 1005005675144653 (SUNMAXIC), variant "Capacitive touch" | Same mechanical drawing and pin table | Touch controller; the "No touch" variant has no touch layer |

Measure the flex of the panel you will buy in volume. LCSC's 4.0" 480 x 480 panel (C17496207, Focus E40RC-FS1000-C) is
MIPI DSI on a 20-pin flex, 77 x 80 mm: it does not fit; using it would be a new display section.

### Enclosure interface

- **Wi-Fi antenna.** Keep metal off the strip above the display for x below 50.5: no screws, and a metal face plate
  only with a window over that strip (see [Antenna](#antenna)).
- **Bottom corners.** The Ethernet jack opens into the right cut-away (16.5 x 51), the DC jack into the left one (12 x
  36). Plugs and cables stay inside the board outline and go down or back into the wall.
- **Ethernet plug room.** What counts is the stiff part below the jack (body and boot, less the 13.5 mm inside the
  jack): 24 to 31 mm for common moulded patch cables (37 to 44 mm overall).

  | Cable | Bend radius (4 x diameter) | Stiff part may end below the jack: into the wall | Straight down through the bottom notch |
  |---|---|---|---|
  | Patch 5.5 mm | 22 mm | 31 mm | 49 mm |
  | Cat 6 patch 6.3 mm | 25 mm | 29 mm | 49 mm |
  | Slim patch 3.8 mm (28 AWG) | 15 mm | 37 mm | 49 mm |

  A normal patch cable fits either way; a slim one leaves the most room and carries the PoE current (below 0.3 A).
  Field-termination plugs on 7 to 8 mm installation cable (30 mm bend) fit the bottom exit only: end installation
  cable in a socket and use a short patch cable.
- **Jack pins on the display side** (x 68 to 86, y 71 to 88) must not be pressed on or touched by metal; pins 9 and 10
  (x 81.2 and 82.5) carry 48 V. Pin 9 is 0.5 mm from the LCD module's edge (its pad 0.1 mm), so no frame wall fits
  there: the tape is the insulation.
- **Depth.** Display side of the board 5.3 mm behind the case front (1.7 mm gap, 3.5 mm display, 0.1 mm recess).
  Behind the board 13.9 mm to the dock plate, with recesses and a window for the tallest parts (see [Case
  fit](#case-fit)).
- **DC.** The cut-away takes a straight 5.5 mm barrel plug up to 11 mm thick; check with the shipped supply's plug.
  The terminal (WAGO 250-202) uses two diagonal holes of its footprint (+ upper left, - lower right, printed on the
  silkscreen); wires enter at 40 degrees, out of the wall or up through the DC cut-away. The same four holes take the
  WAGO 2601-3102 lever terminal (wires at a right angle). No screw sits next to the DC jack: the housing must support
  the board there.
- **USB-C** is on the side edge behind the display and needs no housing opening if flashing is done before assembly.
- **Mounting holes.** No outer-layer tracks within 3.3 mm of a hole centre (screw heads or standoffs up to 6.6 mm). The
  fourth hole stood in the gap of the copper round the NFC loop at (66.3, 117) until the tap tile grew to about 44 mm.
  The case puts a boss of radius 3.7 round each hole. The tile's flange, flat on the display side, reaches 23.6 mm
  from the tile's centre (47.2 mm square, corners r 7). Right of the tile a boss clear of it needs x 70.3 or more,
  and the Ethernet cut-away leaves 66.0 at most for the 1.9 mm of board the other holes have; below the tile and
  between it and the display there is no room either. The hole is at (16, 122), between the tile and the DC
  cut-away (2.4 mm of board to the cut-away), level with an LED of the ring, clear of the ring's 5 V vias. Its boss
  stands in a notch of radius 3.9 in the flange, 0.2 mm all round. The third hole moved 0.6 mm towards
  the corner, to (17.4, 140), clear of the ring's lower left LED (1.9 mm of board to the lower edge). The lower right
  quarter of the board has no screw now: the tile's body, flat on the display side round the loop, holds it.
- **Buzzer** BZ701 fires sideways, towards the lower board edge (port on the side facing U701): leave an opening
  nearby.
- **LEDs** need a diffuser in front of the windows: the tap tile's white body. A channel 2.3 mm wide and 2.5 mm deep
  runs round the ring in the tile's back, over the windows, and leaves 2.8 mm of white ABS to the visible rim, which
  is 2 mm wide (20.4 to 22.4 mm from the tile's centre).
- **NFC.** No metal (screws, plates, shielded cable) inside or right behind the loop.

### Case fit

The board with every part's 3D model (`kicad-cli pcb export step`) placed in `case/cad/attractap-touch-case.sc`
(component side at `z_pf`, X = 103 - x, Y = 79.15 - y) and checked with SolidCraft's interference and clearance
checks. Heights are the makers' where given.

| Part | Height above the board | Nearest case part | Gap |
|---|---|---|---|
| J401 RJ45 | body 13.95 max; shield springs at the mouth 15.21 +- 0.50 (HanRun HY931147C) | dock plate at 13.9 mm, 0.8 mm recess under the jack, window (9.5 x 6.9) under the springs | body 0.90 (0.70 at max); springs 1.70 to the wall behind the window (1.14 at max), 1.0 to the window's sides |
| U102 DP9900M | 13.35 +- 0.5 | dock plate, 0.8 mm recess | 1.35 (0.80 at max) |
| J103 WAGO 250-202 | 13.2 | dock plate | 0.70 |
| J102, J103 pins | 1.95 out of the display side | cap front wall | 1.0 |
| J401 pins | 1.45 out of the display side, unclipped | LCD module at 1.7 mm | 0.25; 0.7 clipped to 1 mm |
| J101 USB-C | 3.25 | cap side wall | 0.63 |
| C120 47 uF, 6.3 mm | 7.7 | dock plate; cap side wall | 6.2; 13.9 |
| C725, C726 100 uF, 6.3 mm (LED supply) | 5.4 nominal; the maker's height tolerance not checked | dock plate | about 8; C726 (board point 15.9, 113.3, 0.6 mm from the DC cut-away) not yet checked in the case model |
| D106, D107, F102, U105, U106, U107, Q101, Q102, U204 | 2.4 at most | none within 3 mm | more than 3 |

- The recesses are 1 mm wider than each part all round; the plate stays 2.2 mm thick there and prints without
  supports. The lower wall-screw pair (flush-mount box spacing) sits 8.5 mm below the springs.
- The openings stand 47 mm from the proximity sensor's axis (its light ends 8 mm from it; `geometry.DOCK_OPENINGS`,
  checked by a test) and 56 mm from the magnet's axis.
- C120 keeps clear of the display flex: its model (x 13.9 to 21.7, y 60.7 to 67.3) ends 10.8 mm left of the flex's
  strip into J601.
- `collect_models.py` moves every converted model onto its pads and holes (`model_fit.py`); a test fails when a
  model's pins miss.

## Power

| Rail | Source | Loads |
|---|---|---|
| +5V | USB-C through eFuse U105; DC converter through ideal diode U107/Q102; PoE module through ideal diode U106/Q101 | both 3.3 V converters, backlight, LEDs, buzzer, PN532 |
| +5V_DC | AP63205 buck U104, 2 A, from the DC connectors | feeds +5V |
| +3V3 | TLV62569 buck U103, 2 A, from +5V | P4, PHY, sensors, panel logic, core converter U202 |
| +3V3_WIFI | TLV62569 buck U302, 2 A, from +5V, always on | Wi-Fi module U301 alone, with its EN RC and pull-ups |
| VDD_HP 1.1 V | TLV62569 U202 from +3V3, enabled by the P4 | P4 core |
| P4 internal LDOs | VDDO_FLASH 3.3 V, VDDO_PSRAM 1.9 V | flash, in-package PSRAM |

With two or more sources connected the highest one feeds the board; none feeds another, and an unplugged connector
stays at 0 V. The 5 V of the DC converter and the PoE module reach the IO expander through dividers (`DC_PRESENT`,
`POE_PRESENT`), so the firmware knows which sources are present.

### Power budget

"Sizing" is what the maker asks the supply to deliver; "maximum" is the highest consumption the maker states.

3.3 V rail (U103, 2 A; current limit at least 3 A):

| Load | Sizing (A) | Maximum (A) | Source |
|---|---|---|---|
| ESP32-P4, I/O, flash, PSRAM | 0.380 | 0.200 | HDG v2.0 1.3.2: "minimum operating supply current ... 380 mA (including flash and PSRAM)"; datasheet v0.7 table 5-7: 150 mA at 400 MHz dual core, plus 50 mA for flash/PSRAM access (W25Q128JV 25 mA max) |
| ESP32-P4 core through U202 | 0.196 | (above) | datasheet table 5-2: 0.5 A at 1.1 V; at 85 % |
| IP101GRI PHY | 0.045 | 0.045 | datasheet R05: below 0.15 W at 100BASE-TX full duplex |
| VCNL4040 emitter | 0.200 | 0.005 avg | 200 mA pulses at 1/40 duty or less |
| Display panel logic and touch | 0.060 | 0.060 | allowance, no datasheet figure; measured at bring-up |
| Jack LEDs, accelerometer, hall switch, IO expander, pull-ups, supervisor | 0.010 | 0.010 | LIS2DH12 185 uA, DRV5032 2.7 mA peak, TCA9554 0.6 mA |
| **Total** | **0.89** | **0.32** | headroom to 2 A: **55 %** / 84 % |

Wi-Fi rail (U302, same circuit):

| Load | Sizing (A) | Maximum (A) | Source |
|---|---|---|---|
| ESP32-C5-MINI-1 | 0.600 | 0.426 | HDG 1.3.2 "no less than 600 mA"; datasheet v1.4 table 6-2 IVDD 0.6 A; table 6-5: 802.11a 16.5 dBm 100 % duty 426 mA (338 mA at 2.4 GHz, table 6-4) |
| EN, IO28 and five SDIO pull-ups | 0.001 | 0.001 | |
| **Total** | **0.60** | **0.43** | headroom to 2 A: **70 %** / 79 % |

5 V rail (3.3 V converters at 88 %, rail at 4.75 V):

| Load | Sizing (A) | Maximum (A) | Source |
|---|---|---|---|
| U103 | 0.70 | 0.25 | above |
| U302 | 0.47 | 0.34 | above |
| Backlight (4S2P, 39 mA, AP3032) | 0.13 | 0.13 | 13 V at 39 mA, 85 % |
| 16 SK6812MINI-E | 0.33 (switch limit) | 0.21 (firmware limit) | 12 mA per colour, 0.58 A at full white, 1 mA idle each; the switch U705 holds the ring below 255 to 334 mA, the firmware all channels together at 192 mA or less (208 mA with the idle current) |
| PN532 | 0.12 | 0.12 | transmitter 100 mA (matching keeps it below 60 mA) plus 20 mA |
| Buzzer | 0.10 | 0 while the NFC field is on | MLT-8530 95 mA at 5 Vo-p; firmware beeps after the field is off |
| Level shifter, LED switch, bleed resistors | 0.003 | 0.003 | |
| **Total** | **1.85** | **1.05** | |

| Source | Rating | Headroom at maximum | Headroom at sizing |
|---|---|---|---|
| USB-C (eFuse limit) | 1.8 A minimum (R110 1.65 k) | 42 % | -3 % |
| DC converter AP63205 | 2 A | 48 % | 8 % |
| PoE module DP9900M-5V | 1.8 A to 70 °C (9 W), 1.2 A at 85 °C (6 W) | 42 % (13 % at 85 °C) | -3 % |

Before the LED switch, with the LEDs at 0.10 A (firmware) and 0.58 A (sizing): totals 0.94 and 2.10 A, headroom
at maximum 48 % (USB), 53 % (DC), 48 % (PoE; 22 % at 85 °C), at sizing -17 %, -5 % and -17 %.

- Each 5 V source keeps at least 30 % at the makers' maximum figures with the firmware limits (LEDs at 192 mA or less,
  0.21 A with their idle current; buzzer and NFC field not at once), except the PoE module above 70 °C: 13 %, an
  accepted deviation ([Known
  limitations](hardware/touch-p4/limitations.md#headroom-of-the-poe-module-when-hot-review-item-24)). Under those
  limits the sizing sum is 1.63 A, 9 % below the eFuse and PoE ratings.
- The firmware's LED limit is 192 mA because that is one colour on all 16 LEDs at full range: each LED drives a
  fixed 12 mA per colour and dims by PWM only, so a lower limit would cut the range of single colours. Mixed colours
  and white are scaled down to the same sum ([firmware rule 20](hardware/touch-p4/firmware-port.md)).
- Sizing counts the ring at the switch's highest current limit, 0.33 A: whatever the firmware sends, the ring cannot
  draw more (it drew 0.58 A at full white before the switch). At the full 1.85 A the eFuse and the PoE module run at
  their ratings and their own limits cover it, the DC converter keeps 8 %. Nothing is damaged. The sum also stacks
  figures that do not coincide (the P4's 380 mA next to its core's 0.5 A, emitter pulses, the C5's 0.6 A sizing
  against its 426 mA).
- The DC input's fuse (1.1 A hold at 25 °C, 0.7 A at 60 °C) is the tightest part with everything on: the DC input
  draws 0.75 A at 12 V at 1.5 A on the 5 V rail; in typical use at 40 °C it holds 0.65 A against 0.28 A drawn.
- Without firmware (MCU in reset) LEDs, backlight and buzzer are held off by resistors. The eFuse limits USB to 1.8 to
  2.2 A and opens below 3.9 to 4.0 V; the DC converter and PoE module limit themselves.

USB as the only source. A USB 2.0 port gives 500 mA, a Type-C source 500 or 900 mA at Default USB Power, more only
when its Rp says 1.5 or 3 A. When DC and PoE are absent the firmware always takes 500 mA: LEDs and buzzer off,
backlight at 30 % or less (an estimated 0.45 A with the 3.3 V rails at a typical 0.37 A and the radio receiving). The
CC level is not read (see [Known limitations](hardware/touch-p4/limitations.md)). The USB-only rule, the LED limit and
buzzer-or-NFC are hard firmware requirements ([Pin map and firmware port](hardware/touch-p4/firmware-port.md)), each
with a bring-up test.

### The 5 V rail's ceiling

The ideal diodes and the eFuse drop millivolts, so the 5 V rail follows its source.

| Source | Highest output | Reference |
|---|---|---|
| USB-C, compliant | 5.5 V | vSafe5V, USB PD R3.3 table 4.9; USB 2.0 VBUS Max Limit ECN |
| USB-C, faulty | 5.53 to 5.74 V, then the eFuse opens | OVLO below |
| DC converter AP63205 | 5.05 V (CCM), about 5.2 V in PFM at light load | DS41326 rev 3-2, figures 6 and 7 |
| PoE module DP9900M-5V | 5.25 V, about 5.5 V briefly at a load step | datasheet; +276 mV at 50-100-50 % step |

| Load | Recommended max | Absolute max |
|---|---|---|
| TLV62569 VIN (U103, U302) | 5.5 V | 6.0 V (SLVSDG1C 6.1, 6.3) |
| PN532 VBAT | 5.5 V | 6.0 V (PN532/C1 rev 3.6, tables 290, 291) |
| SK6812MINI-E VDD | 5.5 V | 5.5 V (spec rev B, 7 and 9) |
| SN74LV1T125 VCC | 5.5 V | 7.0 V (SCLS745D) |
| AP3032 VIN | 9 V | 20 V |
| Buzzer MLT-8530 | 4.5 Vo-p | not stated; R705 10 ohm in series keeps the coil (16 ohm +- 3) at 3.8 Vo-p at 5.74 V |
| LM74700 CATHODE, TPS25947 OUT | 60 V, 23 V | 75 V, 28 V |

eFuse divider R107 330 k, R108 29.4 k, R109 97.6 k, all 0.1 %; TPS259470A thresholds 1.183 to 1.223 V rising, 1.076 to
1.116 V falling (SLVSFC9C 6.5):

| | Nominal | Range |
|---|---|---|
| UVLO, rising | 4.32 V | 4.25 to 4.41 V |
| OVLO, rising | 5.62 V | 5.53 to 5.74 V |
| OVLO, falling (on again) | 5.14 V | 5.03 to 5.23 V |

Every compliant USB source passes; a faulty one is cut off within 1.2 us before the TLV62569 and PN532 reach 6.0 V. 1
% resistors would give 5.45 to 5.82 V and could cut off a compliant source. At 23 V on VBUS the divider puts 6.39 V on
EN/UVLO and 4.91 V on OVLO, below the pins' 6.5 V. Two cases come close: the LEDs reach their 5.5 V only with a USB
source at the top of vSafe5V and no cable load (the board drops at least 40 mV in cable, fuse and ferrite); the PoE
module's step response can lift the rail to about 5.5 V for a few hundred microseconds.

### Sources onto the 5 V rail

- **USB: eFuse U105, TPS259470ARPWR.** Slew 0.91 V/ms (C118 2.2 nF), current limit 1.8 to 2.2 A (R110 1.65 k),
  lockouts above. Blocks reverse current on and off: once OUT is 29 mV above IN it opens within 1 us and closes again
  when IN is 104 mV above OUT (50 us later). Pins 3 (AUXOFF), 4 (FLT) and 10 (ITIMER) are open, as TI's table 5-1
  allows; `test_new_ics_follow_their_makers_pin_tables` checks it.
- **DC and PoE: LM74700-Q1 with an IRLML0030 each.** 20 mV across the MOSFET, off within 0.45 us on reverse current.
  Gate 10.8 to 13.9 V above source (SNOSD17G 6.5), below the 15 V GATE-ANODE limit and the MOSFET's 20 V. About 45
  mOhm hot: 0.18 W at 2 A (18 °C rise at 100 °C/W), 0.04 W at the rail's 0.90 A.
- **Bleed resistors R104 (USB) and R105 (DC converter output), 4.7 k.** Against the eFuse's 4.86 uA reverse leakage
  and the ideal diode's 2 uA (both typical): 23 and 9 mV, where a USB-C host accepts 0.8 V. A factor of 30 for VBUS.
  Each costs 1 mA while its source is on.
- **Simulated** (`sim/powerup.cir`, `sim/switchover.cir`): both 3.3 V rails up 5.0 ms after a USB plug; 3.8 A for
  microseconds into C101 (10 uF, what USB 2.0 7.2.4.1 allows), then 47 mA while the eFuse ramps. Changing supplies
  with 0.9 A on +5V keeps +5V at 4.06 V or above, +3V3 at 3.30 V (supervisor 2.99 V), +3V3_WIFI at 3.29 V (module 3.0
  V). An unplugged source's input stays at 0 to 1 mV. Details in [Simulations](hardware/touch-p4/simulations.md).

### 3.3 V converter

TLV62569 (SLVSDG1C) U103 with 2.2 uH (Sunlord WPN4020H2R2MT, 4.3 A saturation), R111 100 k / R112 22.1 k: 3.315 V.

- **Output capacitance.** TI's table 4 proves 2.2 uH with up to 2 x 22 uF (+20 / -50 %); TI's E2E thread 980956 takes
  largest-proven plus 20 % as the limit: 52.8 uF effective. Every capacitor on the rail counts, including the PHY's
  behind its ferrite. With Samsung DC-bias data at 3.3 V (22 uF 0805: 13.69 uF; 10 uF 0603: 4.46 uF) the rail has 44.5
  uF, counting parts without data at full value: 10 uF at the converter (C109), 4.7 uF at the proximity emitter
  (C715). Checked by `test_3v3_converter_output_capacitance_is_in_tis_table`.
- **Feed-forward** C108 12 pF across R111: a zero at 133 kHz (TI's 6.8 pF with 200 k: 117 kHz). The loop crossover is
  not published; bring-up measures a 0.1 to 1 A load step with and without C108.
- **Current** 0.89 A at sizing, 55 % below 2 A.
- **Layout (TI 10.2).** VIN and FB face left, SW faces the inductor. C107 100 nF straight above VIN, C106 10 uF beside
  it; their ground vias and one under the converter close the input loop through In1, 0.2 mm below. SW reaches the
  inductor after 1.1 mm of 0.6 mm track. The divider sits below FB, away from SW, and senses the 3.3 V plane through
  its own via.
- **Supervisor** U204 (TLV803S, 2.93 V) holds the P4 in reset until the rail has been above threshold for 120 to 280
  ms.

### Wi-Fi module converter

U302: the circuit of U103 (TLV62569, WPN4020H2R2MT, R311 100 k / R312 22.1 k, 3.315 V, C306 12 pF) for the
ESP32-C5-MINI-1 alone.

- **Why its own.** The module asks for 0.6 A (HDG 1.3.2) and carries 33.4 uF on its 3V3 pin (datasheet v1.4 fig. 8-1:
  three 10 uF, three 1 uF, four 100 nF, one 10 nF). On U103 that would make 1.49 A at sizing (25.6 % headroom) and
  about 82 uF output capacitance, above TI's 52.8 uF.
- **Output capacitance.** C301 22 uF (13.69 uF at 3.3 V) and C302 100 nF at the module pin (Espressif's fig. 9-1) plus
  the module's 33.4 uF at full value: 47.2 uF, inside 52.8 uF; without the module's capacitors 13.8 uF, above TI's
  smallest proven value (`test_wifi_converter_output_capacitance_is_in_tis_table`).
- **Always on.** EN through R310 100 k from +5V, no switch (a module whose supply an IO expander switched did not
  start, esp-hosted issue 127). The EN RC (R301 10 k, C303 1 uF), IO28 pull-up R303 and SDIO pull-ups R305 to R309
  hang on this rail (`test_wifi_module_supply_is_always_on_and_carries_its_pull_ups`).
- **Power-up order.** Both converters start together from +5V (at 2.45 V, same soft start). The module's EN rises 13.4
  ms after its rail; the supervisor holds the P4 in reset 120 to 280 ms after +3V3, so no P4 pin drives the module
  before its straps are read. When +5V goes both rails fall together.
- **Layout (TI 10.2), column left of the module.** Turned 90 degrees: SW, GND, EN face up to L301, VIN and FB down.
  C305 100 nF straight below VIN, C304 10 uF beside it; their ground vias and one between the pad rows close the input
  loop through In1. C301's + pad faces the module's 3V3 pin 3, its ground pad the module's ground pins 1 and 2. The
  divider senses the rail at C302 (`routes_wifi.wifi_buck_routes`).
- **Measured on the routed board** (`scripts/layout_report.py`): C301 + pad 1.8 mm from the module's 3V3 pin and 3.2
  mm from L301's output; its ground pad 1.8 mm from the module's ground pins with a via 0.75 mm away, and 7.2 mm from
  U302's GND through In1. C301 sits nearer the module because the output loop carries the inductor's triangular
  ripple, not the chopped input current TI names as critical.

### Core converter

TLV62569DBVR U202, 3.3 V to 1.1 V, enabled by the P4. Must be this part number: Espressif lists the converters that
work, and ones with output discharge keep the P4 from waking.

- Divider R204, R205 499 k 1 % and 22 pF feed-forward: Espressif's HDG v2.0 checklist (chip revision v3.0 and later)
  says these "must be populated".
- 2.2 uH (saturates at 2.3 A, far above the core's draw), two 22 uF at the output, what TI's table names for outputs
  below 1.2 V.
- The 100 k from EN to ground (not in Espressif's circuit) matters only while the P4 does not drive EN.
- The core rail's pour on the back layer reaches from under the MCU to the second output capacitor C235, with three
  0.3 mm vias beside its pad; inductor-to-capacitor tracks are 0.6 mm. The fourth core pin (54, behind 0 ohm link
  R203) is fed by an 11 mm track of 0.2 to 0.3 mm on the back layer.

### DC input

For 12 V or 24 V supplies; 28 V is the most it stands continuously. Jack rated 24 V. AP63205 works to 32 V, stands 35
V continuously and 40 V for 0.4 s.

Chain from the connectors: PTC fuse F102 (1.1 A hold), TVS D107 (SMBJ28CA, bidirectional), reverse-polarity diode D105
(SS310, 100 V), C117 2.2 uF, electrolytic C120 47 uF, filter inductor L103, TVS D106 (SMBJ28A), converter input
C112/C113. Both TVS stand off 28 V and conduct from 31.1 to 34.4 V. A reversed supply stays below D107's stand-off and
D105 blocks it.

- **Hot-plugging** (`sim/dc_hotplug.cir`): cable inductance rings with the input capacitors; C120's ESR damps it. At
  24 V the converter sees at most 31.0 V (1.5 m thin cable), 27.6 to 29.1 V with thicker and longer cables; at 26.4 V
  34.7 V; at 28 V 32.6 V, no TVS current. Without C120: 38 V.
- **Which surge test applies.** EN 301 489-1 V2.2.3 asks no surge on a DC power port; EN 50130-4:2011 clause 13 (what
  access-control customers expect) applies the slow surge line to earth through 42 ohm; the PoE/Ethernet port gets 0.5
  kV line to ground for cables over 30 m indoors (EN 301 489-1 9.8.2.2). Reasoning and sources in [CE and market
  checklist](hardware/touch-p4/compliance.md).
- **Surge, simulated** (`sim/dc_surge.cir`, 1.2/50 us +-1 kV behind 42 ohm, applied across the input as a worst case,
  TVS at the top of their range, C120 -20 %, L103 saturated and not): the converter stays at 39.6 V at most (40 V for
  0.4 s), D105 sees 75 V reverse at most (100 V), the input TVS takes up to 22 A of 8/20 us (ST: 68 A). After the
  surge the converter's input dips (to 4 V at 12 V) because the test network's 1.5 mH rings with C120; the board may
  restart. Line-to-line 0.5 kV behind 2 ohm (IEC 61000-4-5 power-port test, not asked of this port) would need a 60 V
  converter and a larger TVS.
- **Input filter.** C117, L103, C112/C113 form a pi filter: 40 to 50 dB at the converter's 1.1 MHz (calculated). No
  common-mode choke: if the lab finds cable emissions above 30 MHz, a clip-on ferrite is the first remedy. The
  ceramics are 2.2 uF / 100 V X7R: 2.0 uF left at 12 V, 1.5 uF at 24 V (a 10 uF / 50 V part keeps 1.35 uF at 24 V and
  lets the input ring higher).
- The converter sits in the left column behind the display, above the DC connectors, away from the NFC loop.

### PoE input

- Nothing but the TVS may sit across the PoE input: extra capacitance breaks the detection signature.
- The module needs a minimum load (100 mA DP9900M-5V, 200 mA Ag9905M); the board draws more with the backlight on. A
  deep-sleep mode would need a dummy load. A connected module carrying no load (another source higher) may whistle and
  the switch may cycle the port. Nothing is damaged.

## PoE isolation

The 48 V side: jack pins 9 and 10, FB102, FB103, D103 and module pins 5 to 8, in the right-hand strip of the board
(`geometry.POE_PRIMARY`). No ground or supply copper is poured there on any layer.

- **Spacing.** A custom DRC rule keeps 3 mm between PoE-class copper and every other net (`board_setup.py`,
  `.kicad_dru`), except between pins of the jack itself (2.3 mm between its PoE and signal pins, HanRun's design). The
  rule looks at one layer; keep-outs on every layer stop the pours of other layers from reaching under or over 48 V
  copper. `sim/isolation.py` measures the shortest way along and through the board on every routed build
  ([Simulations](hardware/touch-p4/simulations.md)). Silvertel asks for 3 mm between the two sides.
- **Under the module.** Its barrier lies under the body, 2.3 mm from the output pins at one end and 5.3 mm at the
  other (Silvertel Ag9900 fig. 23; SDAPO shows none). From that line to the 48 V pins there is no copper on any layer,
  including Silvertel's 3 mm band that dips between output pins 2 and 3 (`POE_UNDER_MODULE`, `POE_BARRIER_DIP`).
- **At the jack's shell** (secondary side, shield): no 48 V copper and no 48 V part on the component side within 1 mm
  of its rear wall; the 48 V nets pass under it on In2.
- **At the display.** Pin 9 stands 0.5 mm from the LCD module's edge, pin 10 1.8 mm. Air does not hold 1500 V over 0.5
  mm: the wrapped polyimide tape is the insulation. No 48 V track runs on the back layer (facing the display); the
  jack lines and the 19 mm filtered negative line beside the module run on In2.
- **Barrier capacitors.** C102 bridges the barrier for EMC: Murata GA352QR7GF102KW01L, 1 nF, certified X1/Y2, 250 V
  AC, proof-tested at 2000 V AC for 60 s (2.8 kV peak), 2211 case, land pattern with 4.5 mm between pads (Murata's
  test board). C410 (1 nF, 3 kV, Fenghua 1808B102K302NT) and R413 tie the jack shield to ground on the secondary side.
  IEEE 802.3 §33.4.1 asks the powered device to stand one of 1500 V RMS 60 s, 2250 V DC 60 s, or ten 1500 V 10/700 us
  impulses (TI SLUA818; IEEE interp-3-0704); the Y2 proof test covers all three. No 1 nF part of 3 kV or more is
  stocked in 1206.

Test the isolation on an assembled unit before the lab, and ask the lab whether it tests it at all (for the safety
standard both sides are safe to touch).

## NFC

- **Loop:** 4 turns, 35 x 37 mm, 0.5 mm track, 0.9 mm pitch, display side. Simulated from the board's copper
  (`sim/nfc_loop.py`) at 13.56 MHz: 1.27 uH / 1.20 ohm in free air, 1.25 uH / 1.23 ohm on the board on wood or stone,
  1.20 uH / 1.24 ohm with a metal wall 18 mm behind. Own capacitance about 2.4 pF (acts like 2.5 % more inductance).
  Not modelled: the DC terminal 6 mm away, the LED supply's electrolytics C725 and C726 (aluminium cans 6 mm above the
  loop's upper edge and 6 mm left of its left edge, on the component side) and, on the lan version, the Ethernet plug
  and cable 8 mm beside the loop. They, and a card or phone, lower the inductance a little.
- **Copper around the loop** is open in one place: a 2.5 mm gap in all layers towards the Ethernet cut-away, level
  with the loop's centre between the ring's LEDs 5 and 6, so it is not a shorted turn (metal across the gap: 1.25 to
  1.08 uH). The LED ring's 5 V rail (`+5V_LED`) is open there too: its 100 nF capacitors join it to ground at
  13.56 MHz, so a closed rail would close the turn as well. No screw stands in the gap any more. With the gap the
  pours take 2 %; the display's metal back takes nothing that counts.
- **The LED data line** crosses the gap, and it does close a turn there: from LED 5's output (low impedance to its
  supply) across the gap to LED 6's input, whose capacitance and clamp diodes lead to its ground. The carrier induces
  about 2.9 V peak in that turn (mutual inductance 164 nH to the loop, 209 mA peak in the loop; Neumann's integral
  over the ring's square), more than the step from a low level to the input's switching threshold (about 2.4 V): LEDs
  6 to 15 could take wrong bits while the field is on, and the clamp diodes rectify the carrier. So LED 6's input sits
  behind a low-pass: R709 2.2 k in the line, standing in the gap, and C727 39 pF to the LED's ground right beside its
  input, both parts the board already has.
  - It leaves 0.14 of the carrier, 0.40 V peak, and the turn stays at 2.2 k: 0.09 ohm reflected into the loop (Q 25.2
    to 24.7, 0.14 nH), 1.3 mA in the turn, 2 mW in R709. 1 k with 100 pF would leave 0.34 V but reflect 0.19 ohm.
  - The data edges arrive 31 to 103 ns late (time constant 86 ns). With one switching threshold between 30 and 70 % of
    the supply a pulse grows or shrinks by 73 ns at most, against the SK6812's tolerance of 150 ns on T0H (0.3 us) and
    T1H (0.6 us) at 800 kbit/s: 77 ns remain. LED 6 regenerates the signal for the rest of the chain.
  - `simulate` checks every net, and ground, both 5 V nets and 3.3 V together, for copper closed round the loop, and
    passes signal copper across the gap only behind such a filter (`shorted_turn.crossings`, parts in the gap counted
    as conducting).
- **Damping:** 1.5 ohm per leg, Q about 25. 20 to 35 mW each, 75 mW at most with any part spread for loops up to 1.25
  uH (rated 0.1 W).
- **EMC filter:** 560 nH and 220 pF per side, corner 14.3 MHz.
- **Matching:** series 39 pF, parallel 180 pF + 10 pF. Chosen so transmitter current and receiver input stay inside
  the PN532's limits (100 mA operating, 150 mA limiting; 4 Vpp at the receiver input) for the loop on either wall,
  with room for what a card takes off. Model `sim/nfc_match.py` (driver 4 ohm, 2 to 5 ohm; supply 3.0 V, 2.7 to 3.4 V;
  filter inductor 1 ohm); `sim/nfc_tx.cir` agrees in the time domain.

  | Loop | Load TX1-TX2 | Transmitter current | Receiver input |
  |---|---|---|---|
  | 1.00 uH | 5 + 15j ohm | about 79 mA | 3.1 Vpp |
  | 1.10 uH | 12 + 24j ohm | about 49 mA | 1.8 Vpp |
  | 1.20 uH | 59 + 13j ohm | about 35 mA | 1.2 Vpp |
  | 1.25 uH | 36 - 26j ohm | about 41 mA | 1.9 Vpp |
  | 1.30 uH | 15 - 22j ohm | about 56 mA | 2.9 Vpp |

  With 5 % parts (filter corner close to the carrier), the transmitter stays below 100 mA for loops of 0.93 to 1.39 uH
  at exact values, 1.08 to 1.27 uH on 99 boards in 100, 1.12 to 1.25 uH with every part at its worst end. The receiver
  stays below 4 Vpp on 99 in 100 for 1.06 to 1.26 uH. Outside, it gets worse fast (1.0 uH: one board in five above 100
  mA; 1.3 uH: one in twenty, up to 210 mA).
- **Receive path:** 3.9 k, 1 nF, 1 k to VMID (NXP's reference has 2.7 k, which gave 3.8 Vpp at 1.25 uH). 1.2 to 1.9
  Vpp for loops of 1.2 to 1.25 uH, well above the 0.5 Vpp needed.
- **Field** (simulated): 4.2 A/m at a card on the case, 3.4 A/m on a metal wall (ISO/IEC 14443: 1.5 to 7.5 A/m). It
  falls to 1.5 A/m 19 mm in front of the case (15 mm on metal). The transmitter runs at 41 mA of 100 mA, so the
  matching has room for more range.
- **PN532:** I2C selected with I0 high, I1 low (NXP's application note; the datasheet table alone reads either way).
  The chip's own regulator feeds analog and transmitter supply; reset threshold 0.9 x the 3.3 V supply although the
  chip runs from 5 V. The PN532's analog-supply 100 nF is 4.1 mm from its pin; the transmitter's vias take the space
  beside it.
- **Placement.** The loop sits on the case's centre line (x 43), concentric with the LED ring and the tap tile. The
  PN532 block (chip, EMC filter, matching, damping, receive path, crystal, supplies) stood between the DC cut-away and
  the loop until the ring's left side needed that column; it now sits below the display, left of the flex, turned so
  its transmitter pins face down, with the same parts in the same places relative to the chip. The antenna feeds run
  from the damping resistors on the back layer between the cut-outs of the ring's upper left corner, then on the front
  layer to the loop's ends: about 25 mm of feed pair instead of 12. That adds an estimated 10 nH (under 1 % of the
  loop) in series, which `sim/nfc_loop.py` does not model (it takes the loop from the footprint); the tuning on the
  assembled unit takes it in.

These are starting values. Measure the loop first, then tune C513/C517, C514/C515/C518/C519, R504/R505 and R506 with a
network analyser on an assembled unit with the display fitted. Tune the lan version on its own, with the cable plugged
in ([Bring-up plan](hardware/touch-p4/bring-up.md)).

## LED ring

16 SK6812MINI-E, reverse mounted: each shines through a window in the board into the tap tile's white body, a light
guide that lies flat on the display side round the loop. The case puts the tile's white rim, 2 mm wide (20.4 to
22.4 mm from the centre), straight over the ring.

- **Ring.** A square 21.4 mm from the tile's centre (43, 117) on every side. That is as tight as the loop allows: the
  windows keep the 1.03 mm from the loop's copper (18.75 mm from the centre above and below) that the old top row had;
  left and right the loop is narrower, 1.88 mm. Each LED's long side lies along the ring.
- **Count and pitch.** The ring is 171 mm round; 16 LEDs are 10.7 mm apart, four per side, half a pitch from each
  corner, so the spacing stays the same round the corners (two LEDs 5.35 mm either side of each corner). Through
  white ABS a spot blurs into its neighbours when the LEDs are no more than about twice its thickness apart. The pitch
  was chosen against a solid tile, about 5 mm of white: 10.7 mm is at that limit, 12 LEDs (14.3 mm) would show spots,
  20 (8.6 mm) would add four more parts for little. The tile now has a channel 2.3 x 2.5 mm over the LEDs and 2.8 mm of
  white to the rim; the channel's walls carry the light sideways between the LEDs ([Case](hardware/touch-p4/case.md)).
  A first print with the board shows whether the rim is even; the firmware can even out what is left by dimming.
  Nothing sits on a corner: an LED there would collide with the DC terminal and leave no room for the antenna feeds.
- **Data line.** In the chain's order, LED 0 is the top left one seen from the component side; the chain runs
  clockwise in that view, so counter-clockwise for the user in front, starting top right. LED k is D701 + k for k up to
  7 and D702 + k from 8 (D710 to D717 came after the tamper parts on the sheet), its capacitor C703 + k or C708 + k.
  The data line crosses the gap in the copper round the loop between LEDs 5 and 6, through the carrier filter R709 /
  C727 (see [NFC](#nfc)).
- **5 V.** The ring has its own supply, `+5V_LED`, behind the switch U705 (below). A 0.6 mm rail on In2 outside the
  ring, a via and a 100 nF capacitor in the gap after each LED. The rail is open where the copper round the loop is
  open (between LEDs 5 and 6), otherwise it would be a shorted turn (see [NFC](#nfc)). The capacitor of LED 5 sits
  outside the ring, out of the gap. The switch's output reaches the rail at the ring's top side between LEDs 1 and 2,
  through C725; the level shifter takes its supply from the same place. The second 100 uF, C726, joins the rail on the
  ring's left side beside LED 14.
- **Current.** Each LED drives a fixed 12 mA per colour channel and dims by PWM only: one colour on all 16 draws 192
  mA, full white 0.58 A; each LED also draws 1 mA idle (datasheet IDD), 16 mA in all. The firmware keeps all channels
  of all LEDs together at 192 mA or less (rule 20 in [Pin map and firmware port](hardware/touch-p4/firmware-port.md)),
  so single colours keep their full 8-bit range and mixed colours and white are scaled down. Under the old limit of
  100 mA they had 52 % of it.
- **Supply switch.** TPS2553DBVR (U705, TI, SLVS841G), a current-limited switch, holds the ring below what the
  5 V sources can spare if the firmware fails. R708 (91 k, 1 %) sets the limit. TI gives minimum, typical and maximum
  over process and temperature (equations 1 to 3, -40 to 125 °C junction): with the resistor's 1 % that is
  **255 / 292 / 334 mA**. The minimum stays 23 % above the 208 mA the ring draws at the firmware's limit (192 mA of PWM
  current and 16 mA idle). The first value, 100 k (232 / 266 / 306 mA), left 11 %. 91 k is the largest E24 value
  whose minimum stays above 250 mA, so it keeps the ceiling as low as that allows; 91.9 k (E96) would lower it by
  3 mA.
  - *Why this part.* Its datasheet states the limit's minimum and maximum over temperature as equations down to
    75 mA. Other resistor-set switches (Silergy SY6280, Diodes AP2255x and AP2265x) were not checked against their
    limit tolerance at a 0.2 to 0.3 A setting; at 0.11 to 0.20 USD (LCSC C55266, an extended part at JLCPCB) the
    TPS2553 costs cents more at most.
  - *Fault behaviour.* Constant current, not the latch-off -1 version: above the limit it holds the current and the
    ring's supply sags, so the ring dims and shifts colour (blue and green first) instead of going dark until the next
    power cycle. If the overload lasts, the switch heats (up to 1.5 W at a short, 182 °C/W) and turns off at 135 °C,
    on again 10 K cooler, until the load falls. Nothing is damaged; the LEDs see at most the rail's voltage.
  - *PWM peaks.* The LEDs' PWM periods (1.2 kHz) drift in and out of step. In step, mixed colours draw up to three
    times their average for part of each period: at the firmware's limit with white, 0.58 A for 0.28 ms, and the
    16 mA idle current on top. C725 and C726 (two 100 uF electrolytics, the part the PoE module's output already uses)
    carry the part above the switch's limit. Worst case (rail at 4.75 V, the switch at its lowest limit of 255 mA, both
    capacitors 20 % low, all 16 LEDs in step): 0.34 A above the limit for 0.28 ms takes 0.58 V from 160 uF, the
    capacitors' ESR another 0.08 to 0.17 V and the switch 0.02 V. The ring stays at 3.98 V or more, above the LED's
    3.7 V minimum; typically (5.0 V, 292 mA, 200 uF) it dips by 0.5 V. LCSC lists no ESR for the part; 0.5 to 1 ohm
    each is assumed, usual for a general-purpose 6.3 x 5.4 mm electrolytic at a few kHz.
  - *Before the second capacitor.* C725 alone, with its ESR and the idle current counted, reached 3.1 to 3.3 V in that
    worst case (3.5 V had been given without them): blue and green dimmed whenever the PWM periods aligned.
  - *Remaining limitation.* The dip stays above 3.7 V only on a rail of 4.5 V or more. The board's sources keep
    that while the LEDs may be on; USB alone (4.18 V on a weak port behind 0.5 ohm) runs with the LEDs off (firmware
    rule). Below it, blue and green dim for a fraction of a millisecond when the PWM periods align; nothing is damaged.
    Without the capacitors (2 uF on the ring) the supply would collapse each time the LEDs come into step.
  - *Inrush.* About 202 uF on the ring (C725, C726, C701 and the 16 LEDs' 100 nF). The switch's soft start (1.1 ms)
    would ask 0.9 A; it charges them at its limit instead, in 3 to 4 ms, 0.26 to 0.33 A out of the 5 V rail.
  - *Enable.* The enable pin is tied to the switch's input: the ring is on whenever the board is. The MCU's two
    free pins (GPIO27, GPIO48) have no way out of its fan-out: GPIO48 is boxed in between LED data, the VDD_HP_3
    capacitor C222 in its former gap and the core supply's track; GPIO27 between the RMII escapes and the backlight
    line's via under the package. The IO expander has no free pin. A switched ring would have saved the LEDs'
    idle current, 1 mA each (datasheet IDD), 16 mA or 80 mW in all. Without firmware the LEDs stay dark as before:
    R705 holds the data line low.
  - *Back-powering.* The level shifter U701 runs from `+5V_LED` too, so when the switch turns off (thermal
    shutdown, or a later revision that switches it) the shifter loses its supply with the LEDs and cannot drive
    LED 0's data input from a live supply. Its input has no clamp diode to its own supply (SCLS745D 8.3.1), so GPIO47
    driven high does not feed the ring through it either.
- **Cost.** Eight more LEDs and capacitors of the same part numbers: no new parts line, 0.4 to 0.8 USD per board.
  The switch adds one parts line and 0.2 to 0.9 USD per board ([Parts and sourcing](hardware/touch-p4/parts.md#cost)).

## Ethernet

- Wiring follows the Espressif ESP32-P4-Function-EV-Board: IP101GRI with a 25 MHz crystal, the PHY drives the 50 MHz
  RMII clock (clock output tied to clock input), PHY address 1. Transformer centre taps to ground through 100 nF
  (voltage-mode PHY, no termination resistors). Jack LED anodes on pins 11 and 13.
- **Polarity.** The jack datasheet prints no + or -; from its winding dots and the standard contacts (1 TX+, 2 TX-, 3
  RX+, 6 RX-): pin 1 RD+, 2 RD-, 5 TD+, 6 TD-. At the PHY the positive pin of each pair leads to the outer track, at
  the jack it is the inner pin. Each pair runs side by side on the component side, changes to the back layer just
  above the jack through one via each, and swaps sides there. (A swapped pair would still link.)
- The pairs pass under the jack shell's rear wall on the back layer, the 48 V nets on In2; no part within 1 mm of that
  wall. Only the centre-tap tracks and, at the shell's left, the LED and shield tracks run under the shell on the
  component side (harmless if touched).
- **PHY reset.** No reset circuit: the pin hangs on an IO expander pin (input with weak pull-up after power-up), so
  the PHY starts with the supply without the 10 ms reset its datasheet asks. The firmware pulses it low before use
  ([Pin map and firmware port](hardware/touch-p4/firmware-port.md)), as on Espressif's board.
- **RMII.** Lines 40 to 48 mm, clock 59 mm, two to four vias each. Transmit lines have no series resistors (no room at
  the MCU): the firmware leaves those pins at default drive strength or below; simulated, they overshoot 0.13 V at
  default and 0.6 to 0.8 V at the strongest. Lines with series resistors (RMII clock and receive) show no reflections.
  Pairs PHY to jack: 11 to 18 mm.
- **RMII_TXD1 is GPIO35**, the boot-mode strap. The BOOT button and its test point, about 70 mm away, hang behind R217
  1 k placed at the line next to the strap resistor, so the 50 MHz line has no long open branch; with the button
  pressed the pin sees 0.3 V. The PHY's inputs on GPIO34/35 have no pulls that could fight the straps.
- **Crystal ESR.** The 25 MHz crystal is rated up to 50 ohm, above the PHY datasheet's 40 ohm. Typical parts are far
  below both. If a board fails to bring up the Ethernet clock in the cold, look here first.

## Wi-Fi

### Module

ESP32-C5-MINI-1-N4-V1.2 (LCSC C54951860), 15.4 x 21.3 x 2.4 mm, PCB antenna for 2.4 and 5 GHz. EU-type examination
certificate 44024-05-2026-260268 (Eurofins, notified body 0980), FCC ID 2AC7Z-ESPC5MINI1; standards listed in [CE and
market checklist](hardware/touch-p4/compliance.md). Rated -40 to 85 °C ambient, "the environment immediately outside
the Espressif module" (datasheet v1.4, table 1-1 note 3, table 6-2).

- **4 MB flash, no PSRAM.** esp-hosted's partition table for a 4 MB co-processor holds two 1.75 MB images for updates
  over SDIO (`partitions_eh_cp_ota_4m.csv`, esp-hosted-mcu 3.1.0); the co-processor needs no PSRAM.
- **Chip** ESP32-C5HF4, revision v1.0 or v1.2 (chip datasheet v1.5 table 1-1). The SDIO slave works from v1.0 on
  (module datasheet v1.4, 5.2.1.13).
- **Recovery.** SDIO D2/D3 are the C5's USB D+/D- (GPIO14, GPIO13), so its USB Serial/JTAG is unusable. UART0 (TX0 pin
  39 = GPIO11 with 499 ohm inside the module, RX0 pin 40 = GPIO12), GPIO28, EN and ground on labelled test points (C5
  group, TP832 `GND`, TP831 `3V3_WIFI`) are the only wired way to flash and recover it.

### esp-hosted over SDIO

The C5 runs esp-hosted and is the P4's Wi-Fi adapter and Bluetooth controller. esp-hosted-mcu 3.1.0 (ESP-IDF 5.5 or
later) lists the C5 as SDIO co-processor of the P4 ([getting
started](https://github.com/espressif/esp-hosted-mcu/blob/v3.1.0/docs/getting-started-mcu.md#1-sdio)).

| Asked for | Here |
|---|---|
| The C5's fixed SDIO pins CLK 9, CMD 10, D0 8, D1 7, D2 14, D3 13 (module pins 21, 22, 20, 19, 24, 23), chip revision v1.0 or later | as asked, all on the module's lower edge facing the MCU |
| On the P4 the slot 0 pins, wired straight to the SDIO unit | slot 0 (GPIO39 to 44: command 44, clock 43, data 39 to 42). Most P4 boards use slot 1 because slot 0 holds their SD card |
| 51 k pull-ups on CMD and D0 to D3 | R305 to R309, to the module's own rail |
| A reset line from the host to EN | GPIO45 through R302 1 k to EN (R301 10 k, C303 1 uF). The 10 ms pulse takes EN to 0.3 V and holds it below threshold 8.4 ms. Reset polarity is a firmware setting |
| HDG 1.4.9: lines within 1.27 mm of the clock, at most 50.8 mm, 50 ohm +-10 %, no layer change, unbroken reference plane, ground round the clock | bus laid by `routes_sdio.py`: six lines on the back layer over In4, 0.15 mm (49 ohm), each 40.3 mm pad to pad, equal within 0.01 mm by serpentines; clock (22 ohm R304 at the P4) on the west edge, 1.2 mm from its neighbour, ground fill both sides stitched every 2.5 mm. Each line changes layer once at each end, ground via within 0.7 to 1.7 mm (see [Known limitations](hardware/touch-p4/limitations.md)) |
| A supply that does not dip, at least 0.6 A | U302 with 22 uF and 100 nF at the pin ([Wi-Fi module converter](#wi-fi-module-converter)) |

Timing on the routed board (`sim/si.py`): clock and data arrive within 0.18 ns of each other (the clock's 22 ohm and
the module's input slow it, not its length); clock out and data back take 1.01 ns, leaving the P4 5.0 ns at 50 MHz and
10.0 ns at 40 MHz after a module that answers within the SD standard's 14 ns. Only the clock has a series resistor;
Espressif's guide asks to reserve one in every line, its own board has none. The SDIO pins' supply group (GPIO39 to
48) also carries the module reset, the buzzer and the LED data line: slow signals into high impedances, no power
stage.

Known esp-hosted problems on other P4 boards, by cause, and where this board stands:

| Symptom (report) | Cause | Here |
|---|---|---|
| No association, dropped packets, restart loops (ESPHome 10956, esp-hosted 151) | host and co-processor on different esp-hosted versions | module comes empty; flashed through its test points, both sides kept on one version |
| `send_op_cond returned 0x107` at start (esp-hosted 127, Arduino 11404) | wrong reset polarity, unpowered co-processor (supply switched by an IO expander), or no firmware | supply not switched; polarity in firmware |
| `Unrecoverable host sdio state` after minutes or hours (esp-hosted 167, 121) | a display library calling ROM cache functions during SDIO; an esp-hosted 3.0.9 fault fixed in 3.1.0; one custom board unresolved | firmware for the first two |
| CRC errors under load on a custom board (esp-hosted 167) | not settled; Espressif reads it as timing margin, the reporter suspects the C6's SDIO unit | board's share 1.01 ns; default edges kept; throughput and error count measured at bring-up |
| Co-processor cannot be updated over SDIO (esp-hosted 143) | co-processor firmware 2.1 to 2.8 flashed first | first image is a newer one; test points as a way back |
| Bluetooth central connect never completes (esp-hosted 204) | host-side fault, patch in the report, still open in November 2026 | firmware; matters for the reader's Bluetooth proxy |

Further reports (stalled downloads, a double free in the receive task) are firmware or access-point issues. No
found cause is in this board's circuit or layout; most are firmware versions and settings ([Pin map and firmware
port](hardware/touch-p4/firmware-port.md)). The two unresolved custom-board reports cannot be ruled out for an unbuilt
board, so bring-up runs esp-hosted's raw throughput test first.

### Strapping pins

Module datasheet v1.4 chapter 4; HDG 1.3.9. Straps are read in the 3 ms after EN rises; the P4 drives none of these
pins then (it is in reset for 120 to 280 ms, and later esp-hosted resets the module before starting the SDIO host,
whose data lines are inputs outside a transfer).

| Pin | Strap | Default | Here |
|---|---|---|---|
| GPIO28 (pin 4) | boot mode: 1 = flash; 0 with GPIO27 = 1 = UART0 download | internal pull-up | R303 10 k pull-up as the HDG recommends, no capacitor. Boot test point: held to ground at reset for the first flash |
| GPIO27 (pin 35) | boot mode, ROM messages | internal pull-up | open; nothing may pull it low |
| GPIO26 (pin 34) | boot mode (only with 27 and 28 low) | floating | open |
| GPIO25 (pin 33), MTDI = GPIO3 (pin 7) | SDIO sampling and driving edges | floating | open. The slave driver sets the edges (`sdio_slave_config_t.timing`); esp-hosted's `EH_TRANSPORT_CP_SDIO_TIMING` defaults to rising edge. Keep the default |
| GPIO7 (pin 19) = SDIO D1 | JTAG source once eFuse JTAG_SEL_ENABLE is burnt | no pull | held high by the 51 k SDIO pull-up. Never burn JTAG_SEL_ENABLE |
| MTMS = GPIO2 (pin 6) | listed as strapping, floating | floating | open |

### Antenna

The module's dual-band PCB antenna, fed through a diplexer, occupies the 5.85 mm at the module's top end (datasheet
v1.4 fig. 11-1). From `scripts/bootstrap/geometry.py`:

| | |
|---|---|
| Antenna area | x 20.1 to 35.5, y 0.3 to 6.15 (lower boundary = module ground edge) |
| Cut in the top edge | x 8.6 to 37.5, 6.0 deep: no board under or beside the antenna. Floor 0.15 mm above the antenna's lower boundary; 2 mm beyond the module on the right (ground point), 11.5 mm on the left (open end) |
| Copper keep-out | x 0 to 50.5, y 0 to 6.3, all six layers: the antenna area and 15 mm beside it, down to 0.2 mm above the module's top pad row |
| Ground at the edge | twelve 0.45 mm vias in the gaps between the module's nine ground pads, as Espressif's land pattern shows; filled and capped, so none draws solder. No via in the module's pads. Ground fill on all layers below the keep-out, stitched every 2.5 mm along the top edge and round the module |
| In the case | 1.8 mm to the top wall, 4.7 mm to the front wall, 13.1 mm to the dock plate, 15.6 mm to a metal wall. The display's metal back lies 6.7 mm below the antenna area, 3.9 mm behind its plane, grounded on four pads |

Espressif's HDG 1.4.7 (figures 22, 23) recommends the antenna beyond the board edge with its ground point at a
right-hand corner and 15 mm clearance in the housing; this board uses the cut the guide names as fallback, on the top
left. Why, and what it costs, is under [Known limitations](hardware/touch-p4/limitations.md).

Full-wave model (`sim/wifi_antenna.py`, openEMS, `simulate-antenna` target). Espressif does not publish the antenna's
shape. A stand-in inverted-F of the same size and kind (long arm for 2.4 GHz, short branch for 5 GHz, ground point on
the right) was tuned on a 40 x 55 mm evaluation board to 2.429 GHz (-10 dB) and 5.435 GHz (-8 dB), then placed
unchanged on this board, and for comparison at Espressif's position 3 (top right corner, out over the edge, case grown
to keep the same wall distances). Radiated of power fed in (mismatch included), brackets: of power accepted, dB:

| Case | 2.4 GHz res. | ch. 1 / 7 / 13 | 5 GHz res. | 5.18 / 5.50 / 5.70 GHz |
|---|---|---|---|---|
| This board, top left | 2.375 | -2.7 / -2.9 / -3.4 (-1.7 / -1.6 / -1.4) | 5.435 | -3.9 / -2.8 / -4.0 (-1.8 / -2.0 / -1.7) |
| **in the case, with the display** | 2.325 | **-3.0 / -3.5 / -4.1** (-1.5 / -1.4 / -1.3) | 5.430 | **-3.8 / -2.5 / -4.0** (-1.9 / -1.7 / -1.9) |
| in the case, metal wall 16.4 mm behind | 2.308 | -4.7 / -4.9 / -5.2 (-2.6 / -2.4 / -2.3) | 5.430 | -4.3 / -3.0 / -4.6 (-2.6 / -2.4 / -2.7) |
| in the case, aluminium face plate | 2.321 | -4.5 / -5.2 / -6.0 (-1.9 / -1.8 / -1.7) | 5.425 | -4.5 / -3.2 / -5.2 (-2.2 / -2.0 / -2.5) |
| aluminium face plate with a window | 2.325 | -2.8 / -3.5 / -4.2 (-1.6 / -1.5 / -1.4) | 5.430 | -3.7 / -2.4 / -4.0 (-1.8 / -1.7 / -1.9) |
| **Position 3, in the case, with the display** | 2.427 | **-1.1 / -1.1 / -1.2** (-1.1 / -1.1 / -1.0) | 5.800 | **-9.3 / -5.0 / -3.2** (-3.9 / -2.9 / -2.5) |

- In the case, top left radiates 1.9 / 2.4 / 2.9 dB less than position 3 at 2.4 GHz and 5.5 dB more to 0.8 dB less at
  5 GHz: within 3 dB in every channel. At 2.4 GHz the difference is mostly matching (of power accepted only 0.3 to 0.4
  dB less). The cut and keep-out pull the resonance down 54 MHz, the case 50 MHz more, so channel 13 sits on the upper
  edge of the match.
- The absolute figures are the stand-in's. Espressif's own antenna on its test board radiates 77 to 83 % (-0.8 to -1.1
  dB) at 2.4 GHz and 51 to 68 % (-1.6 to -2.9 dB) at 5 GHz (antenna report for FCC ID 2AC7Z-ESPC5MINI1, Sporton, 1
  December 2025).
- The display's metal back changes almost nothing. A metal wall costs 1.1 to 1.7 dB at 2.4 GHz and 0.5 to 0.6 dB at 5
  GHz and sends most of the rest forward (76 % and 88 % towards the room, against 47 %).
- **Front materials.** Printed (ABS, PETG), wood and other non-metal fronts work anywhere. A closed aluminium face
  plate costs 1.5 to 1.9 dB at 2.4 GHz and 0.7 to 1.2 dB at 5 GHz; with a window over x 0 to 50.5 it costs nothing.

### Heat

The module's 85 °C rating is for the air right outside it. `sim/thermal.py` has no air node, so it gives two bounds:
below, the cavity air between board and dock plate (mean of the board and the plate's inner face); above, the board
beside the module. C5 losses: 0.40 W typical (connected, receiving at 5 GHz, 110 mA), 0.88 W sending half the time at
5 GHz, 1.36 W sending all the time; in between in proportion. Air outside the module in a 40 °C room:

| Rest of the board | Module sends | USB | DC 12 V | PoE |
|---|---|---|---|---|
| typical use | rarely (0.40 W) | 57 to 67 °C | 59 to 70 °C | 63 to 77 °C |
| typical use | 40 % (0.78 W) | 59 to 76 °C | 62 to 79 °C | 65 to 84 °C |
| typical use | 50 % (0.88 W) | 60 to 78 °C | 62 to 81 °C | 66 to 86 °C |
| typical use | always (1.36 W) | 63 to 89 °C | 65 to 92 °C | 69 to 97 °C |
| everything on for a long time | rarely | 66 to 79 °C | 72 to 85 °C | 76 to 91 °C |
| everything on for a long time | 40 % | 69 to 87 °C | 74 to 93 °C | 78 to 100 °C |

So the firmware limits the module's transmit share to 40 %, averaged over a minute ([Pin map and firmware
port](hardware/touch-p4/firmware-port.md)). The reader's own traffic stays far below; the rule bites only on long
uploads. "Everything on for a long time" is beyond what the case can shed anyway and is ended by the firmware's
temperature rule (dim backlight and LEDs, then hold back the radio). Inside the module, for reference: 81 °C in
typical use on PoE. Estimate +-40 %; measured at bring-up. Board-wide heat: [Heat](#heat-in-the-closed-case).

## Tamper detection

Three sensors tell the firmware someone is handling the reader. All are fitted on both versions; the firmware does not
read them yet.

| Sensor | Part | Detects | How it is read |
|---|---|---|---|
| Accelerometer U702 | LIS2DH12TR | knocks and drilling, swinging open or tearing off (tilt against the installed direction), falling | I2C0, 0x19. Event registers latch, polling is enough. INT1 on TP814 (`INT`) |
| Proximity sensor U704 | VCNL4040M3OE | on or off the dock: 940 nm pulses into the closed space behind the board, reflected by the dock plate 13.9 mm away; also visible light in that space | I2C0, 0x60. 16-bit proximity and ambient light; latches a flag when proximity leaves a lower/upper band. INT (open drain, 10 k pull-up) on TP815 (`INT`) |
| Hall switch U703 | DRV5032FA | on or off the dock: a magnet in the dock faces it | `DOCK_N` on IO expander P6: low on the dock. Samples 20 times a second |

- **Magnet:** neodymium disc 10 x 3 mm, N35 or stronger, axially magnetised, either pole up, in a ring on the dock
  plate at board point (12.5, 38.2), 10.3 mm from the switch: about 22 mT, 16 mT at worst (`sim/dock.py`). The switch
  turns on for certain within 19 mm (4.8 mT), lets go for certain beyond 45 mm (0.5 mT), typically at 29 mm. It
  reports removal once the reader is lifted off; swinging the bottom out 20 mm moves it only 5 mm but tilts the reader
  7 degrees, which the accelerometer sees. A magnet held to the case can fool it; the proximity sensor's light path,
  inside the closed case, cannot be fooled without a hole in the case.
- **Proximity sensor** at (21.6, 52.4), emitter at the upper end, no cover in front. Its light makes a 7.4 mm radius
  spot on the plate, which is flat for 9 mm around. The on-dock reading depends on the plate's colour (Vishay's note,
  18 % grey at 12.8 mm: about 50 / 75 / 120 counts at 50 / 100 / 200 mA with 1T pulses, 400 to 1100 with 8T; a fifth
  less per 2 mm of lift); the firmware stores the mounted reading and reports when it leaves a band around it. Off the
  dock it reads close to zero. Visible light behind the board is one more sign of an open case.
- If the proximity sensor proves itself, U703, C713 and the magnet can be left off; nothing else changes.
- Not sensed: a cut cable or lost supply (the server sees the reader go offline), and the board taken out of the cap.
- Accelerometer and hall switch sit left of the MCU, 15 mm from the buzzer and 22 mm from the nearest inductor; keep
  the magnet away from the PoE module, inductors and NFC matching. The buzzer shakes the board at 2.7 kHz: ignore the
  accelerometer while it beeps.
- The MCU's free pins (GPIO27, 48, 53, 54) are unusable (capacitors in front of three, Ethernet round the fourth), so
  everything goes over I2C and the IO expander.

## ESD per port

Target: EN 301 489-1 V2.2.3 clause 9.3.2, applied by parts 3 (NFC) and 17 (Wi-Fi) to the enclosure: ±4 kV contact, ±8
kV air, on all exposed surfaces except where the user documentation indicates protective measures. Criterion B (EN 301
489-17 6.4): the reader may reset but must recover by itself. Cable ports get transients and surge, not ESD (EN 301
489-1 table 2). IEC 61000-4-2 8.3.2 leaves out points reached only in service if the manual gives ESD measures, and
contacts inside a metal connector shell.

| Port | What can be touched | Target | Protection, rating | Margin |
|---|---|---|---|---|
| USB-C | nothing in use; reached only off the dock (service) | left out as service; otherwise 4 kV contact on the shell | shell to ground; D+/D- U101 USBLC6-2SC6, 15 kV air / 8 kV contact (ST); VBUS D101 SMAJ5.0A, 30 kV | 2x and more |
| DC jack and terminal | inside the case; air at the cable notch | 8 kV air | D107 SMBJ28CA at the connector, 30 kV (Littelfuse), then 2.2 uF + 47 uF | 3.75x |
| Ethernet and PoE | inside the case; plug enclosed | coupling-plane only | jack magnetics 1500 V RMS (HanRun), PHY 12 kV contact (IP101G); D103 SMAJ58A and the isolated module; shield through C410 1 nF / 3 kV | isolated |
| Display glass, face | 0.55 mm glass | 8 kV air | the arc stops on the glass | no gap |
| Display edges, flex behind | 0.25 mm seam round the glass; flex at the lower edge | 8 kV air | touch lines (TP_INT, TP_RST, I2C0 SDA/SCL): U603, U604 USBLC6-2SC6 at the connector; metal back grounded on the four pads; tape over the flex ([installation manual](hardware/touch-p4/installation-manual.md)) | 15 kV air |
| Tap tile, its seam | the tile, in a 45.2 mm square opening of faceplate and cap with a 0.2 mm seam all round: the most-touched spot | 8 kV air on the tile and all round the seam | no part. Behind the seam: 2.4 mm through faceplate and cap wall, 0.8 mm along the tile's flange (its edge 23.6 mm from the centre), 2.9 mm down to the board. The ring's 16 `+5V_LED` vias (tented) sit 24.0 mm from the centre, their edge at the flange's edge: about 6 mm of air from the seam, ground pour beside them as close. LEDs (SK6812MINI-E 2 kV HBM) under the tile's body. Loop shunted to ground by its matching | not shown: [Known limitations](hardware/touch-p4/limitations.md) |
| Buzzer holes, lock screws, faceplate seams | holes near the buzzer, two floating M3 screws, the faceplate's edges | 8 kV air; 4 kV contact on screws | none on the board (buzzer and FET unrated) | not shown: [Known limitations](hardware/touch-p4/limitations.md) |
| Wi-Fi antenna | inside the case behind the top wall | 8 kV air at the seam | no ESD part on the RF line (module leaves D2 unfitted, datasheet fig. 8-1); 1.8 mm behind the top wall, 4.7 mm behind the front, no conductive path out | not shown; pre-test at bring-up |
| Buttons and test points | service only | left out as service | CHIP_PU 10 k + 1 uF + supervisor; BOOT behind 1 k | service |

Sources: ETSI EN 301 489-1 V2.2.3 clauses 6.2, 7.2, 9.3; EN 301 489-17 V3.3.1 6.4; IEC 61000-4-2 Ed. 2.0 8.3.2; EN
55035:2017 common modification 1; ST USBLC6-2SC6 rev. 5; R+O SMAJ rev. 2.2; Littelfuse SMBJ (07/04/25); HanRun
HY931147C REV.A/1; IC Plus IP101G R01 7.1; OPSCO SK6812MINI-E spec B/2; ESP32-C5-MINI-1 datasheet v1.4 fig. 8-1.

## MCU

ESP32-P4NRW32X (use the X part, silicon v3.x; the part without X is end of life). Checked against the HDG v2.0,
datasheet v0.7 and the ESP32-P4-Function-EV-Board schematic 1.52.

- **Supply capacitors** as the HDG asks: 10 uF + 100 nF at the regulator, converter-control, low-power and battery
  supplies; 100 nF at every IO supply, the analog supply and each core pin, 10 uF at the first core pin; 1 uF at each
  regulator output; 10 nF, 100 nF and 4.7 uF at the USB PHY. Where they sit: [Decoupling at the
  MCU](#decoupling-at-the-mcu).
- **Reset:** 10 k and 1 uF (HDG values), plus supervisor U204.
- **Straps:** GPIO35 high through 10 k and low through the BOOT button; GPIO36 high through 1.5 k, fitted on both
  versions (download mode needs it high); GPIO34 high through 10 k (no internal pull); GPIO37, 38 free.
- **Pin map:** no GPIO used twice; the USB pads respected (GPIO26, the backlight, is one, as on Espressif's board);
  Ethernet on pins the MAC reaches without the GPIO matrix. Full map in [Pin map and firmware
  port](hardware/touch-p4/firmware-port.md).
- **Test points:** every rail has one except the PSRAM supply and the PHY's 1.1 V; the bring-up plan names a part to
  probe for those.
- The flash's supply pin has its 100 nF 5.3 mm away: data-out and chip-select run below the pin, the flash body beside
  it.

## Heat in the closed case

`sim/thermal.py`, textbook still-air figures, ±40 %, rise over the room:

| Supply | Typical use | Board | Warmest spot | Display | Wi-Fi module: board under it, cavity | Everything on for a long time: board, LED ring, Wi-Fi board, cavity |
|---|---|---|---|---|---|---|
| USB | 2.5 W | +23 K | +30 K | +18 K | +29 K, +17 K | +41 K, +55 K, +51 K, +30 K |
| DC 12 V | 2.9 W | +26 K | +35 K | +21 K | +32 K, +19 K | +48 K, +62 K, +57 K, +35 K |
| PoE | 3.5 W | +31 K | +39 K | +24 K | +37 K, +23 K | +54 K, +68 K, +63 K, +40 K |

At 25 °C typical use is far from every limit. At 40 °C on PoE: display 64 °C (limit 70), air round the PoE module 71
°C (85), air outside the Wi-Fi module 63 to 77 °C (85); the display and PoE module by less margin than the estimate's
accuracy. Everything on for a long time is beyond what the case can shed (the LED ring, on narrow copper between the
cut-outs, 55 to 68 K above the room with the ring at its 0.2 A limit; the two rows of eight reached 70 to 80 K); the firmware limits the LEDs and watches the chip temperature. Hand check: 3.4 W
over the board's 0.0107 m² at the model's surface coefficients gives 31 K, within 3 % of the model.

## Layout

### Stack-up

Six layers, JLCPCB JLC06161H-3313, 1.6 mm: outer copper 1 oz, prepreg 3313 0.0994 mm (er 4.1) under both outer layers,
cores 0.55 mm, centre prepreg 2116 0.1088 mm.

| Layer | Use |
|---|---|
| F.Cu | components, signals, ground fill |
| In1 | ground plane, one piece |
| In2 | signals (1130 mm, 28 % of all track), ground fill between them |
| In3 | 3.3 V plane, one piece, with a strip down to the NFC parts |
| In4 | ground plane, one piece |
| B.Cu | signals, core-rail pour under the MCU, ground fill |

No track runs on In1, In3 or In4. Where the planes end and at vias, 7 % of the fast signals' length on In2 and B.Cu
has no plane next to it.

### Net classes

The net classes and the other layout rules are on [Design standards and review criteria](hardware/touch-p4/review.md#layout-rules).

After routing, `post_route.py` widens every supply track as far as the copper beside it allows (towards 0.6 mm core,
0.5 mm 3.3 V, 0.8 mm 5 V, 0.4 mm others) and the autorouter's 0.112 mm neck-downs to 0.127 mm. A track ending on a pad
stays as narrow as the pad. 88 of 527 Power-class segments stay below 0.25 mm, all at fine-pitch pins; two signal
segments stay 0.112 mm. The board minimum is set to 0.11 mm.

### Routing

- **Hand-routed by script and locked:** 48 V nets, Ethernet pairs and centre taps; the DC input chain, the buzzer
  circuit and the PoE module output; the PHY's left and lower pins; the antenna feeds and SDIO bus; the
  accelerometer's and proximity sensor's local links; the LED ring (data line from LED to LED, each LED's 5 V pad to
  its capacitor and a via, and the 5 V rail on In2 round the ring, open at the gap in the copper round the loop); at the MCU nearly every signal pin (complete route or a fixed track to a via the router can leave in any
  direction), with neighbouring vias alternated in two rows and tracks spread to 0.45 to 0.5 mm; the NFC host fan-out
  at the PN532; UART0 TX and the backlight PWM via the back layer.
- **Then** Freerouting, and the grid router in `scripts/bootstrap/finish_route.py` where it gives up. Unneeded fan-out
  vias are removed at the end.
- **MCU surroundings.** Escapes take every edge: display signals at the bottom, SDIO, NFC and crystal on the left,
  flash on the right, Ethernet and UART above. Only two capacitors sit next to the left-side pins; the regulator
  capacitors above the MCU stand 2.4 mm from the pad row.
- **Vias:** 0.45 mm pad, 0.2 mm drill minimum, most with 0.5 mm pads; the rest keep 0.45 mm where there is no room.
  Every P4 supply pin has a via just inside the pad row down to the 3.3 V plane or the core-rail pour. The seven RMII
  vias above the MCU cut one 4 x 1.6 mm slot into the planes.
- **Ground** never depends on outer-layer fill: every ground pad has a via to a plane or a track to a pad that has
  one. The QFN ground pins run into their exposed pads.
- **Ground vias** (`post_route.py`): one beside every fast-signal via (RMII, SDIO, USB, Ethernet), stitching every 5
  mm and every 2.5 mm along the top edge and round the Wi-Fi module. No fill is more than 5.6 mm from a ground via. Of
  42 fast-signal vias, 25 have a ground via within 1.5 mm; 6 none within 3 mm (3.8 mm at most), at the tightly packed
  Ethernet vias above the MCU and at the PHY.
- **Voltage drop** (`sim/irdrop.py`): 0.07 V at most with 1.9 A on 5 V (every load at its sizing figure, the 16 LEDs
  at 36 mA each); no outer track above the 20
  K-rise current. The USB input's 1.5 A runs 13 mm on a 0.62 mm inner track, 0.1 mm from a plane that takes its 70 mW.
- Teardrops are not added (KiCad makes them only interactively); the larger via pads do part of their job.

### Impedance

Two kinds of impedance lines, both on the outer layers over their ground plane:

- **USB D+/D-:** one via at each end, otherwise a coupled pair on the back layer, 0.14 mm / 0.15 mm gap, equal length
  and via count (`routes_signal.py`). USB 2.0 asks 90 ohm +-15 %.
- **Ethernet pairs PHY to jack:** 0.155 mm lines (50 ohm each) at the jack's 1.27 mm pitch, 1.115 mm apart. At eleven
  times the height they barely couple: 100 ohm differential (+-15 % for 100BASE-TX).

| Line | Width / gap (mm) | JLCPCB calculator | 2D field solution | Closed form (TI SNLA187) |
|---|---|---|---|---|
| USB pair, differential | 0.14 / 0.15 | 90.4 ohm | 90.9 ohm | 91.9 ohm |
| Ethernet line alone | 0.155 | 50.3 ohm | 51.2 ohm | 48.9 ohm |
| Ethernet pair, differential | 0.155 / 1.115 (0.95 where the transmit pair steps aside of the PoE pin) | 100.1 ohm | 100.5 / 99.1 ohm | 97.8 ohm |

Calculator inputs: prepreg 3313 0.0994 mm er 4.1, 1 oz outer copper, solder mask 1.0 mil on laminate and 0.6 mil on
copper (er 3.8). The field solution is `sim/field2d.py` on the routed cross-sections; the closed form omits the mask
(which lowers the impedance 2 to 3 ohm here). The fabrication drawing asks for impedance control to +-10 % at the
calculator's figures and lets the fab adjust widths. 0.15 mm signal track: 49 ohm outer, 46 ohm on In2.

### Margins to JLCPCB's limits

From `scripts/fab_margins.py` against JLCPCB's published six-layer capabilities
(https://jlcpcb.com/capabilities/pcb-capabilities):

| Feature | This board | JLCPCB | Margin | Why |
|---|---|---|---|---|
| Track width | 0.112 | 0.09 | +0.022 | autorouter neck-downs at fine-pitch pins |
| Track to track / pad | 0.127 | 0.09 | +0.037 | board rule |
| SMD pad to pad, two nets | 0.150 | 0.15 | **0** | P4's 0.35 mm pitch with Espressif's 0.20 mm pads; U702 LGA. Corner pads trimmed (0.163 mm) |
| Solder mask web | 0.100 | 0.10 (green, 1 oz) | **0** | same pins, mask 0.025 mm per side. Green is the only colour with a 0.10 web |
| Via hole / diameter | 0.20 / 0.45 | 0.15 / 0.25; surcharge below 0.45 for a 0.20 hole | **0** to the price step | smallest via without surcharge |
| Via annular ring | 0.125 | 0.05 (0.15 preferred) | +0.075 | |
| Plated hole ring (parts) | 0.155 | 0.15 min, 0.20 recommended | +0.005 / -0.045 | the PN532's four thermal vias drawn as plated pads (as vias: fine). Connectors: 0.199 (jack shield pins) |
| Hole to hole, vias / part holes | 0.385 / 0.69 | 0.20 / 0.45 | +0.185 / +0.24 | |
| Via hole to track | 0.254 | 0.20 | +0.054 | Ethernet via field above the MCU |
| Part hole to track | 0.31 | 0.28 min, 0.35 recommended | +0.03 / -0.04 | PN532 thermal vias to In2; connectors 0.383 or more |
| Copper to board edge | 0.31 | 0.20 (milled) | +0.11 | rule 0.3 |
| Silkscreen line / text / to pad | 0.15 / 1.0 / 0.15 | 0.15 / 1.0 / 0.15 | **0** | JLCPCB's smallest, to fit labels and designators |
| Impedance tolerance | +-10 % | +-10 % | 0 | enough for USB FS and 100BASE-TX |

Every feature at the limit is the MCU land pattern, the cheapest via or the silkscreen. DRC runs at KiCad's default
severities: 0 errors, 0 warnings, 0 unconnected.

### Switching converters: hot loops

Measured by `scripts/layout_report.py`: buck input loop from input capacitor to VIN and from its ground pad to the
IC's GND; boost loop from diode cathode to output capacitor and back to GND.

| Converter | Capacitor | Supply side (copper) | Ground side (straight) | Loop area | Ground vias within 1 mm (IC + cap) | Switch-node copper |
|---|---|---|---|---|---|---|
| U104 AP63205, DC to 5 V | C113 2.2 uF | 3.8 mm | 2.4 mm | 6.3 mm² | 1 + 1 | 10.1 mm² |
| U103 TLV62569, 5 V to 3.3 V | C107 100 nF | 1.0 mm | 3.9 mm | 2.6 mm² | 0 + 1 | 7.4 mm² |
| U302 TLV62569, Wi-Fi rail | C305 100 nF | 1.4 mm | 5.1 mm | 1.1 mm² | 0 + 1 | 7.4 mm² |
| U202 TLV62569, 3.3 to 1.1 V | C232 10 uF | 2.1 mm | 4.6 mm | 1.3 mm² | 1 + 1 | 3.7 mm² |
| U601 AP3032, backlight boost | C606 1 uF | 2.5 mm | 5.2 mm | 0.3 mm² | 0 + 1 | 5.5 mm² |

Every loop closes on the component side in one piece of ground fill with In1 right below. U103, U302 and U601 have no
via at their GND pin (SOT-23: it sits between the switch pin and the inductor pad); ground reaches In1 through the
capacitor's via and the fill (U302 also through a via between its pad rows, 1.3 mm from the pin).

### Decoupling at the MCU

Copper path from each ESP32-P4 supply pin to its nearest capacitor, along tracks, via barrels and planes
(`scripts/layout_report.py`). Targets in [Design standards and review criteria](hardware/touch-p4/review.md).

| Pin | Supply | Path (mm) | Capacitor | Pin | Supply | Path (mm) | Capacitor |
|---|---|---|---|---|---|---|---|
| 9 | VDD_LP | 8.0 | C206 | 73 | VDDO_3 | 3.5 | C230 |
| 21 | VDD_IO_0 | 9.4 | C203 | 74 | VDDO_4 | 4.6 | C231 |
| 26 | VDD_HP_0 | 10.2 | C219 | 75 | VDD_LDO | 5.8 | C208 |
| 30 | VDD_FLASHIO | 9.2 | C224 | 76 | VDD_HP_2 | 9.1 | C221 |
| 51 | VDD_USBPHY | 4.4 | C216 | 77 | VDD_DCDCC | 2.0 | C208 |
| 54 | VDD_HP_1 | 6.9 | C220 | 85 | VDD_IO_5 | 7.0 | C208 |
| 59 | VDD_PSRAM_0 | 13.7 | C226 | 91 | VDD_HP_3 | 1.4 | C222 |
| 62 | VDD_IO_4 | 9.7 | C204 | 96 | VDD_IO_6 | 1.3 | C206 |
| 67 | VDD_PSRAM_1 | 10.9 | C226 | 101 | VDD_ANA | 6.1 | C206 |
| 71 | VDDO_FLASH | 3.6 | C223 | 102 | VDD_BAT | 3.4 | C214 |
| 72 | VDDO_PSRAM | 3.3 | C226 |  |  |  |  |

- The upper edge has seven supply pins in 2.1 mm (71 to 77). A 0402 is 0.64 mm wide and needs 0.4 mm beside it for a
  track, so one capacitor fits per 1.05 mm of row; only every other pin can have a via inside the row (0.35 mm pitch,
  0.45 mm vias). The 10 uF of VDD_DCDCC sits in the corner beside pin 77 (2 mm, ground via in its pad), which also
  puts 10 uF within 6 mm of VDD_LDO.
- The other pins reach their capacitors through the via inside the pad row and the plane (3.3 V on In3, core on the
  back layer). Simulated (`sim/pdn.py`), the board's share above 30 MHz is 1.1 nH on the core rail (2.4 nH for one pin
  alone) and 1.2 nH per 3.3 V pin, about what the package adds itself
  ([Simulations](hardware/touch-p4/simulations.md)).
- Four vias lie in pads on purpose at the MCU's upper left corner (ground pads of C208, C223, C226 and C223's supply
  pad, where the flash supply changes to In2). JLCPCB fills and caps every via on six-layer boards.

### Crystal

Y201: 40 MHz, 2.0 x 1.6 mm, Hosonic E1SB40E00001AE (LCSC C2689435), second source Tai-Saw TZ1269D (C501798, same pads
and load). No links in the lines.

- **Espressif** (P4 HDG 1.3.5): firmware supports only 40 MHz; accuracy within ±10 ppm. Hosonic ±10 ppm at 25 °C and
  -30 to +85 °C; Tai-Saw ±5 ppm, ±15 ppm over -40 to +85 °C. No ESR limit is given for the 40 MHz crystal; both parts
  are 40 ohm max, 100 uW drive max.
- **Load capacitors** CL 9 pF, Cstray estimated 3 pF (pins, about 7 mm of track, pads): C238 = C239 = 2 x (9 - 3) = 12
  pF C0G. Espressif's own board implies about 4 pF stray, which would want 10 pF; the bring-up plan measures the
  frequency and steps to 10 pF if it is low.
- **Layout** (HDG 1.4.2): at least 4.5 mm from the clock pins, no vias in the lines, load capacitors at the far ends,
  no signal under the crystal. The crystal is turned 45 degrees so its two signal pads face the pins and the lines
  pass either side of its ground pad; body 4.75 mm from the package edge; track keep-out under it on every layer;
  lines on the component side over In1 with ground fill beside them.
- **Track:** XTAL_N 6.8 mm, XTAL_P 6.5 mm (about 0.3 pF more than 5 mm, inside the 3 pF stray estimate).

### Assembly details

- **Paste:** MCU exposed pad as nine 2.1 mm windows (70 %), 16 ground vias of 0.3 mm in the lanes between; the PHY's
  pad four windows and five vias; the PN532's 4.42 mm pad eight 1.15 mm windows (54 %) round its four vias. No other
  via under paste; the paste layer of the display side is empty. `test_design.py` checks the footprint library for
  paste on plated holes.
- **Thermal spokes** (0.25 mm wide, 0.2 mm gap) on 0402 and 0603 pads against tombstoning; larger parts, ICs and vias
  solid in the fills.
- **LED footprint:** KiCad's, pads 0.1 mm shorter, so they keep 0.3 mm from the milled 3.4 x 3.0 window with relieved
  corners (round milled corners, square LED body 3.2 x 2.8 mm, 0.2 mm outline tolerance). Mounted upside down, the
  pads are the drawing's mirror image. Courtyard 0.1 mm round pads and window (IPC-7351B least material) instead of
  KiCad's 0.25 mm: the two LEDs at each corner of the ring stand at right angles, their courtyards 0.13 mm apart.
- **Inductor footprints** are marked surface-mount, so a surface-mount-only placement export keeps them.
- **Placement angles** of the PN532 (Tokmas), the transistor, the resistor arrays and the level shifter differ from
  JLCPCB's library; the export corrects them. `check-footprints` compares every footprint with JLCPCB's library.
- **Fabrication outputs** (fab drawing, IPC-D-356 netlist, assembly drawing with every designator, pin 1 and polarity)
  are in `fab/jlcpcb/`; smallest plated hole 0.2 mm, unplated 0.6 mm, slots 0.8 and 1.0 mm. Ordering: [Working on the
  board](hardware/touch-p4/development.md).

### Land patterns

`check-footprints` compares every footprint with JLCPCB's library. The critical ones were also measured against the
makers' drawings (match: within 0.05 mm; acceptable: pad up to about 0.2 mm longer or shifted with the terminal
covered; defect: wrong pitch, pin order or hole position).

| Part | Document | Land pattern |
|---|---|---|
| U201 ESP32-P4 (QFN-104, 0.35 mm) | datasheet v0.7 fig. 6-1; Espressif's `ESP32-P4.kicad_mod` (espressif/kicad-libraries, 2025-10-07) | Espressif's 0.20 x 0.65 mm pads from 4.55 to 5.20 mm off centre, on the 0.35 mm grid (`make_lib.p4_signal_pads`), mask 0.025 mm. Eight corner pads end 0.04 mm early: 0.163 mm across each corner |
| U105 TPS259470A (RPW, 2 x 2) | TI SLVSFC9C, RPW0010A | TI's polygons without outline stroke (`make_lib.custom_pad_strokes`) |
| U301 ESP32-C5-MINI-1 | datasheet v1.4 fig. 11-1, 3-1 | 60 pads 0.40 x 0.80 at 0.85 mm, corner pads, nine ground pads 1.20 mm at 1.65 mm, antenna boundary: all within 0.05 mm. Pin-1 mark is a square pad, not the drawing's chamfer |
| J101 USB-C TYPE-C-31-M-12 | HRO drawing 2020-12-08 | match; power pads 0.6 x 1.3 mm (`make_lib.usb_c_power_pads`) for 0.20 mm VBUS-GND as drawn. Pads 0.19 mm further back and shell slots 0.2 mm wider: acceptable |
| J103 WAGO 250-202 / 2601-3102 | WAGO data sheets | match, pin 1 front right; 1.2 mm holes suit the 2601 and are 0.1 mm over the 250's maximum: check hole fill on the first boards |
| J102 PJ-002A, J401 HY931147C | Same Sky rev 1.05; HanRun REV.A/1 | match (J401 within 0.005 mm; LED holes 1.10 against 1.02) |
| J601 FH12-40S-0.5SH(55) | Hirose FH12 catalogue | match; copper 0.30 mm, paste 0.25 mm (`make_lib.fpc_signal_pads`) |
| U102 DP9900M / Ag9905M | SDAPO 4.1; Silvertel Ag9900 V3.5 figs. 3, 19, 23 | 1.25 x 4.0 mm at 2.54 mm within 0.03 mm of both; Silvertel's 3 mm keep-out band copper-free on every layer. Only Ag9905-M and -MT fit |
| U501 PN532 (QFN-40) | Tokmas datasheet; NXP SOT618-1 | pads 0.24 mm beyond the body (NXP 0.50, IPC 0.30): acceptable |
| U401 IP101GRI (QFN-32) | IC Plus R01; IPC-7351B | heel 0.10 mm short, exposed pad 2.80 against 2.70: acceptable |
| L102 CKCSA4020-6.8uH | CENKER datasheet | terminals covered; angle 0/180. No JLCPCB footprint: check in the placement preview |

### Silkscreen

For the person with the reader open (`scripts/bootstrap/silk.py`). Text 1.0 mm high, 0.15 mm lines; the build stops if
a text lies on a pad, on another text or within 0.3 mm of the board edge.

- **Designators** wherever one fits beside its part (`silk_refdes.py`): every IC, crystal, inductor, bead, diode,
  transistor, connector, switch, fuse, array and the buzzer (23 with a leader line; a test fails if one is missing).
  114 small passives around the MCU, PHY and NFC chip carry none; the assembly drawing shows them.
- **Test pads** TP816 to TP832 carry the net's short name (`VDC`, `5V_DC`, `5V_USB`, `5V_POE`, `VDD_FLASH`, `TVDD`,
  `AVDD`, `DVDD`, `BL_A`, `SDA`, `SCL`, `NFC_SDA`, `NFC_SCL`, `REF_CLK`, `PHY_3V3`, `3V3_WIFI`, `GND`;
  `silk.test_point_labels`); older ones are in labelled groups (C5, P4 UART0, power).
- **Component side:** test-point groups, how to enter download mode, connector limits, the 48 V border, LED numbers as
  the firmware counts them, and a 10 x 2 mm white field beside `S/N` for JLCPCB's per-board serial number. Behind the
  NFC loop: logo, board name and revision, a short GPIO map (from `circuit_core.P4_GPIO`, so it cannot drift) and
  where the documents are.
- **Display side:** the display assembly hints (ground pads, jack pins to clip, which carry 48 V), LED numbers, the
  keyhole at the tap point and a note for whoever takes the display off.
- The logo comes from `case/logo/`; the mascot is not used (brand rules want its natural colours).
