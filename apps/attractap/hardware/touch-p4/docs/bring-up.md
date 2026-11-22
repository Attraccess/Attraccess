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
   particular the ESP32-P4NRW32X and the AP63203WU-7 (none and two in stock on
   22 November 2026), and for the Ethernet version the PoE module DP9900M-5V
   (38 in stock, falling). The list of short lines is under "Sourcing risks"
   in the design notes.
4. Run the `check` and `check-footprints` targets (README) and look at the
   Gerbers in a viewer.
5. When the bare boards arrive before assembly: drop an LED into one of its
   windows. It must go in without force.

## Power, without display

1. Visual check: orientation of U201 (pin 1), U301, J601, the diodes D101 to
   D107, C103, the LEDs.
2. Resistance from `5V`, `3V3` and `VDD_HP` test points to ground: no short.
3. Feed 5 V into USB-C with the supply limited to 200 mA.
   - `5V` test point: about 4.6 V.
   - `3V3`: 3.3 V +/- 3 %.
   - `VDD_HP`: about 1.1 V, also without firmware. The chip makes it with an
     internal regulator until firmware switches the converter U202 on (its
     enable signal EN_DCDC is 0 V without firmware and in download mode). 0 V
     at `VDD_HP` means a fault: a short on the rail, no 3.3 V at the chip, or
     the chip held in reset.
4. Current without firmware: a few tens of mA. Raise the limit to 1 A.
5. DC terminal, USB unplugged: feed 12 V limited to 200 mA (`+` and `-` are
   printed next to the terminal). `5V` test point: about 4.6 V. Repeat at
   24 V.
6. DC jack: check with a meter that the centre pin of the jack is the `+` of
   the terminal before the first use. Then feed 12 V through a plug.
7. DC input with reversed polarity: no current flows and nothing gets warm.
8. Plug a 24 V supply in live a few times with an oscilloscope at the cathode
   of D106 (the TVS): the peak must stay below 40 V. It lasts about 10
   microseconds, so trigger on the edge at 30 V. Expected by simulation: 29 to
   34 V with a plug-in supply, up to 38 V with a few metres of thick wire to a
   bench or DIN rail supply. Do it once that way (5 m of 1.5 mm2 wire in the
   terminal), which is the worst case: thick wire has little resistance to
   damp the swing, and very short wire too little inductance to make one. If
   the peak is above 40 V, check that C112, C113 and C117 are the 100 V parts
   (2.2 uF); with 10 uF / 50 V parts in their place it reaches 45 V.
9. With the board running from the DC input, measure the unplugged USB-C
   connector's VBUS (at F101): below 0.5 V. Then plug it into a USB-C port of a
   computer: the port must come up. Repeat both after the reader has run for
   half an hour in its case: the leakage of D102 that lifts VBUS grows about
   tenfold from 50 to 75 °C. Above 0.8 V a USB-C port stays off; fit 1 k for
   R104 then.

Rails without a test point of their own, and where to measure them:

| Rail | Expected | Measure at |
|---|---|---|
| USB input behind fuse and ferrite | 5 V | anode of D102 |
| DC input at the converter | the supply's voltage less 0.5 V | cathode of D106 |
| DC converter output | 5.0 V | L102, on the side of C115 |
| PoE module output | 5.0 V | the `+` pad of C103 |
| Flash supply (from the MCU) | 3.3 V | pin 8 of the flash U203 |
| PSRAM supply (from the MCU) | 0 V without firmware, 1.9 V with | C226 (0402, next to the MCU) |
| PN532 supply | about 4.6 V | C501 |
| PN532 regulator output | 3.0 V once NFC_RST is high | C503 |
| PHY supply and its 1.1 V regulator | 3.3 V and 1.1 V | C401 and C404 |
| Backlight anode | 11 to 13 V when lit, about the voltage of the 5 V rail when off | C606 |

## MCU

1. Connect USB-C to a PC. The ESP32-P4 enumerates as USB Serial/JTAG. If not,
   hold BOOT, tap RST, release BOOT and try again.
2. `esptool.py chip_id` / `flash_id`: expect ESP32-P4 revision v3.x and a
   16 MB flash.
3. Flash a hello-world. Check the 40 MHz crystal starts (the app runs, UART0 at
   the TX0 test point shows the boot log).
4. Measure `VDD_HP` again: about 1.1 V with ripple below 30 mV.

## Wi-Fi co-processor

1. Flash the esp-hosted co-processor firmware into the C6 through its test
   points (C6_TX, C6_RX, C6_EN, C6_BOOT held low at reset).
2. Run the esp-hosted host example on the P4 with SDMMC slot 0 and reset GPIO
   45. Expect the "INIT event from ESP32 peripheral" log line.
3. Scan and connect to an access point. Note RSSI next to a current reader.

## Display and touch

1. Fit the display. Initialise the IO expander (0x20), pulse LCD_RST, send the
   ST7701 init sequence over the expander pins, start the RGB panel.
2. Backlight: PWM on GPIO26. Measure about 0.2 V across R603 at full duty
   (39 mA).
3. Touch: GT911 answers on I2C0. Check orientation of the coordinates.
4. Look for tearing or drift with Wi-Fi active.

## NFC

1. PN532 answers on I2C1 at 0x24 after NFC_RST goes high; read the firmware
   version. The fitted part is a second source: it must answer as a PN532
   (IC 0x32, version 1.6). If it does not, fit the NXP part.
2. Before the field is switched on for the first time, measure the loop: with
   the display fitted, an LCR meter or network analyser across R504/R505 on the
   antenna side (remove both resistors for that). The fitted matching values
   are safe for 1.12 to 1.22 uH whatever the tolerance of the parts on this
   board. From 1.0 to 1.3 uH they are safe for parts of exact value, and about
   one board in seven can draw more than 100 mA at either end: there, switch
   the field on for a second at most the first time and read the current
   (next step) before leaving it on. Outside 1.0 to 1.3 uH change the values
   first.
3. Switch the field on and measure the transmitter current: the voltage across
   FB503 (0.15 ohm) or the rise of the 5 V current. It must stay below 100 mA
   (expected 35 to 50 mA when the loop is near 1.2 uH).
4. Tune the antenna with a network analyser between the EMC filter and the
   matching network (see design notes). Record the final values of C513 to
   C519, R504, R505 in the circuit description. Tune the Ethernet version on
   its own, with the cable plugged in: plug and cable lie next to the loop.
5. Measure read distance with the cards and tags in use (DESFire, NTAG 424),
   with display on, LEDs on and Wi-Fi transmitting.

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

## LEDs and buzzer

1. Hold the MCU in reset: all LEDs stay dark. Then light each LED in turn:
   order and colours. Do not run all eight at full white: the LED's datasheet
   allows 70 % for white.
2. Beep at 2.7 kHz: loud enough in the workshop, no audible noise on the
   display or NFC performance loss while beeping. The sound leaves the buzzer
   on its side that faces the lower board edge. Never leave the buzzer pin
   high: the coil and its resistor are made for a tone, not for direct current.

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
2. ESD pre-check if a gun is available: contact discharge to USB shell, jack
   shield and enclosure screws.
3. Pre-scan radiated emissions with display running and Ethernet active, if a
   near-field probe or pre-compliance chamber is available.
