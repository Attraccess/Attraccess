# Bring-up plan
<!-- llms-description: Step-by-step plan for powering up and testing the first assembled Touch P4 boards, from power rails to Wi-Fi, NFC, heat and pre-compliance checks. -->

The test steps for the first assembled boards, with expected values and pass criteria. For whoever builds and tests them.

Work through the stages in order. Stop and investigate when a step fails. Use a current-limited bench supply for the first power-up.

## Before ordering

- [ ] **Display flex fit.** Glue 1:1 prints of the [component side](_media/hardware/touch-p4/board-front.pdf ':ignore') and the [display side](_media/hardware/touch-p4/board-back.pdf ':ignore') back to back on 1.6 mm card. Fold the display's flex flat onto its metal back and lay the display on the card's display side on a 1.7 mm spacer. Pass: the stiff part with the touch controller lies flat on the metal back and ends over the slot behind the display, the contact strip goes through the slot in an S-bend as described in [design-notes.md](hardware/touch-p4/design-notes.md), it goes into J601 to its stop without being stretched, contacts face the board. Repeat at 2.0 mm, the upper limit. No calculation replaces this: a flex that is too short cannot be repaired.
- [ ] An electronics engineer reviews the open points in [Known limitations](hardware/touch-p4/limitations.md).
- [ ] JLCPCB (or the chosen assembler) can supply every BOM line, in particular the ESP32-P4NRW32X and, for the lan version, the PoE module DP9900M-5V. Short lines: [parts.md](hardware/touch-p4/parts.md), sourcing risks.
- [ ] Run the `check` and `check-footprints` targets ([development.md](hardware/touch-p4/development.md)) and look at the Gerbers in a viewer. `check` includes the simulations; report: `fab/reports/simulation.txt`.
- [ ] Bare boards, before assembly: an LED drops into each of its windows without force.

## Power, without display

| # | Step | Pass |
|---|---|---|
| 1 | Visual check of orientation: U201 (pin 1), U301, J601, U105 to U107, U204, Q101, Q102, D101, D103, D105, D106, C103, C120, the LEDs | all correct |
| 2 | Resistance to ground at the `5V`, `3V3`, `VDD_HP`, `5V_USB`, `VDC` and `5V_DC` test points | no short |
| 3 | 5 V into USB-C, supply limited to 200 mA | `5V`: about 5 V (the eFuse U105 loses a few mV; no diode drop). `3V3`: 3.3 V ±3 %. `EN`: rises 120 to 280 ms after `3V3` (supervisor U204 holds CHIP_PU low until then). `VDD_HP`: about 1.1 V without firmware, from the chip's internal regulator; converter U202 stays off until firmware sets EN_DCDC (0 V without firmware and in download mode). 0 V at `VDD_HP` means a short on the rail, no 3.3 V at the chip, or the chip held in reset. |
| 4 | Current without firmware | a few tens of mA. Then raise the limit to 1 A. |
| 5 | eFuse overvoltage cut-off, on USB-C: raise the supply slowly from 5 V; stop at 6 V (TVS D101 starts to conduct a little above) | `5V` drops to 0 V between 5.53 and 5.74 V while `5V_USB` follows the supply; lowering again, `5V` returns below 5.03 to 5.23 V |
| 6 | DC terminal, USB unplugged: 12 V limited to 200 mA (`+` and `-` printed next to the terminal), then 24 V | `5V`: about 5.0 V |
| 7 | DC jack: with a meter, check the centre pin is the terminal's `+`; then 12 V through a plug | polarity right, board runs |
| 8 | DC input with reversed polarity | no current, nothing warm |
| 9 | Hot-plug a 24 V supply a few times; scope on `VDC` (converter input, TVS D106), trigger on the rising edge at 30 V. Once with 5 m of 1.5 mm² wire in the terminal to a bench or DIN-rail supply: the worst case (thick wire has little resistance to damp the swing; very short wire too little inductance to make one) | peak below 40 V. Simulated: below 35 V, also from 26.4 V; the electrolytic C120 damps the swing. If higher: check C120 is fitted and C112, C113, C117 are the 100 V 2.2 uF parts. |
| 10 | DC and USB both connected: pull and replug DC, then the same with USB | board keeps running. Simulated: `3V3` stays above 2.99 V, the highest level at which the supervisor may reset the MCU. |
| 11 | Running from DC: measure VBUS of the unplugged USB-C connector (at F101), then plug into a computer's USB-C port. Repeat both after half an hour in the case. | VBUS below 0.5 V; the port comes up. The eFuse U105 blocks the 5 V rail from VBUS but leaks a few uA back, which R104 holds near 0 V. Above 0.8 V a USB-C port stays off: fit 1 k for R104. |
| 12 | 3.3 V load step, from USB with the limit at 1.5 A: electronic load on the `3V3` and `GND` test points stepping 0.1 to 1 A; scope on `3V3`, AC coupled, ground spring at the test point. Repeat with the feed-forward capacitor C108 (12 pF) removed. | Keep the version that settles faster with less overshoot; record it in the circuit description. The rail's capacitance (about 49 uF effective) is at the upper end of what TI has proven stable for this converter; the ringing shows the phase margin left (method of TI SLVA289). |
| 13 | Surge at the DC input, if a surge generator is available (a test lab has one): EN 50130-4 line-to-earth through 42 ohm, both polarities, running from 12 V and from 24 V | board runs on; D105, D106, D107 undamaged. Simulated case (1 kV) and protection: [design-notes.md](hardware/touch-p4/design-notes.md#power). |

Other rails. The small test points carry the rail's name:

| Rail | Expected | Measure at |
|---|---|---|
| USB input behind fuse and ferrite | 5 V | `5V_USB` |
| DC input at the converter | supply voltage less 0.5 to 0.7 V | `VDC` |
| DC converter output | 5.0 V | `5V_DC` |
| PoE module output | 5.0 V | `5V_POE` |
| Flash supply (from the MCU) | 3.3 V | `VDD_FLASH` |
| PSRAM supply (from the MCU) | 0 V without firmware, 1.9 V with | C226 (0402, next to the MCU) |
| PN532 supply | about 5 V | C501 |
| PN532 regulator output | 3.0 V once NFC_RST is high | `DVDD` (`AVDD` and `TVDD` behind their ferrites) |
| PHY supply and its 1.1 V regulator | 3.3 V and 1.1 V | `PHY_3V3` and C404 |
| Backlight anode | 11 to 13 V lit; about the 5 V rail when off | `BL_A` |

## MCU

| # | Step | Pass |
|---|---|---|
| 1 | USB-C to a PC | enumerates as USB Serial/JTAG. If not: hold BOOT, tap RST, release BOOT, retry. |
| 2 | `esptool.py chip_id` / `flash_id` | ESP32-P4 revision v3.x, 16 MB flash |
| 3 | Flash a hello-world; boot log on UART0 at the TX0 test point. Measure the 40 MHz crystal: frequency counter with an active probe of 1 pF or less at C239 (the probe pulls it a few ppm), or let the P4 count its own time against an NTP server for an hour (10 ppm = 36 ms per hour; the Wi-Fi module's own crystal says nothing about this one) | crystal starts; within ±10 ppm (±400 Hz). Low by more: C238 and C239 from 12 pF to 10 pF (C32949). High: 15 pF. See [design-notes.md](hardware/touch-p4/design-notes.md#decoupling-at-the-mcu). |
| 4 | `VDD_HP` with firmware | about 1.1 V, ripple below 30 mV |
| 5 | CPU and PSRAM stress test at full clock (both cores busy, display refreshing, Ethernet or Wi-Fi traffic): one hour at room temperature, ten minutes after warming in the case. Scope at 20 MHz bandwidth on `VDD_HP`, `VDD_PSRAM` (C226), `VDD_FLASH`. | no reset, no PSRAM or flash error. Dips below 1.05 V on `VDD_HP` or below 1.8 V on `VDD_PSRAM` mean a later revision needs more decoupling ([Known limitations](hardware/touch-p4/limitations.md)); until then run the CPU at a lower clock. |

## Wi-Fi co-processor

The ESP32-C5-MINI-1 sits in the top left corner with its antenna on the module. Its USB pins carry SDIO D2 and D3, so it is flashed over UART only.

| # | Step | Pass |
|---|---|---|
| 1 | Flash the esp-hosted co-processor firmware into the C5 through the test points beside the "C5" tag (TX, RX, EN; BOOT held low at reset). Same release as the P4's esp-hosted component, 3.1.0 or newer, built for the 4 MB module. | flashes |
| 2 | esp-hosted host example on the P4: SDMMC slot 0, reset GPIO 45, 20 MHz first | log line "INIT event from ESP32 peripheral", no version warning. On `send_op_cond returned 0x107` check the reset first: the module's EN (test point EN beside the "C5" tag) must end high. |
| 3 | Before Wi-Fi is used: esp-hosted raw throughput test, both directions, at 40 MHz then 50 MHz, ten minutes each, display running. Tests the SDIO link alone. | no CRC error (`0x109`), no timeout (`0x107`). Errors here are the board (timing, module supply) or the C5's SDIO unit, not firmware above the link: note the clock at which they stop and fix the firmware's clock one step below. Simulated margin: 10.0 ns at 40 MHz, 5.0 ns at 50 MHz ([simulations](hardware/touch-p4/simulations.md)). |
| 4 | Country settings, before connecting. Start the provisioning access point. | C5 reports the EU country with the manual policy; a scan lists 5 GHz access points on channels 36 to 64 and 100 to 140 only, none on 149 to 165 ([firmware-port.md](hardware/touch-p4/firmware-port.md), Wi-Fi country rule). The access point comes up on 2.4 GHz or channels 36 to 48. |
| 5 | Scan and connect on both bands. RSSI next to an existing reader with an external antenna (the range reference), closed case on the wall, on channels 1 and 13, 36 and 64, 100 and 140 where the access point allows. Download a few MB on each band, also from a Wi-Fi 6 access point. Repeat one 5 GHz channel on a metal wall. | The full-wave model puts this antenna position within 3 dB of Espressif's in every channel ([design-notes.md](hardware/touch-p4/design-notes.md#antenna)). |
| 6 | Bluetooth with Wi-Fi connected: scan ten minutes, then connect to the devices the plugins use | reports keep coming; connections work |

## Display and touch

| # | Step | Pass |
|---|---|---|
| 1 | Fit the display. Initialise the IO expander (0x20), pulse LCD_RST, send the ST7701 init sequence over the expander pins, start the RGB panel. | picture |
| 2 | Panel current, backlight off, 5 V bench supply at USB-C: input current before the panel is plugged in and with it running | difference x 1.4 ≈ panel current at 3.3 V (upper bound: it includes the MCU's extra draw for the RGB bus). The power budget assumes 60 mA ([design-notes.md](hardware/touch-p4/design-notes.md#power)). |
| 3 | Backlight PWM on GPIO26, full duty | about 0.2 V across R603 (39 mA) |
| 4 | Touch | GT911 answers on I2C0; coordinate orientation right |
| 5 | Display with Wi-Fi active | no tearing or drift |

## NFC

| # | Step | Pass |
|---|---|---|
| 1 | Read the PN532 firmware version on I2C1 at 0x24 after NFC_RST goes high | answers as a PN532: IC 0x32, version 1.6. The fitted part is a second source; if it does not, fit the NXP part. |
| 2 | Before the first field-on: remove R504 and R505; with the display fitted, measure the loop with an LCR meter or network analyser across their antenna-side pads | Simulated: 1.25 uH on the bench or a wall of wood or stone, 1.20 uH on a metal plate. Fitted matching is safe for 1.12 to 1.25 uH with this board's part tolerances, 0.93 to 1.39 uH with exact values. Between those: switch the field on for a second at most the first time and read the current (step 3) first; at 1.0 uH one board in five draws more than 100 mA, at 1.3 uH one in twenty. Outside 0.93 to 1.39 uH: change the values first. |
| 3 | Field on: transmitter current from the voltage across FB503 (0.15 ohm) or the rise of the 5 V current. Then hold a phone and a card to the reader (they lower the loop inductance). | below 100 mA, also with phone and card. Expected 35 to 45 mA for 1.20 to 1.25 uH. |
| 4 | Receiver input: probe of 10 pF or less at the pad of R507 that is not on C521 (VMID) | 1.2 to 1.9 Vpp expected; must stay below 4 Vpp, also with a card or phone in the field. Higher: fit a larger R506 (now 3.9 k). |
| 5 | Tune the antenna with a network analyser between EMC filter and matching network ([design-notes.md](hardware/touch-p4/design-notes.md)). Tune the lan version on its own, cable plugged in (plug and cable lie next to the loop). | record final C513 to C519, R504, R505, R506 in the circuit description |
| 6 | Read distance with the cards in use (DESFire, NTAG 424), display and LEDs on, Wi-Fi transmitting; on the bench and on a metal plate (lowers the loop by 0.05 uH) | Simulated: field strong enough for any standard card up to 19 mm in front of the case, 15 mm on metal; most cards read further. If short although loop and current are as expected: the transmitter runs at about 40 of its 100 mA. A match closer to 40 ohm, or 1.0 ohm for R504 and R505, raises the loop current; then recheck current, receiver input and the field at a card on the case (7.5 A/m at most). |

## Heat

The estimate puts the board 23 to 31 K above the room in typical use, depending on the supply, good to 40 % at best ([simulations](hardware/touch-p4/simulations.md)). The case is closed plastic.

| # | Step | Pass |
|---|---|---|
| 1 | Closed case on a wall, normal firmware state (display on, Wi-Fi connected, NFC polling, LEDs at idle), each supply in turn. After an hour: chip temperature sensor, display front, air inside through the bottom notch. | chip 30 to 40 K above room, display front 15 to 25 K |
| 2 | All LEDs at their brightest steady level, backlight full; thermocouple beside D701 and D710 (the LED ring is the warmest place then) | set the firmware's LED limit from this; the power budget keeps all LEDs together at 192 mA or less in any case |
| 3 | On PoE: module U102 after an hour (it stands in air as warm as the board) | note the value |
| 4 | Air beside the Wi-Fi module (what its 85 °C rating is about): fine thermocouple in the gap between the module's right edge and the pull-ups, not touching copper, closed case on PoE. Once in normal state, once with the module sending 40 % of the time (an upload in steps, the firmware's limit). | Expected in a 40 °C room: 63 to 77 °C and 65 to 84 °C (scale by the test's room temperature; [design-notes.md](hardware/touch-p4/design-notes.md#heat)). Less than 5 K left to 85 °C at 40 °C in the second case: lower the firmware's transmit limit. |
| 5 | For rooms above 30 °C: repeat step 1 in a warm box at that temperature | display specified to 70 °C |

## Ethernet and PoE (lan version)

| # | Step | Pass |
|---|---|---|
| 1 | USB-powered. Firmware first pulses the PHY reset low through the IO expander ([firmware-port.md](hardware/touch-p4/firmware-port.md)); without it the PHY may come up with a wrong address or no clock. Try a second switch and a crossed cable. | link at 100 Mbit/s full duplex, DHCP works, ping without loss |
| 2 | PoE-powered, USB unplugged | board starts |
| 3 | Two supplies at once (PoE or DC with USB). Measure VBUS with the PC side disconnected. | VBUS 0 V (no back-feed into the USB host); no voltage on the open DC connectors |
| 4 | PoE module temperature after 30 minutes at full load | note the value |
| 5 | Unplug and replug PoE ten times | clean restart each time |
| 6 | Before the display goes on: measure how far the jack's pins stand out of the display side (expected 1.5 to 1.9 mm). Clip all pins, the two shield tabs and the two plastic posts to 1 mm with flush cutters, above the solder, not through it. Polyimide tape on the LCD's metal back over the corner that lies on them, wrapped 2 mm round the module's edge at the two 48 V pins (the two nearest the board edge in the upper rows). | display sits 1.7 mm off the board; nothing of display or housing touches the pins |
| 7 | Isolation, on a unit you can afford to lose, display removed: 1500 V RMS (or 2250 V DC) for one minute between the eight jack contacts tied together and board ground | no breakdown |

## Power sources and firmware limits

| # | Step | Pass |
|---|---|---|
| 1 | DC and PoE present | expander P5 high only while a DC supply is connected; P7 high only while the PoE port gives power |
| 2 | USB as the only source (USB 2.0 port, through a USB meter), firmware limits on: idle, polling for cards, Wi-Fi traffic (1 s average). Plug in DC, then pull it. | below 500 mA in all three. With DC the limits lift; without, they return within 0.5 s. |
| 3 | No firmware (MCU held in reset), USB 2.0 port | well below 500 mA: LEDs, backlight and buzzer held off by resistors |

## LEDs and buzzer

| # | Step | Pass |
|---|---|---|
| 1 | MCU held in reset; then light each LED in turn. Never all 16 at full white (the LED datasheet allows 70 % for white). | dark in reset; order and colours right |
| 2 | Brightest pattern the firmware allows, 5 V current against all LEDs dark (all channels of all 16 LEDs count; [design-notes.md](hardware/touch-p4/design-notes.md#power)). Then all 16 in one colour at 255, and white on all 16 at the firmware's scaled level | rise 192 mA at most; one colour about 190 mA (12 mA per LED), white not above it |
| 3 | The switch's limit: a test build without the LED limit, all 16 white at 255 for 10 s at most, current through a USB meter or a supply; voltage at C725's + pad | the ring dims instead of lighting fully; the rise stays at 255 to 334 mA; C725 well below the rail. Back to the normal firmware: full brightness again, no restart needed |
| 4 | Beep at 2.7 kHz. The sound leaves the buzzer on the side facing the lower board edge. Never leave the buzzer pin high: coil and resistor are made for a tone, not for DC. | loud enough in a workshop; no audible noise, no disturbance on the display |
| 5 | Ask for a beep while the reader polls for cards (the power budget relies on beeping only with the field off) | NFC transmitter current (NFC step 3) gone while the buzzer sounds |
| 6 | LEDs on steady (all 16 in a mixed colour at the firmware's scaled level, then each single colour), NFC field on: the reader polling for cards for a minute, a card on the tile and off again. The data line crosses the gap round the loop to LED 6 (D707) through the carrier filter R709 / C727 ([design-notes.md](hardware/touch-p4/design-notes.md#nfc)) | D707 to D717 (LEDs 6 to 15) hold their colours, no flicker and no wrong colours, the same as with the field off. Then the frame is sent again every 20 ms with the field on: no glitches either |
| 7 | Scope on C725's + pad (and C726's), all 16 white at the firmware's scaled level for a few minutes, so that the PWM periods drift into step now and then | the dips stay above 3.7 V: about 0.5 V below the rail on a 5 V rail, 0.8 V at worst ([design-notes.md](hardware/touch-p4/design-notes.md#led-ring)) |

## Tamper sensors

| # | Step | Pass |
|---|---|---|
| 1 | I2C0 scan | accelerometer at 0x19, register 0x0F reads 0x33 |
| 2 | Three axes, board flat then standing | 1 g moves to the axis pointing down |
| 3 | Hall switch: read expander P6. Bring the dock's magnet towards U703 (marked `DOCK`) from the component side; note the switch-on and switch-off distances. | P6 = 1 on the bench. On at 19 mm or more, off again at 45 mm at the latest. |
| 4 | Reader on its dock with magnet; lift it off | P6 = 0 on the dock, 1 lifted |
| 5 | Sound the buzzer with and without the magnet in front of the board; watch the accelerometer meanwhile | tone unchanged; note the accelerometer output |
| 6 | Proximity sensor U704 (marked `PROX`): measurement on (16 bit, 8T, 100 mA to begin with), read register 0x08: bench with component side to the open room; white paper at 14 mm, then 16 mm; on the dock, case closed, every dock colour in use; lifted off | answers at 0x60, ID register 0x0C reads 0x0186. Bench: close to 0. Note the paper and dock values. Lifted off: drops to near 0 at once. |
| 7 | On the dock: strong lamp and, if possible, sunlight on the case from every side. Note the ambient light value (register 0x09) in the closed case with status LEDs off and at full white, and off the dock. | proximity value stays where it was |
| 8 | Set thresholds (registers 0x06, 0x07) around the dock value, interrupt for both directions | TP815 (`INT` next to `PROX`) high on the dock, low when lifted off, and stays low until flag register 0x0B is read |

## Before the test lab

See [compliance.md](hardware/touch-p4/compliance.md#where-the-board-may-fail-in-the-lab) for why these matter.

| # | Step | Pass |
|---|---|---|
| 1 | Soak test: 24 hours in the enclosure with a normal use pattern | no fault |
| 2 | ESD pre-test (IEC 61000-4-2 set-up), closed reader on its dock, display, Wi-Fi and NFC active: 8 kV air on the glass edges all round, the tap tile's seam all round (its corners and the stretches level with the LEDs' 5 V vias) and its top, the buzzer holes, the seams and the cable notches; 4 kV contact on the two lock screws. Ten discharges of each polarity per point. These points could not be shown from datasheets ([design-notes.md](hardware/touch-p4/design-notes.md#esd-per-port); [Known limitations](hardware/touch-p4/limitations.md)). | may reset, but recovers by itself with touch, Wi-Fi and NFC working afterwards (criterion B) |
| 3 | Pre-scan radiated emissions with display running and Ethernet active, if a near-field probe or pre-compliance chamber is available | record the result for the lab |
| 4 | Wi-Fi e.i.r.p. of the closed reader on both bands, firmware test mode at highest power, on the lab's channels (lowest, middle, highest of each band) | set the firmware's cap from it: 20 dBm e.i.r.p. at 2.4 GHz and 5250 to 5725 MHz, 23 dBm at 5150 to 5250 MHz ([compliance.md](hardware/touch-p4/compliance.md#_5-ghz-wi-fi)) |
