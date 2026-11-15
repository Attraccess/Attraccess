# Bring-up plan for the first boards

Work through this in order on the first assembled boards. Stop and investigate
when a step fails. Use a current-limited bench supply for the first power-up.

## Before ordering

1. Have an electronics engineer review schematic and layout.
2. Lay a sample display on a 1:1 print of the board: check the flex reaches J601
   through the slot with the fold described in the design notes, and that the
   contacts face the board.
3. Check that JLCPCB (or the chosen assembler) can supply every BOM line, in
   particular the ESP32-P4NRW32X.
4. Run ERC and DRC (commands in the README) and look at the Gerbers in a viewer.

## Power, without display

1. Visual check: orientation of U201 (pin 1), U301, J601, the diodes D101 to
   D107, C103, the LEDs.
2. Resistance from `5V`, `3V3` and `VDD_HP` test points to ground: no short.
3. Feed 5 V into USB-C with the supply limited to 200 mA.
   - `5V` test point: about 4.6 V.
   - `3V3`: 3.3 V +/- 3 %.
   - `VDD_HP`: 0 V while the chip has no firmware (EN_DCDC stays low), about
     1.1 V once firmware runs.
4. Current without firmware: a few tens of mA. Raise the limit to 1 A.
5. DC lever terminal, USB unplugged: feed 12 V limited to 200 mA (`+` and `-`
   are printed next to the terminal). `5V` test point: about 4.6 V. Repeat at
   24 V.
6. DC jack: check with a meter that the centre pin of the jack is the `+` of
   the lever terminal before the first use (the jack's pin numbering was taken
   from the library part, not measured). Then feed 12 V through a plug.
7. DC input with reversed polarity: no current flows and nothing gets warm.

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
   version.
2. Tune the antenna with a network analyser between the EMC filter and the
   matching network (see design notes). Record the final values of C513 to
   C519, R504, R505 in the schematic.
3. Measure read distance with the cards and tags in use (DESFire, NTAG 424),
   with display on, LEDs on and Wi-Fi transmitting.
4. Check transmitter current (TVDD) stays below 100 mA.

## Ethernet and PoE (lan version)

1. USB-powered: link comes up at 100 Mbit/s full duplex, DHCP works, ping
   without loss. Try a second switch and a crossed cable.
2. PoE-powered, USB unplugged: board starts.
3. Two supplies connected at once (PoE or DC together with USB): no back-feed
   into the USB host (measure VBUS with the PC side disconnected: it must read
   0 V), and no voltage on the open DC connectors.
4. PoE module temperature after 30 minutes at full load.
5. Unplug and replug PoE ten times: the board restarts cleanly each time.

## LEDs and buzzer

1. Light each LED in turn: order and colours.
2. Beep at 2.7 kHz: loud enough in the workshop, no audible noise on the
   display or NFC performance loss while beeping.

## Before the test lab

1. Soak test: 24 hours in the enclosure with normal use pattern.
2. ESD pre-check if a gun is available: contact discharge to USB shell, jack
   shield and enclosure screws.
3. Pre-scan radiated emissions with display running and Ethernet active, if a
   near-field probe or pre-compliance chamber is available.
