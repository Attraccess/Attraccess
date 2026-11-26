# Bring-up plan for the first boards

Work through this in order on the first assembled boards. Stop and investigate
when a step fails. Use a current-limited bench supply for the first power-up.

## Before ordering

1. Lay a sample display on a 1:1 print of the board (`fab/board-front.pdf` and
   `fab/board-back.pdf`, glued back to back on 1.6 mm card), on a spacer of
   1.5 mm: check that the flex reaches J601 through the slot with the fold
   described in the design notes, that its stiff parts lie flat behind the
   board, that it goes into the connector to its stop without being stretched,
   and that the contacts face the board. Try 2.0 mm as well; that is the limit
   by the drawing. This is the one check that no calculation replaces: a board
   with a flex that is too short cannot be repaired.
2. Have an electronics engineer look at the open points listed under "Design
   review" in the design notes.
3. Check that JLCPCB (or the chosen assembler) can supply every BOM line, in
   particular the ESP32-P4NRW32X (none in stock on 22 November 2026), and for
   the Ethernet version the PoE module DP9900M-5V (38 in stock, falling). The list of short lines is under "Sourcing risks"
   in the design notes.
4. Run the `check` and `check-footprints` targets (README) and look at the
   Gerbers in a viewer. `check` includes the simulations; their report is
   `fab/reports/simulation.txt`.
5. When the bare boards arrive before assembly: drop an LED into one of its
   windows. It must go in without force.

## Power, without display

1. Visual check: orientation of U201 (pin 1), U301, J601, U105 to U107, U204,
   Q101, Q102, the diodes D101, D103, D105 and D106, C103, C120, the LEDs.
2. Resistance from the `5V`, `3V3`, `VDD_HP`, `5V_USB`, `VDC` and `5V_DC` test
   points to ground: no short.
3. Feed 5 V into USB-C with the supply limited to 200 mA.
   - `5V` test point: about 5 V. The eFuse U105 loses a few millivolts; there
     is no diode drop any more.
   - `3V3`: 3.3 V +/- 3 %.
   - `EN`: rises 120 to 280 ms after `3V3`. The supervisor U204 holds the
     MCU's CHIP_PU low until then.
   - `VDD_HP`: about 1.1 V, also without firmware. The chip makes it with an
     internal regulator until firmware switches the converter U202 on (its
     enable signal EN_DCDC is 0 V without firmware and in download mode). 0 V
     at `VDD_HP` means a fault: a short on the rail, no 3.3 V at the chip, or
     the chip held in reset.
4. Current without firmware: a few tens of mA. Raise the limit to 1 A.
5. Overvoltage cut-off of the eFuse, still on USB-C: raise the supply slowly
   from 5 V. `5V` must drop to 0 V between 5.53 and 5.74 V while `5V_USB`
   follows the supply. Lower it again: `5V` comes back below 5.03 to 5.23 V.
   Stop at 6 V; the TVS D101 starts to conduct a little above that.
6. DC terminal, USB unplugged: feed 12 V limited to 200 mA (`+` and `-` are
   printed next to the terminal). `5V` test point: about 5.0 V. Repeat at
   24 V.
7. DC jack: check with a meter that the centre pin of the jack is the `+` of
   the terminal before the first use. Then feed 12 V through a plug.
8. DC input with reversed polarity: no current flows and nothing gets warm.
9. Plug a 24 V supply in live a few times with an oscilloscope at the `VDC`
   test point (the converter's input, where the TVS D106 sits): the peak must
   stay below 40 V. Trigger on the rising edge at 30 V. Expected by
   simulation: below 35 V, also from a 26.4 V supply; the electrolytic C120
   damps the swing (design notes, "Power"). Do it once with a few metres of
   thick wire to a bench or DIN rail supply (5 m of 1.5 mm2 wire in the
   terminal), which is the worst case: thick wire has little resistance to
   damp the swing, and very short wire too little inductance to make one. If
   the peak is higher than expected, check that C120 is fitted and that C112,
   C113 and C117 are the 100 V parts (2.2 uF).
10. Changing supplies: with DC and USB both connected, pull the DC plug and
    plug it in again, then the same with USB. The board keeps running. By
    simulation `3V3` stays above 2.99 V, the highest level at which the
    supervisor may reset the MCU.
11. With the board running from the DC input, measure the unplugged USB-C
    connector's VBUS (at F101): below 0.5 V. Then plug it into a USB-C port of
    a computer: the port must come up. Repeat both after the reader has run
    for half an hour in its case. The eFuse U105 blocks the 5 V rail from VBUS
    but leaks a few microamps back, which R104 has to hold near 0 V. Above
    0.8 V a USB-C port stays off; fit 1 k for R104 then.
12. Load step on the 3.3 V rail, fed from USB with the limit at 1.5 A: an
    electronic load on the `3V3` and `GND` test points that steps between 0.1
    and 1 A, and the oscilloscope on `3V3` (AC coupled, ground spring at the
    test point). Look at the ringing after each step. Then remove the
    feed-forward capacitor C108 (12 pF) and repeat. The rail's capacitors come
    to about 49 uF effective, at the upper end of what TI has proven stable
    for this converter (design notes, "Power"), and the ringing shows how much
    phase margin is left (the method of TI's application report SLVA289).
    Keep the version that settles faster with less overshoot, and record it
    in the circuit description.
13. Surge at the DC input, if a surge generator is available (a test lab
    offers it): the line-to-earth test of EN 50130-4 through 42 ohm, both
    polarities, with the board running from 12 V and from 24 V. The board
    must run on afterwards, and D105, D106 and D107 must be undamaged. The
    simulated case (1 kV) and the protection are in the design notes,
    "Power".

Other rails, and where to measure them. The small test points carry the
rail's name:

| Rail | Expected | Measure at |
|---|---|---|
| USB input behind fuse and ferrite | 5 V | `5V_USB` |
| DC input at the converter | the supply's voltage less 0.5 to 0.7 V | `VDC` |
| DC converter output | 5.0 V | `5V_DC` |
| PoE module output | 5.0 V | `5V_POE` |
| Flash supply (from the MCU) | 3.3 V | `VDD_FLASH` |
| PSRAM supply (from the MCU) | 0 V without firmware, 1.9 V with | C226 (0402, next to the MCU) |
| PN532 supply | about 5 V | C501 |
| PN532 regulator output | 3.0 V once NFC_RST is high | `DVDD` (`AVDD` and `TVDD` behind their ferrites) |
| PHY supply and its 1.1 V regulator | 3.3 V and 1.1 V | `PHY_3V3` and C404 |
| Backlight anode | 11 to 13 V when lit, about the voltage of the 5 V rail when off | `BL_A` |

## MCU

1. Connect USB-C to a PC. The ESP32-P4 enumerates as USB Serial/JTAG. If not,
   hold BOOT, tap RST, release BOOT and try again.
2. `esptool.py chip_id` / `flash_id`: expect ESP32-P4 revision v3.x and a
   16 MB flash.
3. Flash a hello-world. Check the 40 MHz crystal starts (the app runs, UART0 at
   the TX0 test point shows the boot log). Measure its frequency: with a
   frequency counter and an active probe of 1 pF or less at C239 (the probe
   pulls it by a few ppm), or by letting the P4 count its own time against an
   NTP server for an hour (10 ppm is 36 ms per hour; the Wi-Fi module has a
   crystal of its own and says nothing about this one). Within +-10 ppm
   (+-400 Hz) is right. If it runs low by more than that, change the
   load capacitors C238 and C239 from 12 pF to 10 pF (C32949); if high, to
   15 pF (design notes, "Decoupling and crystal at the MCU").
4. Measure `VDD_HP` again: about 1.1 V with ripple below 30 mV.
5. Decoupling (design notes, "Decoupling and crystal at the MCU"): run a CPU
   and PSRAM stress test at the full clock (both cores busy, the display
   refreshing, Ethernet or Wi-Fi traffic) for an hour at room temperature and
   for ten minutes after the reader has warmed in its case. No reset, no
   PSRAM or flash error; watch `VDD_HP`, `VDD_PSRAM` (C226) and `VDD_FLASH`
   with the scope at 20 MHz bandwidth: dips below 1.05 V on `VDD_HP` or below
   1.8 V on `VDD_PSRAM` are the sign that the decoupling of a later revision
   is needed (design notes, "Accepted deviations"); until then run the CPU
   at a lower clock.

## Wi-Fi co-processor

The module is the ESP32-C5-MINI-1 with its antenna on the module, in the
board's top left corner. Its USB pins carry SDIO D2 and D3, so it is flashed
over UART only.

1. Flash the esp-hosted co-processor firmware into the C5 through its test
   points beside the "C5" tag (TX, RX, EN, and BOOT held low at reset). Take
   the same release as the P4's esp-hosted component, 3.1.0 or newer, built
   for the 4 MB module.
2. Run the esp-hosted host example on the P4 with SDMMC slot 0 and reset GPIO
   45, at 20 MHz first. Expect the "INIT event from ESP32 peripheral" log
   line and no version warning. If the P4 reports `send_op_cond returned
   0x107`, look at the reset first: EN of the module (test point EN beside
   the "C5" tag) must end high.
3. Before Wi-Fi is used, run esp-hosted's raw throughput test in both
   directions at 40 MHz and then at 50 MHz, ten minutes each, with the
   display running: no CRC error (`0x109`) and no timeout (`0x107`). This
   tests the SDIO link alone. Errors here are the board (timing, supply of
   the module) or the C5's SDIO unit, and are not cured by firmware above the
   link; note at which clock they stop, and fix the firmware's clock one step
   below. Simulated, the board leaves the link 10.0 ns at 40 MHz and 5.0 ns
   at 50 MHz (design notes, "Simulation").
4. Check the country settings before connecting: the C5 reports the EU
   country with the manual policy, and a scan lists 5 GHz access points on
   channels 36 to 64 and 100 to 140 only, none on 149 to 165
   ([firmware-port.md](firmware-port.md), rule 22). Start the provisioning
   access point and check that it comes up on 2.4 GHz or channels 36 to 48.
5. Scan and connect, on both bands. Note RSSI next to a current reader (with
   the ESP32-C6 and its external antenna), in the closed case on the wall, on
   channels 1 and 13, 36 and 64, 100 and 140 where the access point allows
   it. The full-wave model puts this place within 3 dB of Espressif's in
   every channel (design notes, "Wi-Fi module"); the current reader is the
   reference for range. Download a few megabytes on each band, on a Wi-Fi 6
   access point as well. Repeat one 5 GHz channel with the reader on a metal
   wall.
6. Bluetooth with Wi-Fi connected: scan for ten minutes (the reports must
   keep coming), then connect to the devices the plugins use.

## Display and touch

1. Fit the display. Initialise the IO expander (0x20), pulse LCD_RST, send the
   ST7701 init sequence over the expander pins, start the RGB panel.
2. The panel's 3.3 V current, backlight off, on a 5 V bench supply at USB-C:
   note the input current before the panel is plugged in and with it running.
   The difference times 1.4 is about the panel's current at 3.3 V (it also
   holds what the MCU draws more for the RGB bus, so it is an upper bound).
   The power budget assumes 60 mA (design notes, "Power").
3. Backlight: PWM on GPIO26. Measure about 0.2 V across R603 at full duty
   (39 mA).
4. Touch: GT911 answers on I2C0. Check orientation of the coordinates.
5. Look for tearing or drift with Wi-Fi active.

## NFC

1. PN532 answers on I2C1 at 0x24 after NFC_RST goes high; read the firmware
   version. The fitted part is a second source: it must answer as a PN532
   (IC 0x32, version 1.6). If it does not, fit the NXP part.
2. Before the field is switched on for the first time, measure the loop: with
   the display fitted, an LCR meter or network analyser across R504/R505 on the
   antenna side (remove both resistors for that). Expected by simulation:
   1.25 uH with the reader on the bench or on a wall of wood or stone, 1.20 uH
   on a metal plate. The fitted matching values are safe for 1.12 to 1.25 uH
   whatever the tolerance of the parts on this board, and from 0.93 to 1.39 uH
   for parts of exact value. Between those, switch the field on for a second
   at most the first time and read the current (next step) before leaving it
   on: at 1.0 uH one board in five draws more than 100 mA, at 1.3 uH one in
   twenty. Outside 0.93 to 1.39 uH change the values first.
3. Switch the field on and measure the transmitter current: the voltage across
   FB503 (0.15 ohm) or the rise of the 5 V current. It must stay below 100 mA
   (expected 35 to 45 mA for a loop of 1.20 to 1.25 uH). Hold a phone and a
   card to the reader and watch it: they lower the loop's inductance, and the
   current must stay below 100 mA with them as well.
4. Measure the voltage at the receiver input with a probe of 10 pF or less at
   the pad of R507 that is not on C521 (VMID): expected 1.2 to 1.9 Vpp, and
   it must stay below 4 Vpp, also with a card or a phone in the field. If it
   is higher, fit a larger R506 (3.9 k now).
5. Tune the antenna with a network analyser between the EMC filter and the
   matching network (see design notes). Record the final values of C513 to
   C519, R504, R505 and R506 in the circuit description. Tune the Ethernet version on
   its own, with the cable plugged in: plug and cable lie next to the loop.
6. Measure read distance with the cards and tags in use (DESFire, NTAG 424),
   with display on, LEDs on and Wi-Fi transmitting. Do it on the bench and
   with the reader on a metal plate: the plate lowers the loop's inductance by
   0.05 uH. Expected by simulation: the field is strong enough for any
   standard card up to 19 mm in front of the case, 15 mm on the metal plate;
   most cards read further. If the range is short although the loop and the
   current are as expected, the transmitter has room: it runs at about 40 mA
   of its 100 mA. A match closer to 40 ohm, or 1.0 ohm for R504 and R505,
   raises the loop current; check the current, the receiver input and the
   field at a card on the case (7.5 A/m at most) again after that.

## Heat

The reader is a closed plastic case. The estimate in the design notes
("Simulation") puts the board 23 to 31 K above the room in typical use,
depending on the supply, and is good to 40 % at best.

1. Closed case on a wall, firmware in its normal state (display on, Wi-Fi
   connected, NFC polling, LEDs at their idle level), each supply in turn.
   After an hour read the chip's temperature sensor and measure the front of
   the display and, through the bottom notch, the air inside.
   Expected: chip 30 to 40 K above the room, display front 15 to 25 K.
2. The same with all LEDs at their brightest steady level and the backlight
   at full. The LED rows are the warmest place then; a thermocouple beside
   D702 and D707. Set the firmware's LED limit from this; the power budget
   keeps it below 100 mA for all LEDs together in any case.
3. On PoE: the module U102 after an hour (it stands in air that is as warm as
   the board).
4. The air beside the Wi-Fi module, which its 85 °C rating is about: a fine
   thermocouple in the gap between the module's right edge and the pull-ups,
   not touching copper, closed case on PoE. Once with the reader in its normal
   state, once with the module sending 40 % of the time (an upload in steps,
   the firmware's limit). Expected in a room of 40 °C: 63 to 75 °C and 65 to
   84 °C (design notes, "Wi-Fi module"; scale by the room temperature in the
   test). If the second reading leaves less than 5 K to 85 °C at 40 °C, lower
   the firmware's transmit limit.
5. If the reader will be used in rooms above 30 °C, repeat step 1 in a warm
   box at that temperature. The display is specified to 70 °C.

## Ethernet and PoE (lan version)

1. USB-powered: link comes up at 100 Mbit/s full duplex, DHCP works, ping
   without loss. Try a second switch and a crossed cable. The firmware has to
   pulse the PHY reset low through the IO expander first (see firmware-port.md);
   without that pulse the PHY may come up with a wrong address or no clock.
2. PoE-powered, USB unplugged: board starts.
3. Two supplies connected at once (PoE or DC together with USB): no back-feed
   into the USB host (measure VBUS with the PC side disconnected: it must read
   0 V), and no voltage on the open DC connectors.
4. PoE module temperature after 30 minutes at full load.
5. Unplug and replug PoE ten times: the board restarts cleanly each time.
6. Before the display goes on: measure how far the jack's pins stand out of the
   display side of the board (expected 1.5 to 1.9 mm). Clip all of them, the
   two shield tabs and the two plastic posts to 1 mm with flush cutters; cut
   above the solder, not through it. Stick polyimide tape on the LCD's metal
   back over the corner that will lie on them, wrapped 2 mm round the module's
   edge at the two 48 V pins (the two nearest the board edge in the upper rows).
   The display sits 1.5 mm off the board. Nothing of the display or the housing
   may touch the pins.
7. Isolation, on a unit you can afford to lose: 1500 V RMS (or 2250 V DC) for a
   minute between the eight contacts of the jack tied together and the board's
   ground. Remove the display first.

## Power sources and the firmware's limits

1. DC and PoE present: the expander's P5 reads high only while a DC supply is
   connected, P7 only while the PoE port gives power.
2. USB as the only source (a USB 2.0 port, through a USB meter): with the
   firmware's limits on, the board's current stays below 500 mA idle, while it
   polls for cards and during Wi-Fi traffic (averaged over 1 s). Plug in DC:
   the limits lift; pull it: they come back within 0.5 s.
3. Without firmware (MCU held in reset) on a USB 2.0 port the board draws well
   below 500 mA: LEDs, backlight and buzzer are held off by resistors.

## LEDs and buzzer

1. Hold the MCU in reset: all LEDs stay dark. Then light each LED in turn:
   order and colours. Do not run all eight at full white: the LED's datasheet
   allows 70 % for white.
2. The firmware's LED limit: the power budget relies on the LEDs drawing
   below 100 mA together, all channels of all eight LEDs counted (design
   notes, "Power"). Set the brightest pattern the firmware allows and measure
   the rise of the 5 V current against all LEDs dark: below 100 mA.
3. Beep at 2.7 kHz: loud enough in the workshop, no audible noise and no
   disturbance on the display while beeping. The sound leaves the buzzer
   on its side that faces the lower board edge. Never leave the buzzer pin
   high: the coil and its resistor are made for a tone, not for direct current.
4. The firmware beeps only while the NFC field is off; the power budget relies
   on that too. Ask for a beep while the reader polls for cards: the
   transmitter current (NFC, step 3) must be gone while the buzzer sounds.

## Tamper sensors

1. I2C0 scan: the accelerometer answers at 0x19, register 0x0F reads 0x33.
2. Read its three axes with the board lying flat, then standing: 1 g moves to
   the axis that points down.
3. Hall switch: read IO expander P6. It is 1 on the bench. Bring the dock's
   magnet towards U703 (marked `DOCK`) from the component side: note the
   distance at which P6 goes to 0 and the distance at which it returns to 1.
   Expected: on at 19 mm or more, off again at 45 mm at the latest.
4. Reader on its dock with the magnet fitted: P6 = 0. Lift it off: P6 = 1.
5. Sound the buzzer with and without the magnet in front of the board: the
   tone must not change. Watch the accelerometer's output while it sounds.
6. Proximity sensor (U704, marked `PROX`): it answers at 0x60 and its ID
   register 0x0C reads 0x0186. Switch the proximity measurement on (16 bit,
   8T, 100 mA to begin with) and read register 0x08:
   - board on the bench, component side facing the open room: close to 0;
   - a sheet of white paper 14 mm in front of it: note the value, then move
     the sheet 2 mm further and note it again;
   - reader on its dock, case closed: note the value for every dock colour in
     use. Lift the reader off: the value must drop to near 0 at once.
7. With the reader on its dock, shine a strong lamp and, if possible, sunlight
   on the case from every side. The proximity value must stay where it was.
   Note the ambient light value (register 0x09) in the closed case with the
   status LEDs off and at full white, and with the reader off the dock.
8. Set the two thresholds (registers 0x06 and 0x07) around the value on the
   dock, interrupt for both directions: TP815 (`INT` next to `PROX`) is high
   on the dock and goes low when the reader is lifted off. It stays low until
   the flag register 0x0B is read.

## Before the test lab

1. Soak test: 24 hours in the enclosure with normal use pattern.
2. ESD pre-test before the lab, on a closed reader on its dock, running with
   the display, Wi-Fi and NFC active (ESD gun, IEC 61000-4-2 set-up): 8 kV air
   on the glass edges all round, every LED window, the buzzer holes, the seams
   and the cable notches; 4 kV contact on the two lock screws. Ten discharges
   of each polarity per point. The reader may reset but must recover by
   itself, with touch, Wi-Fi and NFC working afterwards (criterion B). These
   are the points the design could not show from datasheets (design notes,
   "ESD per port" and "Accepted deviations").
3. Pre-scan radiated emissions with display running and Ethernet active, if a
   near-field probe or pre-compliance chamber is available.
4. Wi-Fi transmit power: measure the e.i.r.p. of the closed reader on both
   bands, in the firmware's test mode at the highest power and on the channels
   the lab will use (lowest, middle and highest of each band), and set the
   firmware's cap from it: 20 dBm e.i.r.p. at 2.4 GHz and from 5250 to
   5725 MHz, 23 dBm from 5150 to 5250 MHz ([compliance.md](compliance.md),
   "5 GHz Wi-Fi").
