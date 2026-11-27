# Known limitations
<!-- llms-description: Where the Touch P4 board knowingly falls short of its design targets, why, what covers the gap, and which points only a built board can settle. -->

The targets the board does not fully meet, and the questions no drawing or model can answer, for hardware
developers planning bring-up or revision B. The targets themselves are in
[Design standards and review criteria](hardware/touch-p4/review.md); the design is in
[Design](hardware/touch-p4/design-notes.md).

Policy: a target that is infeasible or costs more than it is worth becomes a documented deviation; it is
not reopened without a new reason.

## Accepted deviations

### MCU decoupling (review item 5.3)

- **Target.** A capacitor within 3 mm of copper of every core, memory, regulator, analog, USB PHY and
  battery supply pin, within 5 mm for the 3.3 V IO pins; 10 uF close to VDD_LDO and VDD_DCDCC.
- **Reached.** 4 of 21 pins: VDD_DCDCC 2.0 mm (with its 10 uF), VDD_HP_3 1.4 mm, VDD_IO_6 1.3 mm,
  VDDO_3 3.5 mm. The others 3.3 to 13.7 mm; VDD_LDO has its 10 uF at 5.8 mm
  ([table](hardware/touch-p4/design-notes.md#decoupling-at-the-mcu)).
- **Why.** 21 supply pins at 0.35 mm pitch. Only every other pin can have a via inside the pad row, one
  capacitor fits per 1.05 mm of row, and the signal escapes need that room. 0201 parts on the component
  side change nothing (the row is the limit, and 0201 is an extended part at JLCPCB). 0201 parts on the
  back side need a second assembly side (about 34 USD more per order) and face the display's metal back
  1.7 mm away, where the folded display flex also lies; the board stays single-sided.
- **Mitigation.** Each pin has a via inside the pad row into the 3.3 V plane or the core pour. Simulated,
  the board adds 1.1 to 2.4 nH, about what the package adds itself. Bring-up runs a CPU and PSRAM stress
  test at full clock for an hour, cold and warm in the case, with the supplies on the scope.
- **Revision B.** 0201 capacitors on the back side on each pin's via (about 2.3 mm per pin) with polyimide
  film towards the display; or the P4 in a module.

### Crystal track length (review item 5.5)

- **Target.** At most about 5 mm of track from each crystal pin to the crystal.
- **Reached.** XTAL_N 6.8 mm, XTAL_P 6.5 mm, with a 2.0 x 1.6 mm crystal and no links in the lines.
- **Why.** Espressif asks for at least 4.5 mm between crystal and clock pins, which takes most of the
  5 mm. The spot is fixed between the NFC lines' vias above and the VDD_BAT parts below, and the crystal's
  signal pads lie on a diagonal, so each line passes the ground pad.
- **Mitigation.** No vias, ground fill both sides, unbroken ground below, no track under the crystal on any
  layer. The extra length adds about 0.3 pF, inside the 3 pF stray the load capacitors assume. Bring-up
  measures the frequency; the load capacitors change if it is off.
- **Revision B.** Move the NFC vias left and the crystal up to 5 mm, with a new route of that corner.

### Current from a USB-only supply (review item 2.4)

- **Target.** Read the current the USB-C source offers (CC level) and limit the board to it.
- **Reached.** A fixed limit: with DC and PoE absent the firmware keeps the board within 500 mA, the
  smallest any source offers (estimated 0.45 A: LEDs and buzzer off, backlight at 30 % or less).
- **Why.** The free ADC pins are on the MCU's far side; no route to the USB-C connector was left without
  rerouting the USB pair, the backlight line or the RMII bus.
- **Mitigation.** Hard firmware requirement with a bring-up test
  ([Pin map and firmware port](hardware/touch-p4/firmware-port.md)). Without firmware the eFuse limits
  the current to 1.8 to 2.2 A, and a source that cannot deliver protects itself.
- **Revision B.** CC1/CC2 to two ADC pins, so a 1.5 A or 3 A source runs the board at full brightness.

### Features at JLCPCB's limits (review item 6.2)

- **Target.** Nothing at the fab's limit unless a part's pitch forces it.
- **Reached.** Five features at the limit, none below: pad gap and mask web at the MCU's 0.35 mm pitch
  and the accelerometer's LGA; silkscreen line width, text height and distance to pads.
- **Why.** Espressif's P4 land pattern sets the pad gap and web; the silkscreen is at JLCPCB's smallest so
  designators fit at all.
- **Mitigation.** Green solder mask (the only colour with a 0.10 mm web); the assembly's AOI and X-ray
  look for bridges at the MCU; first boards inspected.
- **Revision B.** Nothing unless the first boards show bridges.

### Wi-Fi antenna placement (review item 9.3)

- **Target.** Espressif's placement for a PCB antenna (ESP32-C5 HDG 1.4.7, figures 22 and 23): antenna
  beyond the board edge, or over a cut on both sides and below it with at least 15 mm on the open end's
  side; ground point within 1 mm of a board edge at a right-hand corner; 15 mm free space round the antenna
  inside the housing.
- **Reached.** Module at the top edge, top left; antenna over a 6.0 mm deep cut from x 8.6 to 37.5
  (11.5 mm beyond the open end, 2 mm beyond the ground point), no copper on any layer within 15 mm
  beside it. Ground point 51 mm from the right edge. 1.8 mm to the case's top wall, 4.7 mm to its front.
  Full-wave model in the case with the display: -3.0 / -3.5 / -4.1 dB of power fed in at 2.4 GHz
  (channels 1, 7, 13) and -3.8 / -2.5 / -4.0 dB at 5.18 / 5.50 / 5.70 GHz, against -1.1 / -1.1 / -1.2 and
  -9.3 / -5.0 / -3.2 dB at Espressif's position 3: within 3 dB in every channel.
- **Why.** Position 3 is the top right corner, where USB-C, its eFuse path, its ESD part and a mounting
  hole sit and the impedance-controlled USB pair starts; moving them reroutes the pair and moves the
  case's boss. Out over the edge the antenna needs a case 7 mm taller. 15 mm clearance does not fit with
  1.5 mm to the walls. The upper left mounting hole stops the cut at 11.5 mm.
- **Mitigation.** The cut, the keep-out on all layers, ground vias under the module, a non-metal front over
  the antenna (an aluminium face plate only with a window over x 0 to 50.5; without it 1.5 to 1.9 dB less
  at 2.4 GHz). The module's certificate covers its antenna; the reader's radiated tests are done in its
  case ([CE and market checklist](hardware/touch-p4/compliance.md)). Bring-up measures range on both bands
  against a reader in use.
- **Revision B.** Module in the top right corner with USB-C moved down the right edge or to the top edge
  left of the module, or a case with room for the antenna out over the edge.

### SDIO tracks to the Wi-Fi module (review item 5.2)

- **Target.** Espressif's SDIO layout rules (C5 HDG 1.4.9): command and data within 1.27 mm of the clock's
  length, at most 50.8 mm, 50 ohm +-10 %, "Ensure that SDIO traces do not cross layers", unbroken reference
  plane, ground round the clock.
- **Reached.** All but the layer rule: six lines 40.3 mm each, equal within 0.01 mm, 0.15 mm on the back
  layer over In4 (49 ohm), clock with ground fill both sides. Each line changes layer twice (beside the
  MCU and below the module), the same in all six, with a ground via within 0.7 to 1.7 mm of every signal
  via.
- **Why.** Both chips' pads are on the front layer, and the front layer between them is taken by the core
  converter (U202, L201 and capacitors) and the 5 V and core supply tracks crossing it. Moving the
  converter would lengthen the MCU's core decoupling paths (item 5.3).
- **Mitigation.** Both layer changes go between two ground planes (In1, In4) with a ground via close by;
  equal via counts keep the delays equal. Simulated: clock and data within 0.18 ns; clock out and data back
  1.01 ns, leaving the P4 5.0 ns at 50 MHz and 10.0 ns at 40 MHz. Bring-up runs esp-hosted's raw
  throughput test at 40 and 50 MHz and counts CRC errors and timeouts before anything else uses the link.
- **Revision B.** Module next to the P4's slot 0 pins with the core converter moved to the P4's other side,
  for a front-layer bus.

### ESD at the LED windows, buzzer and lock screws (review item 9.1)

- **Target.** Every port and surface reaches the test level (4 kV contact, 8 kV air, criterion B), shown
  by the protecting part's rating.
- **Reached.** Every cable port, the display edges and flex, the NFC area and the glass. Not shown: the LED
  windows (SK6812MINI-E rated 2 kV HBM, a handling figure), the buzzer holes (no rating for buzzer or FET)
  and the two floating lock screws.
- **Why.** A diode at each of 16 LEDs, the buzzer and the screws is not practical; what decides these is
  the air and surface path through the case, which no datasheet gives.
- **Mitigation.** ESD pre-test on the first readers before the lab: 8 kV air on every LED window, the
  buzzer holes, the seams and the glass edges, 4 kV contact on the lock screws.
- **Revision B**, if the pre-test fails: diffusers with a flange that closes the seam, buzzer holes offset
  from the port, nylon lock screws.

### Designators of the small passives (review item 7.6)

- **Target.** Every designator on the silkscreen; where a few cannot fit, the assembly drawing covers them.
- **Reached.** Every IC, crystal, inductor, bead, diode, transistor, connector, switch, fuse, array and the
  buzzer has one (a test fails if one is missing). 114 0402/0603 passives around the MCU, PHY and NFC chip
  have none.
- **Why.** At 1.0 mm text, JLCPCB's smallest, there is no room without covering pads.
- **Mitigation.** `fab/jlcpcb/attractap-touch-p4-assembly.pdf` shows every designator, with enlarged pages
  of those areas.
- **Revision B.** None planned.

## Open points

What only a built board can settle. Each is a step in the [Bring-up plan](hardware/touch-p4/bring-up.md).

| Open point | What is known | How bring-up settles it |
|---|---|---|
| Display flex fold and reach | Measured on one sample panel (26 November 2026): the flex folds flat onto the LCD's metal back, its stiff part (touch controller, 1.3 mm high) ends about 13.5 mm from the glass edge (from photos, +-0.5 mm; the slot allows 7.5 to 18 mm), its end reaches 25.6 mm. After the S-bend through the slot it should reach about 3.6 mm into J601; the S-bend's length is calculated, not tried, and the FH12's insertion depth is not checked against its drawing. Other makers' panels may differ. A short flex cannot be repaired | Before ordering: lay the panel you will buy on a 1:1 print with a 1.7 mm spacer and plug the flex in. Fallback if it does not reach: move J601 and the slot towards the display's lower edge (the stiff part's end must stay over the slot) |
| MCU stability with the decoupling as routed | See the deviation above; first suspect if the MCU is unstable at full clock | CPU and PSRAM stress test, one hour, cold and warm, supplies on the scope |
| Crystal frequency | Load capacitors 12 pF for an estimated 3 pF stray; Espressif's board implies 4 pF (10 pF capacitors) | Measure the frequency; step to 10 pF if it is low |
| NFC loop, tuning and range | Loop simulated, not measured: 1.25 uH on the board, 1.20 uH on metal. Every board stays inside the transmitter limit for 1.12 to 1.25 uH, 99 in 100 for 1.08 to 1.27 uH. The field powers a card up to 19 mm out (15 mm on metal); whether the reader hears the card is not modelled. The lan version's plug and cable sit 8 mm from the loop | Measure the loop before switching the field on, then the transmitter current; tune with a network analyser with the display fitted; tune the lan version with the cable plugged in; check read range with the cards in use |
| Second-source PN532 | The Tokmas PN5321A3HN's datasheet says nothing about its firmware; not proven with ours. The NXP original fits the same pads | First boards run the NFC stack on it |
| Wi-Fi range | The antenna model is a stand-in of the same size and kind, not Espressif's antenna | Range on both bands against a reader in use, in the case on the wall |
| esp-hosted link | Two unresolved reports from custom boards (timeouts, CRC errors put down to timing margin); unknown whether the C5's SDIO unit behaves like the C6's | Raw throughput and error count at 40 and 50 MHz before anything else uses the link |
| PoE isolation | The copper keeps the 3 mm rule; what lies inside parts and assembly is untested: the module, C102, and the tape between jack pin 9 and the display | Isolation test on an assembled unit before the lab; ask the lab whether it tests it |
| Heat | Estimate ±40 %; inside limits in typical use, little to spare on PoE at 40 °C (display 64 °C of 70, Wi-Fi module's air up to 77 °C of 85) | Closed case on the wall, after an hour, including the air beside the Wi-Fi module. If warmer, LEDs and backlight are what the firmware takes back |
| Tamper sensors | Proximity reading depends on the dock's colour; infrared through the white plastic; hall switch on at the dock, off after 9 to 33 mm of lift (simulated) | Readings on and off the dock with the dock colours in use, with light on the case; hall switch distances; whether the magnet changes the buzzer's sound; accelerometer thresholds that tell a knock from a door closing |
| Hot-plugging a 24 V supply | Simulated: converter input at most 31 V at 24 V (34.7 V at 26.4 V), limit 40 V | Measure on the first board with a few metres of thick wire to a stiff supply |
| Surge levels | EN 50130-4:2011 surge levels for DC lines not yet read from the purchased standard | Read before the lab ([CE and market checklist](hardware/touch-p4/compliance.md)) |
| USB port on a warm reader running from another supply | R104 holds the unplugged VBUS near 0 V against the eFuse's typical leakage | With the reader warm, check that a USB-C host still switches its supply on |
| 3.3 V converter stability | U103's rail at 44.5 uF and U302's at 47.2 uF effective, against TI's 52.8 uF; loop crossover not published | Load step 0.1 to 1 A with and without C108 |
| Power budget assumptions | 60 mA allowed for the panel's 3.3 V; LEDs below 100 mA together and buzzer only with the NFC field off are firmware rules | Measure the panel's current; test both firmware limits and the USB-only mode |
| DC terminal holes | 1.2 mm holes are 0.1 mm over the WAGO 250's maximum | Check the hole fill on the first boards |
| Ethernet crystal in the cold | 25 MHz crystal rated to 50 ohm ESR, PHY asks 40 ohm; typical parts far below | Only if the Ethernet clock fails to start cold: look here first |
