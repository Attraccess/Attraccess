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
| Layers | six: signals on both outer layers and one inner layer, each next to a plane of its own | Two signal layers are not enough around the MCU. On four layers the third one shared its layer with the 3.3 V pour and cut it apart, so the fast buses had no unbroken plane to return on (see [Review against layout rules](#review-against-layout-rules)). |

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
  the display's metal back is 7 mm away and one mounting screw 11 mm. A
  full-wave model of the board with the display and the case finds no loss
  from that (see "Simulation"): the display's back lies over the board's own
  ground. The version with an external antenna does not depend on this.
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
- DC input: meant for 12 V or 24 V supplies; 28 V is the most it stands
  continuously. The jack is rated 24 V. The converter (AP63205) works up to
  32 V, stands 35 V continuously and 40 V for 0.4 s. The TVS is an SMBJ26A
  (600 W): it starts to conduct between 28.9 and 31.9 V and, by its
  datasheet's figures, keeps the input below 40 V up to a peak current of
  11 A (42.1 V at its rated 14.3 A). A live 24 V supply being plugged in
  puts up to 8 A through it (next point). The smaller SMAJ28A fitted first
  reached 40 V at 4.5 A. The TVS cannot hold a lasting overvoltage, and a
  surge from a long supply line can still exceed 40 V: holding that needs a
  converter rated for 60 V. Reversed polarity does no harm (series diode
  D105). The inductor L102 is rated for 25 V across it, which is reached at
  30 V input.
- Plugging in a live supply. The supply's cable and the three input capacitors
  (C117, C112, C113) form a resonant circuit, and what damps it is only the
  resistance of cable and fuse; the fuse has 0.05 to 0.25 ohm. A ceramic
  capacitor loses capacitance as the voltage rises. One that is large while it
  charges and small once it is charged makes the input swing far above the
  supply: the charging current still flows when most of the capacitance is
  gone. The capacitors fitted first, 10 uF / 50 V, are of that kind; the ones
  fitted now, 2.2 uF / 100 V in the same size, are not. Their makers' curves:

  | Capacitance at | 5 V | 12 V | 24 V | 40 V |
  |---|---|---|---|---|
  | 10 uF / 50 V X5R (CL31A106KBHNNNE) | 7.3 uF | 3.4 uF | 1.35 uF | 0.63 uF |
  | 2.2 uF / 100 V X7R (CL31B225KCHSNNE) | 2.2 uF | 2.0 uF | 1.53 uF | 1.02 uF |

  Simulated with these curves: the peak at the converter, whose limit is 40 V,
  when a 24 V supply without resistance of its own is plugged in, with the TVS
  at its upper limit:

  | Cable to the supply | 10 uF / 50 V, fuse 0.05 ohm | 2.2 uF / 100 V, fuse 0.05 ohm | 0.12 ohm | 0.25 ohm |
  |---|---|---|---|---|
  | 1.5 m, 2 x 0.35 mm2 (plug-in supply) | 38 V | 34 V | 32 V | 29 V |
  | 3 m, 2 x 0.75 mm2 | 43 V | 36 V | 35 V | 33 V |
  | 5 m, 2 x 0.75 mm2 | 41 V | 36 V | 35 V | 33 V |
  | 5 m, 2 x 1.5 mm2 | 45 V | 38 V | 36 V | 34 V |
  | 10 m, 2 x 1.5 mm2 | 43 V | 37 V | 36 V | 35 V |
  | 20 m, 2 x 1.5 mm2 | 39 V | 36 V | 35 V | 34 V |

  With the first capacitors the input was above 40 V for 2 to 3 microseconds
  in four of the six rows, with up to 19 A in the TVS. Now it stays at 38 V
  or below and the TVS carries 8 A at most; the capacitors' tolerance of 10 %
  moves that by 0.3 V. A supply of 26.4 V (24 V plus 10 %) gives up to
  39.5 V. One of 28 V gives 41 V with 5 m of thick wire: 28 V is what the
  input stands continuously, not what may be plugged in live. A 12 V supply
  stays below 23 V with either capacitor. Not simulated: contact bounce. The
  curves are the makers' typical ones.

  What the change costs: at 12 V the converter has 3.9 uF at its input instead
  of 6.8 uF (at 24 V 3.1 uF instead of 2.7 uF). That is 85 mV of ripple at
  1.5 A, and the input filter stays stable with the converter as a load of
  constant power, simulated for cables up to 20 m. The converter's datasheet
  names 10 uF; one 10 uF / 50 V part of this size is the 3.4 and 1.35 uF of
  the first table. The part is not a basic one at JLCPCB (3 USD per order).
  An electrolytic capacitor of 47 uF across C117 would end the swing
  altogether (25 V); the board has no place for one.
- DC input filter: C117 (2.2 uF), L103 (2.2 uH) and the converter's own input
  capacitors C112/C113 (2.2 uF each) form a pi filter. Without it the converter's 1.1 MHz
  ripple current would run straight out on the supply cable; conducted
  emission on that cable is measured when it may be longer than 3 m. The
  filter takes 40 to 50 dB off at 1.1 MHz (calculated, not measured). It has no
  common-mode choke: if the lab finds emissions from the cable above 30 MHz, a
  clip-on ferrite at the cable is the first remedy. The TVS sits behind the
  inductor, at the converter, so it also clamps what the filter rings up to
  when a supply is plugged in live. The capacitors keep 2.0 uF each at 12 V
  and 1.5 uF at 24 V (see above); the figure is for these values.
- Bleed resistors: R104 (USB) and R105 (DC converter output), 4.7 k each. The
  OR-ing diodes leak up to 0.1 mA when hot. Without a load that lifts the
  unpowered input to several volts: a USB-C host then does not switch its
  supply on (it wants to see 0 V first), and the DC converter gets a supply
  through its own output. Each resistor costs 1 mA while its source is on.
  The diode's datasheet shows typical curves only: 1 uA at 25 °C, 0.1 mA at
  75 °C and 0.5 mA at 100 °C, which is 0.005, 0.5 and 2.4 V across 4.7 k. A
  USB-C host accepts up to 0.8 V. That is enough for a reader at room
  temperature and has no margin for a hot one or for a diode that leaks more
  than the typical one; 1 k in place of R104 gives five times the margin for
  5 mA.
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
copper is poured there on any layer, and the PoE net class keeps 2 mm from every
other net. That rule compares copper on one layer only; from layer to layer the
keep-out areas do its job: no pour on any layer comes closer than 2 mm to 48 V
copper (below C102's 48 V pad the inner pours used to end 0.9 mm from it).
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
  layer, which faces the display: the two lines from the jack and the filtered
  negative line beside the module (19 mm) run on the inner layer In2.

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
[firmware-port.md](firmware-port.md)). The Espressif ESP32-P4 board works the
same way.

The 25 MHz crystal (ESR up to 50 ohm) is above what the PHY datasheet allows
(40 ohm). Typical parts are far below both. If a board ever fails to bring up
the Ethernet clock in the cold, look here first.

## Wi-Fi and Bluetooth: the ESP32-C6 behind the ESP32-P4

The P4 has no radio. The C6 module runs Espressif's esp-hosted firmware and is
the P4's Wi-Fi adapter and Bluetooth controller over SDIO. This pairing has a
reputation for trouble. On 24 November 2026 the reports in Espressif's
esp-hosted tracker and in the trackers of ESPHome and Arduino were read for
what caused them, and each cause was held against this board.

What Espressif asks of the hardware
([getting started](https://github.com/espressif/esp-hosted-mcu/blob/main/docs/getting-started-mcu.md#1-sdio)),
and what the board has:

| Asked for | Here |
|---|---|
| The C6's fixed SDIO pins (CLK 19, CMD 18, D0 to D3 20 to 23) | as asked |
| On the P4 the pins of slot 0, which are wired straight to the SDIO unit, for the best timing; slot 1 goes through the pin matrix | slot 0 (GPIO39 to 44). Most boards with this pair, Espressif's included, use slot 1, because their slot 0 holds the SD card |
| 51 k pull-ups on CMD and D0 to D3 | R305 to R309, 51 k |
| A reset line from the host to the module's EN pin | GPIO45 through 1 k (R302) to EN, which has 10 k and 1 uF. esp-hosted's 10 ms pulse takes EN to 0.3 V and holds it below its threshold for 8.4 ms |
| Short tracks of equal length, clock matched to data first; series termination where needed | 37 to 46 mm, clock 39 mm with 22 ohm at the P4. Simulated: clock and data arrive within 0.2 ns of each other, and clock out plus data back take 1.1 ns of the 25 ns that one clock period at 40 MHz has |
| A supply at the module that does not dip | 22 uF and 100 nF at the module, from the 3.3 V plane of the 2 A converter |

The reports, by cause:

| Report | Cause | Here |
|---|---|---|
| Wi-Fi does not associate, `Dropping packet(s) from stream`, restart loops ([ESPHome 10956](https://github.com/esphome/esphome/issues/10956), [esp-hosted 151](https://github.com/espressif/esp-hosted-mcu/issues/151)) | The C6 ran another esp-hosted version than the P4. Bought boards come with an old one, or none | The module comes empty. We flash it, through its test points, and keep both sides on one version |
| `send_op_cond returned 0x107`, `card init failed` at start ([esp-hosted 127](https://github.com/espressif/esp-hosted-mcu/issues/127), [Arduino 11404](https://github.com/espressif/arduino-esp32/issues/11404)) | The C6 was held in reset by the wrong reset polarity in the configuration, was not powered (its supply switched by an IO expander), or had no firmware | The module's supply is not switched. The polarity is a firmware setting ([firmware-port.md](firmware-port.md)) |
| `Unrecoverable host sdio state` (0x107) after minutes or hours ([esp-hosted 167](https://github.com/espressif/esp-hosted-mcu/issues/167), [121](https://github.com/espressif/esp-hosted-mcu/issues/121)) | By Espressif's analysis of 18 November 2026, three things: a display library that called the chip's ROM cache functions while SDIO was busy; a fault in esp-hosted 3.0.9, fixed in 3.1.0; and on one custom board something not found yet, where Espressif asked about noise on the pins that share the SDIO pins' supply and about the module's 3.3 V | Firmware, for the first two. On the third: the SDIO pins' supply group (GPIO39 to 48) also carries the module's reset, the buzzer signal and the LED data line here, all of them slow signals into high impedances, and no power stage |
| CRC errors (0x109) under load on a custom board ([esp-hosted 167](https://github.com/espressif/esp-hosted-mcu/issues/167)) | Not settled. Espressif reads it as the timing margin between the two chips, which depends on track length and load: its own board shows none at 50 MHz with the C6's default clock edges and many with the other edges. The reporter found no host timing that cured it and suspects the C6's SDIO unit | The board's share of the timing is 1.1 ns (see above). Stay with the default edges |
| Downloads stall after about 100 kB ([esp-hosted 184](https://github.com/espressif/esp-hosted-mcu/issues/184)) | The access point: gone with other access points, and on one Wi-Fi 6 network gone when the C6 was kept from 802.11ax | Firmware |
| Double free in the SDIO receive task ([esp-hosted 210](https://github.com/espressif/esp-hosted-mcu/issues/210)) | `esp_wifi_remote` older than the esp-hosted it was built with | Firmware |
| The C6's firmware cannot be updated over SDIO any more ([esp-hosted 143](https://github.com/espressif/esp-hosted-mcu/issues/143)) | Co-processor firmware 2.1 to 2.8 flashed first: its boot loader does not start later images | Firmware: the first image flashed is a newer one. The test points remain as a way back |
| Bluetooth scan goes silent after 90 s ([esp-hosted 180](https://github.com/espressif/esp-hosted-mcu/issues/180)) | The board had the module without an antenna of its own (MINI-1U) and no antenna plugged in | The version with the external antenna must not be run without one |
| Bluetooth: connecting as central never completes for some devices ([esp-hosted 204](https://github.com/espressif/esp-hosted-mcu/issues/204)) | A fault on the host side. A patch posted in the report in July 2026 cured it for the reporter; the report was still open in November 2026 | Firmware. It matters: the reader's Bluetooth proxy is a central that scans and connects |
| "The early board had wrong crystal capacitors and a fault in the radio part" (a comment on [esp-hosted 155](https://github.com/espressif/esp-hosted-mcu/issues/155)) | A board with a bare C6 chip | Certified module with its own crystal and antenna match |

None of the causes that were found is in the circuit or the layout of this
board. Nearly all are firmware versions and settings, which
[firmware-port.md](firmware-port.md) lists, and two are in the assembly (an
empty module, a missing antenna). Two reports from custom boards are not
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

No via hole lies under solder paste, where the solder would run into it: the
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

Not done in revision A: controlled-impedance routing. USB runs at full speed
(12 Mbit/s) and the Ethernet pairs are 11 to 18 mm long and run side by side,
so this is uncritical. Their width and gap (0.2 / 0.2 mm) are not calculated
for 100 ohm; over the 0.1 mm of this stack-up they come out lower (roughly
85 ohm, estimated, not from the manufacturer's calculator), and a 0.15 mm
signal track near 50 ohm.

Lengths of the fast buses on the routed board: the six SDIO lines to the Wi-Fi
module are 38 to 46 mm, the RMII lines to the PHY 40 to 48 mm and its 50 MHz
clock 59 mm, with two to four vias each. Both are well inside what these
interfaces tolerate. The Ethernet pairs from the PHY to the jack are 11 to
18 mm. The RMII transmit lines have no series resistors (there is no room for
them at the MCU); the firmware sets their drive strength instead (see
[firmware-port.md](firmware-port.md)).

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
open in front of them. Reference designators are not on it: on a board this
dense they would overlap. They are on the assembly drawing layer
(`fab/board-front.pdf`).

- Component side, the side one sees with the reader off its dock: test points
  in named groups (C6, P4 UART0, power), how to get into download mode, the
  limits of the connectors, the border of the 48 V side, the LED numbers as the
  firmware counts them, and a white field of 10 x 2 mm beside `S/N`: JLCPCB
  prints a number that differs from board to board into a field of that size
  if the order asks for it (see the README). A reader that comes back can then
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
without parts, where assembly cannot tin them, and the 15 test points, four of
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

Once per order JLCPCB adds 3 USD for every extended part line (38 lines on the
Wi-Fi version, 43 on the Ethernet/PoE version by its catalogue of 22 November
2026, preferred parts not counted), the setup and stencil fees, the bare
boards and shipping. On five boards the extended-part fees alone are 23 to
26 USD per board, so a small prototype order costs far more per board than the
table shows.

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
| USB protection SRV05-4-P-T7 (C85364, a preferred part) instead of the USBLC6-2SC6 | 3 USD per order (one extended line less) | Same package, and the board's wiring suits it: it has four lines where the USBLC6 has two, and each USB line already goes to two pins. But it is another maker's part at the one connector an ESD test will hit, and its angle in JLCPCB's library is unchecked. |

Where a part has an equivalent in JLCPCB's basic or preferred list, the design
uses that one (the TVS diodes, 1 uF / 50 V, and 510 k instead of 499 k in the
core converter's divider, where only the ratio counts). The one exception is
the three capacitors of the DC input: the basic 10 uF / 50 V part fits their
pads and is the wrong part there (see "Power"). The five other extended
passives (39 pF, 180 pF and 220 pF of the NFC matching, 1.5 ohm and 6.19 k)
have no basic or preferred part of the same value: the parts with these values
in the series the basic parts come from are extended parts as well (looked up
on 22 November 2026). Three of the five (39 pF, 180 pF, 1.5 ohm) are tuning
values that the first boards will change anyway. The 10 pF of the matching is
a basic part and the 3.9 k of the receive divider a preferred one (looked up
on 24 November 2026).

## Sourcing risks

Stock figures are JLCPCB's of 22 November 2026. Every line of both parts
lists was looked up that day; the lines not named here have more than 2000
pieces.

| Part | Risk |
|---|---|
| ESP32-P4NRW32X | No stock at JLCPCB or LCSC. Has to be ordered in before assembly. Use the X part (silicon v3.x); the part without X is end of life. |
| AP63203WU-7 (U103, 3.3 V converter) | Two pieces in stock, none at LCSC. A common part elsewhere; order it in. The adjustable types of the family do not fit: this one has its divider inside. |
| PN532 | Fitted is the Tokmas PN5321A3HN (C53457895, about 6 USD, 123 in stock): same package and pinout as the NXP part, but its datasheet says nothing about the firmware inside, and it is not yet proven with ours. If it misbehaves, the NXP original (C28925, about 13 USD, none in stock) fits the same pads. JLCPCB's library draws the two parts a quarter turn apart: the placement file corrects the angle for the Tokmas part and for no other, so run `check-footprints` after changing the part number. NXP steers new designs to the PN7160. |
| DP9900M-5V | 38 in stock, ten fewer than two days before. Of the Silvertel Ag9905 only the types Ag9905-M and Ag9905-MT fit the footprint; the Ag9905-MTB and -LPB that Silvertel prefers have five pins in another order. JLCPCB lists no Ag9905. |
| DC jack PJ-002A (J102), inductor CKCSA252012-2.2uH/M (L103, L201, two per board) | 1022 and 1171 in stock: enough for a first order, low for a series. |
| Inductor CKCSA4020-6.8uH/M (L102) | 2228 in stock, but JLCPCB's library has no footprint for this part number, so `check-footprints` cannot compare it. It is the body of L101 (same series, same footprint, which does compare), has two pads and no polarity. Look at it in the placement preview. |
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
| NFC matching was calculated for a larger loop: about 140 mA transmitter current with the loop on the board, limit 100 mA. | Values that stay below 90 mA for any loop between 1.0 and 1.3 uH when every part has its exact value (with the parts' tolerance: 1.12 to 1.22 uH). Changed once more after the simulation, see below. |
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
| TVS of the DC input: 45 V at its rated current against the converter's 40 V. | SMBJ26A, see "Power". |
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
- 3D models. KiCad's library has one for the display connector only; those of
  the other connectors and the modules would have to be downloaded and kept
  in the repository.
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
| Plugging in a live 24 V supply: these notes said the TVS keeps the converter's input below 40 V. That rested on a current of 11 A at most. The three input capacitors (10 uF / 50 V) keep 1.35 uF each at 24 V by their maker's curve, and simulated with that curve the input reached 41 to 45 V, with up to 19 A in the TVS, for 3 to 10 m of ordinary installation wire. | C112, C113 and C117 are 2.2 uF / 100 V X7R in the same size: 38 V at most. Figures and what it costs in "Power". |
| USB port while another supply runs the board: the bleed resistor holds the unplugged port below what a USB-C host accepts only as long as the OR-ing diode leaks no more than the typical one at 75 °C. | No part changed. Figures in "Power", a check with the reader warm in the bring-up plan. |

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
  board, with other pins (see [firmware-port.md](firmware-port.md)).
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
  2 A, the DC converter 1.5 A of 2 A, an OR-ing diode dissipates 0.6 W and the
  PoE module is below its 9 W. The DC input then draws 0.75 A at 12 V. Its fuse
  holds 1.1 A at 25 °C and 0.7 A at 60 °C, so it is the tightest part of the
  chain: fine for the 4.5 W peak these notes assume (0.5 A), no margin for
  7 W in a warm case.
- Start-up: the 3.3 V converter starts at 3.5 V on the 5 V rail and ramps for
  4 ms; the reset pins of the MCU and of the Wi-Fi module follow 14 ms later;
  the core runs from the chip's own regulator until the firmware switches the
  converter on. Backlight, LEDs, buzzer and PN532 are held off by resistors
  until then.
- Pin map: no GPIO is used twice, the four USB pads are respected (GPIO26, the
  backlight, is one of them; Espressif's board uses it for its backlight too),
  the Ethernet signals are on pins the MAC can reach without the GPIO matrix.
- Manufacturing files: drill table (smallest plated hole 0.2 mm, smallest
  unplated 0.6 mm, slots 0.8 and 1.0 mm wide), stack-up in the job file, and
  the paste layer of the display side, which is empty now.

Looked at and left as they are:

- The core converter's divider has 510 k twice where Espressif's guidelines
  say 499 k "must be populated". The ratio, which sets the voltage while the
  chip leaves its feedback pin alone (1.2 V), is the same. How the chip moves
  the voltage through that pin is not documented. If it feeds a current into
  the divider's tap, each step it makes is 2 % larger with 510 k: 2 mV on
  the way from 1.2 to 1.1 V. Fit 499 k (an extended part) if the core voltage
  on the first board is off.
- The 100 k from the converter's enable input to ground is not in Espressif's
  circuit. It only matters while the chip does not drive the pin.
- The SDIO lines have a series resistor in the clock only. The guidelines ask
  to reserve one in every line; Espressif's own board has none.
- Rails without a test point: the two regulator outputs of the MCU (flash,
  PSRAM), the PN532's 3.0 V, the PHY's 1.1 V, the outputs of the DC converter
  and of the PoE module, the backlight. The bring-up plan names a capacitor or
  a diode to measure each at; a test point each would need room near the MCU
  that the board does not have.

### Simulation

On 24 November 2026 the routed board was simulated where a simulation can
answer. The copper is read out of the board file and the part values out of
the circuit description, so the figures are for this layout, not for a
textbook one. The scripts are in `sim/` and run as the `simulate` target, which
fails when a limit of a part is missed; [sim/README.md](../sim/README.md) says
what each one models. Two field solvers were written for it (inductance and
field of tracks and copper areas; impedance of a track in the layer stack).
Both are checked against closed-form results on every run. The circuits run in
ngspice, and the Wi-Fi antenna in openEMS, a full-wave solver (the
`simulate-antenna` target). Nothing was built or measured.

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
  (C117) sees more, up to 43 V; it is a 100 V part.
- Power-up from USB: the 3.3 V rail is up after 3.8 ms. The MCU's reset input
  is at 0.53 V then and passes 0.83 V, the highest level it still takes for
  low, 1.1 ms later; the chip asks for 50 us. On a weak port (4.5 V behind
  0.5 ohm) the 5 V rail runs at 3.8 V, the least the 3.3 V converter works
  from: enough, with nothing to spare. Plugging in draws 7.5 A for some
  microseconds, into about 50 uF where the USB standard allows a device 10 uF.
  Ports stand that; it is one more reason why this is a service port.
- Track impedance on this layer stack, 0.15 mm track with the ground fill
  beside it: 49 ohm on the outer layers, 46 ohm on In2 (5.7 and 7.0 ps/mm).
- Reflections on the fast lines, with the routed lengths. The lines with a
  series resistor (RMII clock and receive lines, SDIO clock, display clock)
  show none. The lines without one (RMII transmit, SDIO data and command, 40
  to 48 mm) overshoot by 0.13 V at the MCU's default drive strength, and by
  0.6 to 0.8 V at the strongest, where the level then swings back to 3.0 V.
  The firmware must leave these pins at the default strength or below
  ([firmware-port.md](firmware-port.md)).
- Supply tracks with everything on at once, 1.5 A on the 5 V rail: 0.13 V lost
  at most, at the far LED row, and no track of the outer layers carries more
  than the current for a 20 K rise. The USB input's 1.5 A runs through 13 mm
  of inner layer 0.62 mm wide, more than the rule for a free inner track
  allows; this one lies 0.1 mm from a plane that takes its 70 mW.
- SDIO link to the Wi-Fi module: the clock arrives 0.6 ns after it leaves
  the MCU, the data lines 0.4 ns, so they stay within 0.2 ns of each other;
  clock out and data back take 1.1 ns. After a module that answers within the
  14 ns of the SD standard that leaves the MCU 9.9 ns at 40 MHz and 4.9 ns at
  50 MHz. The board is not what limits this link (see "Wi-Fi and Bluetooth").
- Wi-Fi antenna, in a full-wave model (`sim/wifi_antenna.py`). The module's
  antenna is not published, so a stand-in of the same size and kind was tuned
  on a small evaluation board and then put on this board unchanged:

  | Case | Resonance | Bandwidth at -6 dB | Radiated of the power fed in, channel 1 / 7 / 13 | Of that towards the room |
  |---|---|---|---|---|
  | on an evaluation board of 40 x 55 mm | 2.422 GHz | 104 MHz | -5.3 / -5.4 / -5.7 dB | 47 % |
  | on this board | 2.394 GHz | 164 MHz | -2.1 / -2.4 / -2.8 dB | 48 % |
  | with the display, on its four ground pads | 2.394 GHz | 156 MHz | -2.1 / -2.4 / -2.9 dB | 48 % |
  | with the display, not grounded | 2.394 GHz | 160 MHz | the same within 0.1 dB | 48 % |
  | in the printed case | 2.364 GHz | 174 MHz | -2.2 / -2.6 / -3.2 dB | 47 % |
  | in the case, metal wall 16 mm behind | 2.372 GHz | 188 MHz | -3.9 / -4.6 / -5.5 dB | 78 % |

  The display's metal back changes nothing: it lies over the board's own
  ground, and the gap between the two has no resonance in the band. The board
  does not cost anything either; with its large ground the stand-in radiates
  3 dB more than on the small evaluation board. Board and case together pull
  the resonance down by 58 MHz; the case's share of that costs 0.2 dB in the
  middle of the band and 0.4 dB at the top channel. A metal wall takes 2 dB of the radiated
  power and sends most of the rest forward: towards the room it comes to the
  same. So the model does not bear out the "less range than a development
  board" that these notes expected from the 7 mm between antenna and display.
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
  2.1 kV. Not in this figure, because they are inside parts: the 1.8 mm
  between the pads of C102, the PoE module's own barrier, and the 0.5 mm
  between the jack's pin 9 and the display's metal back, which the polyimide
  tape has to hold (see "PoE isolation").
- Heat in the closed case, estimated within 40 % (textbook figures for still
  air, rise over the room):

  | Supply | Typical use | Board | Warmest spot | Display | Everything on for a long time: board, LED rows |
  |---|---|---|---|---|---|
  | USB | 2.6 W | +23 K | +33 K | +17 K | +42 K, +70 K |
  | DC, 12 V | 3.0 W | +26 K | +37 K | +19 K | +48 K, +75 K |
  | PoE | 3.6 W | +31 K | +40 K | +23 K | +55 K, +82 K |

  In a room of 25 °C typical use is far from every limit. In a room of 40 °C
  on PoE the estimate puts the display at 63 °C (limit 70 °C), the Wi-Fi
  module at 79 °C (85 °C) and the air around the PoE module at 71 °C (85 °C):
  inside the limits, by less than the estimate is exact. The DC input's fuse
  then holds 0.66 A against 0.28 A drawn. Everything on at once for a long
  time is beyond what the case can shed: the LED rows, on narrow copper
  between the cut-outs, get 70 to 80 K warmer than the room. The firmware
  limits the LEDs and watches the chip's temperature
  ([firmware-port.md](firmware-port.md)).
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
- **Decoupling at the MCU.** Of its 21 supply pins 7 have their nearest
  capacitor more than 5 mm away (6.7 mm at most) and 5 within 3 mm; Espressif
  asks for one at each pin. They connect through vias into the planes, which
  are unbroken now. Simulated, the board's share of the way from a pin to its
  capacitors is 1.2 to 2.4 nH, about what the package adds itself. The space next to the pins is taken by the signals that
  leave the 0.35 mm pitch pad row, and the back of the board is under the
  display. If the MCU proves unstable at full clock speed, this is the first
  suspect, and it needs a new layout to change.
- **NFC range and tuning**, the second-source PN532, and the effect of the
  Ethernet plug and cable next to the loop on the lan version. The loop's
  inductance is simulated (1.25 uH on the board, 1.20 uH on a metal wall), not
  measured. With the values fitted every board is sure to stay inside the
  transmitter's limit between 1.12 and 1.25 uH, and 99 in a hundred between
  1.08 and 1.27 uH. The field is simulated too: it powers a card up to 19 mm
  in front of the case (15 mm on a metal wall). What no model here says is
  how well the reader hears the card.
- **Wi-Fi range.** The model finds no loss from the display's metal back
  7 mm from the antenna, and 0.2 to 0.4 dB from the case. It was made with a
  stand-in for the module's antenna, so compare the first reader with a
  current one (bring-up plan).
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
- **Hot-plugging a 24 V supply.** By simulation the converter's input peaks
  at 29 to 38 V, against its limit of 40 V (see "Power"). That is 2 V of
  margin from a model, so measure it on the first board, with a few metres of
  thick wire to a stiff supply. If it comes out higher: a 47 uF / 50 V
  electrolytic capacitor across C117 ends the swing, and has to be wired on,
  because the board has no place for one.
- **The USB port on a warm reader that runs from another supply.** Whether a
  USB-C host switches its supply on depends on the leakage of one diode
  (D102) when it is warm (see the bleed resistors in "Power").
