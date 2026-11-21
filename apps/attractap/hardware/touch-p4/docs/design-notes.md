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
| DC connectors | barrel jack (5.5 / 2.1 mm) and WAGO 250 push-button terminal in parallel | Plug-in supplies and bare wires from an existing installation both work. The terminal footprint also takes the WAGO 2601 lever terminal, which costs 13 times as much. |
| Ethernet jack | behind the lower right corner of the display, 51 mm above the lower board edge | A plug with its boot and the cable's bend into the wall need 49 mm below the jack, inside the case. The price: the jack's pins stand out of the display side behind the display. The display sits 1.5 to 2 mm off the board and the pins are clipped (see "Display mounting and flex"). Below the display the jack would need a case 19 mm longer. |
| USB-C | service port at the board edge next to the MCU | Only used for flashing and debugging, never offered to users. |
| Tamper detection | an accelerometer, an infrared proximity sensor that looks at the dock's plate, and a hall switch facing a magnet in the dock | The accelerometer notices knocks, tilting and tearing off. The proximity sensor says that the reader has left its dock, and its light path lies inside the closed case, out of reach. The hall switch says the same in a second, simpler way, but a magnet held to the case fools it. All three are read over I2C, because the MCU's four free pins are blocked by capacitors at the pad row. |
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
| Cut under the Wi-Fi antenna | x 14.9 to 29.1, y 0 to 5.65: the module's antenna stands free over it |
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
  the connector. No tall parts are placed there.

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

- Wi-Fi antenna: keep metal and the display away from the top 7 mm strip. The
  board has no copper there over a width of 44 mm and is cut away under the
  antenna itself. Espressif asks for 15 mm without metal around the antenna;
  the display's metal back is 7 mm away and one mounting screw 11 mm. Expect
  less range than on a development board. The version with an external antenna
  does not depend on this.
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
- External Wi-Fi antenna: the MINI-1U module has a U.FL connector on top.
  Plan a place for the antenna or a bulkhead connector and for the pigtail.
- No tracks run on the outer layers within 3.3 mm of a mounting hole centre,
  so a screw head or standoff up to 6.6 mm across is safe.
- Buzzer BZ701 fires sideways, along the board towards its lower edge (its
  sound port is on the side of the part that faces the level shifter U701).
  Leave an opening or a slot in the housing near it.
- LEDs need a diffuser in front of the windows.
- Do not put metal (screws, plates, shielded cable) inside or right behind the
  NFC loop.
- The display's metal back should be tied to the board's ground: it is a large
  plate close to the board, and discharges onto the glass end up on it. The
  display side of the board has four bare ground pads of 5 x 5 mm behind the
  LCD module, at (13.5, 18.5), (66, 38), (48, 17) and (43, 80). Put conductive
  tape or foam on at least two of them before the display goes on; leave them
  out of the area the mounting tape covers.

## Power

| Rail | Source | Loads |
|---|---|---|
| +5V | USB-C (PTC fuse, TVS, ferrite, Schottky), DC converter (Schottky) or PoE module (Schottky) | 3.3 V buck, backlight, LEDs, buzzer, PN532 |
| +5V_DC | AP63205 buck, 2 A, from the DC connectors (PTC fuse, reverse-polarity diode, input filter, TVS) | feeds +5V |
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
  converter (AP63205) works up to 32 V, stands 35 V continuously and 40 V for
  0.4 s. The TVS is an SMAJ28A: it starts to conduct between 31 and 34 V and
  holds short peaks below 40 V, as when a live 24 V supply is plugged in. It
  cannot hold a lasting overvoltage. Reversed polarity does no harm (series
  diode D105). The inductor L102 is rated for 25 V across it, which is reached
  at 30 V input.
- DC input filter: C117 (10 uF), L103 (2.2 uH) and the converter's own input
  capacitors C112/C113 form a pi filter. Without it the converter's 1.1 MHz
  ripple current would run straight out on the supply cable; conducted
  emission on that cable is measured when it may be longer than 3 m. The
  filter takes 40 to 50 dB off at 1.1 MHz (calculated, not measured). It has no
  common-mode choke: if the lab finds emissions from the cable above 30 MHz, a
  clip-on ferrite at the cable is the first remedy. The TVS sits behind the
  inductor, at the converter, so it also clamps what the filter rings up to
  when a supply is plugged in live. The capacitors are 50 V parts whose
  capacitance drops to about 1.5 uF each at 24 V; the values were chosen with
  that in mind.
- Bleed resistors: R104 (USB) and R105 (DC converter output), 4.7 k each. The
  OR-ing diodes leak up to 0.1 mA when hot. Without a load that lifts the
  unpowered input to several volts: a USB-C host then does not switch its
  supply on (it wants to see 0 V first), and the DC converter gets a supply
  through its own output. Each resistor costs 1 mA while its source is on.
- With two supplies connected the higher one feeds the board. A PoE module
  that is connected but carries no load runs below its minimum load: it may
  whistle, and the switch may turn the port off and on. Nothing is damaged.
- USB-C is a service port: the board draws up to about 1 A from it without
  asking what the port can give. Use a port or supply that delivers that.
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
  layer, which faces the display.

The 2 mm figure is a design choice, not a certified creepage distance.
Silvertel asks for 3 mm between the two sides of the barrier; the board has
2.0 mm and more. The jack itself has 2.3 mm between its PoE pins and its signal
pins. IEEE 802.3 wants the port to stand 1500 V RMS against everything that
can be touched; C102 and C410 are 2 kV DC parts, which is below the peak of
that test (2.1 kV). Test the isolation on an assembled unit before the lab
does, and ask the lab whether it tests it at all: for the safety standard both
sides are safe to touch.

## NFC

- Loop: 4 turns, 35 x 37 mm, 0.5 mm track, 0.9 mm pitch, on the display side.
  Calculated from the track geometry it has 1.28 uH in free air. The copper
  around it, the display, one mounting screw 3 mm beside it, the DC terminal
  6 mm away and, on the lan version, the Ethernet plug and cable 8 mm beside
  its right edge all lower that. Expect 1.1 to 1.25 uH.
- Damping: 1.5 ohm in each leg, giving a quality factor of about 25.
- EMC filter: 560 nH and 220 pF per side (corner at 14.3 MHz).
- Matching: series 39 pF, parallel 180 pF + 18 pF. These are not the values
  for the best match at one inductance. They are chosen so that the
  transmitter stays inside its limit wherever the real loop lands:

  | Loop | Load between TX1 and TX2 | Transmitter supply current |
  |---|---|---|
  | 1.00 uH | 4 + 16j ohm | about 73 mA |
  | 1.10 uH | 13 + 26j ohm | about 45 mA |
  | 1.20 uH | 58 - 7j ohm | about 37 mA |
  | 1.30 uH | 10 - 19j ohm | about 64 mA |

  The PN532 allows 100 mA (60 mA typical, 150 mA absolute). The values first
  fitted (27 pF, 150 pF + 22 pF) were calculated for a larger loop of 1.35 to
  1.4 uH; with 1.2 uH they would have drawn about 140 mA. The currents are
  calculated with a simple model (driver 4 ohm per side, coil 1 ohm), not
  measured.
- Receive path: 2.7 k, 1 nF, 1 k to VMID as in the NXP reference.

These are starting values. Measure the loop first, then tune C513/C517,
C514/C515/C518/C519 and R504/R505 with a network analyser on an assembled unit
with the display fitted, and check the read range with the cards in use. The
two assembly versions differ here: a shielded plug and its cable lie next to
the loop, so tune the lan version on its own, with the cable plugged in.

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
[firmware-port.md](firmware-port.md)). The Espressif ESP32-P4 board works the
same way.

The 25 MHz crystal (ESR up to 50 ohm) is above what the PHY datasheet allows
(40 ohm). Typical parts are far below both. If a board ever fails to bring up
the Ethernet clock in the cold, look here first.

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
vias each. Both are well inside what these interfaces tolerate. The Ethernet
pairs from the PHY to the jack are 11 to 18 mm.

Solder paste on the MCU's exposed pad is printed as nine windows of 2.1 mm
(70 % of the pad), not as one opening of 7.5 mm: with paste over the whole pad
the package can float on it and lift off its 0.35 mm pitch pins. The pad has
25 ground vias of 0.3 mm, open on the component side.

The LEDs use KiCad's footprint for this part. Its cut-out is 3.4 x 3.0 mm with
relieved corners: a milled opening has round inside corners, and the LED body
(3.2 x 2.8 mm) has square ones.

RMII_TXD1 is GPIO35, which is also the boot-mode pin. The BOOT button and its
test point are about 70 mm away. They hang behind a 1 kohm resistor (R217) that
sits at the line, next to the strap resistor, so the 50 MHz line has no long
open branch. With the button pressed the pin sees 0.3 V.

The silkscreen (`scripts/bootstrap/silk.py`) is for the person with the reader
open in front of them. Reference designators are not on it: on a board this
dense they would overlap. They are on the assembly drawing layer
(`fab/board-front.pdf`).

- Component side, the side one sees with the reader off its dock: test points
  in named groups (C6, P4 UART0, power), how to get into download mode, the
  limits of the connectors, the border of the 48 V side, the LED numbers as the
  firmware counts them, and a field for a serial number. The free area behind
  the NFC loop holds the logo, the board's name and revision, a short GPIO map
  and where the documents are. The numbers of the GPIO map are taken from the
  circuit description (`circuit_core.P4_GPIO`), so they cannot drift from the
  netlist.
- Display side, hidden in the finished reader: the assembly hints for the
  display (the four ground pads, the jack's pins to clip, which of them carry
  48 V), the LED numbers, the keyhole at the tap point, and a note for whoever
  takes the display off. The text `JLCJLCJLCJLC` there is where JLCPCB prints
  its order number, if the order asks for that (see the README).
- Texts are 0.9 or 1.0 mm high with 0.15 mm lines. The build stops if a text
  lies on a pad, on another text or within 0.3 mm of the board edge.
- The logo is drawn from the vector files in `case/logo/`. The mascot is not
  used: by the brand rules it keeps its natural colours, and a silkscreen has
  one.

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
needs a magnet of a few cents.

Once per order JLCPCB adds 3 USD for every extended part line (36 lines on the
Wi-Fi version, 41 on the Ethernet/PoE version, with the three tamper sensors),
the setup and stencil fees, the bare boards and shipping. On five boards the
extended-part fees alone are 22 to 25 USD per board, so a small prototype order
costs far more per board than the table shows.

The largest lines are the ESP32-P4 (6.15), the PN532 (5.89), the Wi-Fi module
(4.09) and the flash (2.26); on the Ethernet/PoE version also the PoE module
(6.70), the jack (2.60) and the PHY (1.03).

Savings that were looked at and not taken:

| Change | Saves per board | Why not now |
|---|---|---|
| 16 MB flash GD25Q128ESIG (C2758105) instead of the Winbond part | 0.5 to 0.8 | It is an extended part, so the fee eats the saving below about ten boards. Same footprint: a change of the LCSC number. |
| DC jack DC-005C-20A (C84007, 24 V, 3 A) instead of the CUI PJ-002A | 0.8 | Its pins are 6.65 mm apart instead of 6.0 mm, so the footprint needs wider slots. |
| Generic 40-pin display connector instead of the Hirose FH12 | about 0.4 | Different solder tabs: a footprint change at the densest connector of the board. |
| Reader chip of the RC522 family (FM17580, Si522, MFRC522 second sources, 0.3 to 1 USD) instead of the PN532 | about 5 | These chips are only the radio front end. The firmware would need a new driver that includes the ISO 14443-4 protocol, which the PN532 runs itself, and the board a new matching network. |

Where a part has an equivalent in JLCPCB's basic or preferred list, the design
uses that one (the TVS diodes, 1 uF / 50 V, and 510 k instead of 499 k in the
core converter's divider, where only the ratio counts).

## Sourcing risks

Stock figures are JLCPCB's of 20 November 2026.

| Part | Risk |
|---|---|
| ESP32-P4NRW32X | No stock at JLCPCB or LCSC. Has to be ordered in before assembly. Use the X part (silicon v3.x); the part without X is end of life. |
| AP63203WU-7 (U103, 3.3 V converter) | Two pieces in stock. A common part elsewhere; order it in. The adjustable types of the family do not fit: this one has its divider inside. |
| PN532 | Fitted is the Tokmas PN5321A3HN (C53457895, about 6 USD, 48 in stock): same package and pinout as the NXP part, but its datasheet says nothing about the firmware inside, and it is not yet proven with ours. If it misbehaves, the NXP original (C28925, about 13 USD, none in stock) fits the same pads. JLCPCB's library draws the two parts a quarter turn apart: the placement file corrects the angle for the Tokmas part and for no other, so run `check-footprints` after changing the part number. NXP steers new designs to the PN7160. |
| DP9900M-5V | 48 in stock. Of the Silvertel Ag9905 only the types Ag9905-M and Ag9905-MT fit the footprint; the Ag9905-MTB and -LPB that Silvertel prefers have five pins in another order. |
| Display panel | Commodity part without a guaranteed part number. Agree on a fixed type with the supplier. |

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
| NFC matching was calculated for a larger loop: about 140 mA transmitter current with the loop on the board, limit 100 mA. | Values that stay below 90 mA for any loop between 1.0 and 1.3 uH. |
| 48 V parts and tracks directly at the rear wall of the jack's metal shell (0.1 to 0.3 mm), and the centre-tap capacitors as well. | Parts moved 2 mm away, 48 V nets under the shell on the inner layer, Ethernet pairs on the back layer. |
| Copper pour under the PoE module where its isolation barrier lies. | No copper there on any layer. |
| DC input without a filter: the converter's ripple would go out on the supply cable. | Pi filter C117, L103. |
| Unpowered inputs float up through the leakage of the OR-ing diodes; a USB-C host may then not power the port. | Bleed resistors R104, R105. |
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
  without surcharge, copper to milled edges 0.23 mm against 0.2).

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
- **Decoupling at the MCU.** The capacitors of several supply pins are 4 to
  9 mm from their pin; Espressif asks for one at each pin. They connect through
  vias into the planes. The space next to the pins is taken by the signals
  that leave the 0.35 mm pitch pad row, and the back of the board is under the
  display. If the MCU proves unstable at full clock speed, this is the first
  suspect, and it needs a new layout to change.
- **NFC range and tuning**, the second-source PN532, and the effect of the
  Ethernet plug and cable next to the loop on the lan version.
- **Wi-Fi range** with the antenna 7 mm from the display's metal back.
- **Isolation of the PoE side** under a 1500 V test (see "PoE isolation").
- **Tamper sensors.** What the proximity sensor reads on the dock and off it,
  with docks of the colours in use, and whether light on the case moves that
  reading. Whether the hall switch turns on and lets go at the distances
  calculated, whether the dock's magnet changes the buzzer's sound, and which
  accelerometer thresholds tell a knock from a door closing.
- **Hot-plugging a 24 V supply.** The TVS holds the peak below the converter's
  40 V limit by calculation. A 47 uF / 50 V electrolytic capacitor across C117
  would take the stress off the TVS; the board has no place for one.
