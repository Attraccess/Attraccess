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
   particular the ESP32-P4NRW32X and the AP63203WU-7.
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
   of D106 (the TVS): the peak must stay below 40 V.
9. With the board running from the DC input, measure the unplugged USB-C
   connector's VBUS (at F101): below 0.5 V. Then plug it into a USB-C port of a
   computer: the port must come up.

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
   are safe for 1.0 to 1.3 uH. Outside that range change them first.
3. Switch the field on and measure the transmitter current: the voltage across
   FB503 (0.15 ohm) or the rise of the 5 V current. It must stay below 100 mA.
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

## Before the test lab

1. Soak test: 24 hours in the enclosure with normal use pattern.
2. ESD pre-check if a gun is available: contact discharge to USB shell, jack
   shield and enclosure screws.
3. Pre-scan radiated emissions with display running and Ethernet active, if a
   near-field probe or pre-compliance chamber is available.
