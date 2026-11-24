# Pin map and firmware port

What the firmware needs to know to run on the Attractap Touch P4 board.

## The short list

Read this before writing or configuring firmware for this board. Each line is
something the board cannot protect itself against, or a known trap of its
parts; the numbers point to the item under
["What changes"](#what-changes-compared-with-the-esp32-s3-firmware) that has
the detail. Where a figure says "simulated", it comes from the simulations of
the routed board ([sim/README.md](../sim/README.md)); nothing here has been
measured on hardware yet.

| | Rule | What happens otherwise | Detail |
|---|---|---|---|
| 1 | Never leave the buzzer pin (GPIO46) high; stop the tone in every error path | 180 mA of direct current through the coil, twice its rating, and its resistor overloaded | 7 |
| 2 | All eight LEDs: white at 70 % at most, and that only for seconds. Steady light at 30 % or less | The LED rows sit on narrow copper between the board's cut-outs. Estimated: steady white at 70 % makes them 30 K warmer than the rest of the board, which is 25 to 30 K above the room already | 8, 14 |
| 3 | Read the chip's temperature sensor and dim backlight and LEDs when it passes about 80 °C | In a room of 40 °C on PoE the estimate puts the display at 63 °C (its limit: 70 °C) and the air around the PoE module at 71 °C (85 °C), which is closer than the estimate is exact. The Wi-Fi module reaches 79 °C and is the version for 105 °C | 14 |
| 4 | Pulse the Ethernet PHY's reset through the IO expander before the EMAC starts | The PHY has no reset circuit; it may come up with the wrong address or without its clock | 5 |
| 5 | esp-hosted: board "none", SDMMC slot 0, reset GPIO 45, and the reset line must end high | The defaults are those of Espressif's board (slot 1, GPIO54). With the wrong reset setting the C6 stays in reset: `send_op_cond returned 0x107` | 4 |
| 6 | The same esp-hosted release on the P4 and in the C6, 3.1.0 or newer, and `esp_wifi_remote` pinned to match | Wi-Fi that does not associate, dropped packets, a link that dies and does not come back, a double free | 4 |
| 7 | The first image flashed into the C6 is a current release | After a first image of 2.1 to 2.8 the C6 cannot be updated over SDIO any more | 4 |
| 8 | Leave the drive strength of GPIO33 to 35 and GPIO39 to 44 at the default or lower | These lines have no series resistors. Simulated: 0.13 V of overshoot at the default, 0.8 V at the strongest setting | 5 |
| 9 | Leave the C6's SDIO timing at its default edges; bring the link up at 20 MHz, then 40 MHz | CRC errors (`0x109`) on the link | 4 |
| 10 | No ROM cache functions (`Cache_WriteBack_Addr()` and its relatives) in display code; use `esp_cache_msync()` | The SDIO link times out: "Unrecoverable host sdio state" | 4 |
| 11 | Do not send LED data during an NFC exchange | The LED data rate (800 kHz) is next to the frequency a card answers on (848 kHz) | 6 |
| 12 | Backlight PWM at 25 to 40 kHz | Below 2.5 kHz the driver restarts its soft start in every cycle | 3 |
| 13 | Keep GPIO34 to 36 high or undriven up to a reset | They are strapping pins; driven low, the chip starts in the wrong mode | 10 |
| 14 | On PoE keep the board above 100 mA: no deep sleep with the backlight off | The PoE module needs a minimum load; below it the switch may turn the port off and on | design notes, "Power" |
| 15 | Bluetooth: keep the scan window well below the scan interval, and test connecting to the devices in use | Wi-Fi and Bluetooth share the C6's one radio. Connecting as a central failed for some devices until a correction of July 2026 | 4 |
| 16 | Wi-Fi transmit power and 802.11ax are settings, not constants | The test lab may ask for less power; some access points stall the link in 802.11ax mode | 4, 12 |
| 17 | Secure boot with RSA-3072. Check the chip revision before Secure Download Mode is enabled | ECDSA secure boot has an erratum. On revision v3.1 the chip could no longer be flashed through its ROM | 9, 13 |
| 18 | The hall switch counts only after it has read 0 once; ignore the accelerometer while the buzzer sounds | A reader without a dock magnet looks like a removed one; the buzzer shakes the board | "Tamper detection" |

What the firmware does not have to care about, because the board does it: the
LEDs, the backlight, the buzzer and the PN532 are held off by resistors until
the firmware drives their pins, and the MCU's reset waits for the 3.3 V rail
(simulated: 1.1 ms after it is up; the chip asks for 50 us).

## ESP32-P4 GPIO map

| GPIO | Signal | Notes |
|---|---|---|
| 0 | TP_RST | GT911 touch reset |
| 1 | I2C0_SCL | touch + IO expander, 2.2 k pull-up |
| 2 | I2C0_SDA | |
| 3 | TP_INT | GT911 interrupt (also selects the touch I2C address at reset) |
| 4 to 8 | LCD R5, R4, R3, R2, R1 | through 33 ohm |
| 9 to 14 | LCD G5, G4, G3, G2, G1, G0 | through 33 ohm |
| 15 to 19 | LCD B5, B4, B3, B2, B1 | through 33 ohm |
| 20 | LCD_HSYNC | |
| 21 | LCD_VSYNC | |
| 22 | LCD_DE | |
| 23 | LCD_PCLK | |
| 24 | USB D- | USB Serial/JTAG |
| 25 | USB D+ | |
| 26 | BL_PWM | backlight, PWM 25 to 40 kHz, high = on, pulled low at reset |
| 27 | not connected | |
| 28 | RMII CRS_DV | |
| 29 | RMII RXD0 | |
| 30 | RMII RXD1 | |
| 31 | ETH MDC | |
| 32 | RMII REF_CLK | 50 MHz input from the PHY |
| 33 | RMII TX_EN | |
| 34 | RMII TXD0 | strapping pin, 10 k pull-up |
| 35 | RMII TXD1 | strapping pin: BOOT button, 10 k pull-up |
| 36 | ETH MDIO | strapping pin, 1.5 k pull-up |
| 37 | UART0 TX | test point TX0 |
| 38 | UART0 RX | test point RX0 |
| 39 to 42 | SDIO D0 to D3 | to the ESP32-C6, 51 k pull-ups |
| 43 | SDIO CLK | 22 ohm series |
| 44 | SDIO CMD | 51 k pull-up |
| 45 | C6_EN | resets the ESP32-C6 (through 1 k) |
| 46 | BUZZER | 2.7 kHz square wave, high = coil on |
| 47 | LED_DATA | 8 x SK6812, GRB, 800 kbit/s; 100 k pull-down on the board |
| 48 | not connected | |
| 49 | NFC_IRQ | PN532 P70_IRQ, active low |
| 50 | NFC_RST | PN532 RSTPD_N, 10 k pull-down: drive high to run |
| 51 | NFC_SDA | second I2C bus, 2.2 k pull-up |
| 52 | NFC_SCL | |
| 53, 54 | not connected | |

The component side of the board carries a short version of this map. Its numbers are generated from the same table
as the schematic (`P4_GPIO` in `scripts/bootstrap/circuit_core.py`).

## IO expander (TCA9554 at 0x20 on I2C0)

| Pin | Signal | Direction |
|---|---|---|
| P0 | LCD_CS | out |
| P1 | LCD_SCK | out |
| P2 | LCD_SDA | out |
| P3 | LCD_RST | out |
| P4 | ETH_RST_N | out, low = PHY in reset. Must be pulsed low, see "Ethernet" below |
| P5 | unused | |
| P6 | DOCK_N | in: low while the reader is on its dock (hall switch U703), see "Tamper detection" below |
| P7 | unused | |

All expander pins are inputs with weak pull-ups after power-up.

## I2C addresses

| Bus | Device | Address |
|---|---|---|
| I2C0 (GPIO1/2) | GT911 touch | 0x5D or 0x14 (chosen by INT level at reset) |
| I2C0 | TCA9554 | 0x20 |
| I2C0 | LIS2DH12 accelerometer | 0x19 |
| I2C0 | VCNL4040 proximity and light sensor | 0x60 |
| I2C1 (GPIO51/52) | PN532 | 0x24 |

The PN532 has a bus of its own. Its address is fixed at 0x24, and on the
`attractap-touch-v2` hardware the IO expander answered at the same address, so
that reader needs an address shifter (PN532 at 0x64). Here nothing else can end
up on the NFC bus, and a busy NFC exchange (the PN532 stretches the clock) no
longer delays touch polling.

- The expander address comes from its three address pins, all tied to ground:
  0x20. The part must be the TCA9554, not the TCA9554A (0x38).
- The GT911 takes its address from TP_INT while TP_RST is released: hold
  TP_INT low for 0x5D. Both pins are MCU GPIOs, so the firmware decides.
- Use two I2C controllers: `I2C_NUM_0` for GPIO1/2 and `I2C_NUM_1` for
  GPIO51/52. The firmware's single shared bus (`getSharedI2CBus()`) has to be
  split accordingly.
- `PN532_I2C_ADDRESS` is 0x24 again; no address shifter.
- Other addresses: the Ethernet PHY answers on MDIO at address 1.

`scripts/bootstrap/check_netlist.py` reads the schematic and prints the devices
and addresses on each I2C bus. It fails when two devices on one bus share an
address or when a device has no entry in its address table.

## Tamper detection

The board has three sensors for this and the firmware does not use them yet.

- **Hall switch U703 (DRV5032FA)** on IO expander pin P6, net `DOCK_N`. Leave
  P6 an input. It reads 0 while the magnet in the dock is in front of the
  switch and 1 when the reader is off the dock. The switch samples its field
  20 times a second, so reading the expander's input register a few times a
  second is enough. The expander's interrupt output is not connected.
- **Accelerometer U702 (LIS2DH12)** on I2C0 at 0x19 (`WHO_AM_I`, register
  0x0F, reads 0x33). Its interrupt sources latch (bit `LIR` in `CTRL_REG5`), so
  the firmware can poll `INT1_SRC` and `CLICK_SRC` and needs no interrupt pin.
  INT1 is on test point TP814 for the bench. The two sources worth setting up:
  the click detection for knocks, and the 6D or activity function against the
  direction of gravity stored at installation, for the reader being swung open
  or pulled off.
- **Proximity sensor U704 (VCNL4040)** on I2C0 at 0x60 (ID register 0x0C
  reads 0x0186). All registers are 16 bits wide, low byte first. It measures
  the infrared light that the dock's plate reflects and is the sensor to trust
  for "on the dock": nothing outside the case reaches its light path, while a
  magnet held to the case keeps `DOCK_N` at 0.
  - Set-up: `PS_CONF1`/`PS_CONF2` (0x03) for pulse length, repetition and
    16-bit output, `PS_CONF3`/`PS_MS` (0x04) for the emitter current (50 to
    200 mA). Proximity value in 0x08. The part powers up with the measurement
    switched off.
  - Store the value of the mounted reader as its reference when the reader is
    commissioned, and write a band around it to `PS_THDL` (0x06) and
    `PS_THDH` (0x07) with the interrupt set to both directions. The part then
    checks every measurement itself and latches a flag in `INT_Flag` (0x0B,
    high byte) when the value leaves the band, so a lift between two polls is
    not missed. Reading the flag register clears it. INT is on test point
    TP815 only, not on a GPIO.
  - The value depends on the dock's colour, so there is no fixed threshold
    that fits every reader. Off the dock it is close to 0.
  - Ambient light in 0x09 (`ALS_CONF`, 0x00, switches it on). The space behind
    the board is dark while the reader is on its dock; treat light there as a
    hint, not as proof, until it has been measured on real units.
- The buzzer shakes the board at 2.7 kHz: ignore the accelerometer while it
  sounds and for a few milliseconds after.
- A reader on the desk stand gets moved; the tilt alarm should be a setting.
- A reader without a dock magnet reads `DOCK_N` = 1 all the time. The firmware
  cannot tell that from a removed reader, so the hall switch should only count
  once it has been seen as 0.
- Suggested rule: the proximity sensor decides whether the reader is on its
  dock; the hall switch and the accelerometer add detail to the report
  (lifted off, swung open, knocked).

## What changes compared with the ESP32-S3 firmware

1. **Target**: `esp32p4`, chip revision v3.x (ESP-IDF v6.1 defaults to it; on
   v6.0.x check `CONFIG_ESP32P4_SELECTS_REV_LESS_V3` is off). PSRAM is 32 MB
   in-package; flash stays 16 MB.
2. **Display**: same ST7701 panel and `esp_lcd_st7701` driver, 16-bit RGB. The
   3-wire SPI used for the init sequence goes through the IO expander:
   `esp_lcd_panel_io_additions` accepts expander pins for CS/SCL/SDA
   (`esp_io_expander_tca9554`). The P4 has a pixel-processing accelerator (PPA);
   LVGL 9 can use it as a draw unit.
3. **Backlight**: a real PWM pin instead of the expander. Use LEDC at 25 to
   40 kHz on GPIO26. Below about 2.5 kHz the driver restarts its soft start on
   every cycle. GPIO26 is one of the chip's four USB pads (24 to 27), which
   come out of reset in their USB function. Espressif's own board has its
   backlight PWM on the same pin, so nothing special is expected; it is one
   more thing to look at on the first board.
4. **Wi-Fi**: the P4 has no radio. Add `esp_wifi_remote` + `esp_hosted`
   (SDIO, 4-bit). Board-specific settings: SDMMC slot 0, the pins above,
   reset GPIO 45. In esp-hosted's configuration that is three choices, and the
   first is easy to miss: for a P4 with a C6 it selects the board
   "ESP32-P4-Function-EV-Board" by itself, which fixes the reset to GPIO54 and
   the bus to slot 1 on GPIO14 to 19. Set the board to "No specific PCB board"
   (`ESP_HOSTED_P4_DEV_BOARD_NONE`), the slot to "Slot 0 (IOMUX-fixed pins)"
   (`ESP_HOSTED_SDIO_SLOT_0`) and the reset GPIO to 45
   (`ESP_HOSTED_HOST_RESET_GPIO`). The names are those of esp-hosted's main
   branch in November 2026. The slot's pins are supplied with 3.3 V straight
   from the board, so the SD card supply setting of Espressif's board (one of
   the chip's regulators) is not needed. The ESP32-C6 needs the esp-hosted
   co-processor firmware:
   first flash through the C6 test points (C6_TX, C6_RX, C6_EN, C6_BOOT),
   later updates over the SDIO link from the P4. The C6 firmware version has to
   be tracked together with the reader firmware. The module is the MINI-1U,
   whose antenna is plugged in: nothing in the firmware depends on that, but
   a board without its antenna must not be used to judge the radio (a
   Bluetooth scan that goes silent was traced to exactly that).

   This pair has a record of problems, nearly all of them in firmware
   versions and settings. What the reports came down to is in the
   [design notes](design-notes.md#wi-fi-and-bluetooth-the-esp32-c6-behind-the-esp32-p4);
   what follows from them for the firmware:

   - **One version on both sides.** Build the C6 image from the same
     esp-hosted release as the P4's component, and check the version the C6
     reports at start. Use 3.1.0 or newer: 3.0.9 can lose the link for good
     after a failed buffer allocation.
   - **`esp_wifi_remote` to match.** Pin it in `idf_component.yml`. An
     esp-hosted from 2.11 on, built against an `esp_wifi_remote` older than
     1.3.1, frees a receive buffer twice.
   - **The first image flashed into the C6 decides whether it can be updated
     over SDIO later.** After a first image of 2.1 to 2.8, updates to newer
     releases fail (its boot loader and their images use different flash
     modes). Flash a current release at production.
   - **Reset polarity.** The line goes to the module's EN pin: low is reset,
     and it must end high. In the 2.x releases that is
     `ESP_HOSTED_SDIO_RESET_ACTIVE_HIGH`, the default; the other choice leaves
     the C6 in reset, and the P4 then reports `send_op_cond returned 0x107`.
     The 3.x releases always pulse low.
     The pulse has to last at least 2 ms, because it reaches EN through 1 k
     into 1 uF; esp-hosted's is 10 ms.
   - **SDIO clock and edges.** Bring the link up at 20 MHz, then go to 40 MHz.
     Leave the C6's timing at its default (`ESP_SDIO_PSEND_PSAMPLE`); other
     edges gave Espressif CRC errors (`0x109`) on its own board.
   - **No ROM cache functions.** Display code that calls `Cache_WriteBack_Addr()`
     or its relatives while SDIO is busy makes the link time out (`0x107`,
     "Unrecoverable host sdio state"). Use `esp_cache_msync()`.
   - **802.11ax.** On some access points the data path stalls on the first
     large download when the C6 joins in 802.11ax mode. If that shows, limit
     the station to b/g/n with `esp_wifi_set_protocol()`.
   - **Bluetooth.** The controller runs on the C6 and NimBLE on the P4, with
     HCI over the same SDIO link (`ESP_HOSTED_ENABLE_BT_NIMBLE`). The
     controller settings in today's `sdkconfig.defaults` belong into the C6's
     build then. The proxy is a central: connections that never completed
     for some devices were cured by a patch posted in esp-hosted issue 204 in
     July 2026 (the issue was still open in November 2026). Check that the
     release in use has it, and test with the devices the plugins talk to.
     Wi-Fi and Bluetooth share the C6's one radio, so a scan that runs all the
     time (the advertisement watch) takes air time from Wi-Fi: keep its window
     well below its interval.
5. **Ethernet**: internal EMAC with RMII instead of the W5500. PHY driver
   `ip101`, address 1, external 50 MHz clock on GPIO32
   (`EMAC_CLK_EXT_IN`), MDC 31, MDIO 36, data pins as in the table. Set the
   drive strength of the transmit pins (GPIO33 to 35) to the lowest value
   that works; that keeps the emissions down, and it stands in for series
   resistors, which these three lines do not have (the receive lines and the
   clock have 33 ohm at the PHY). Never raise it above the default
   (`GPIO_DRIVE_CAP_2`): simulated with the routed lengths, these lines
   overshoot by 0.13 V at the default and by 0.8 V at the strongest setting.
   The same holds for the SDIO data and command lines to the Wi-Fi module
   (GPIO39 to 42 and 44), which have no series resistors either. On the wifi
   version the PHY is not fitted: probe it and fall back to Wi-Fi.

   **Reset the PHY before the driver starts.** The board has no reset circuit
   for it: after power-up the expander pin is an input with a pull-up, so the
   PHY comes out of reset together with its supply and may have read its
   configuration pins wrongly (address, RMII mode). The firmware has to make
   the reset pulse the PHY datasheet asks for:
   1. write 0 to bit 4 of the expander's output register (it is 1 after
      power-up, so switching the pin to output alone gives no pulse),
   2. switch P4 to output and wait at least 10 ms,
   3. write 1, wait at least 10 ms more, then start the EMAC and the driver.

   The ESP-IDF `ip101` driver cannot do this itself: its reset works on a GPIO
   of the MCU only. Give it `reset_gpio_num = -1`.
6. **NFC**: unchanged PN532 protocol, now on its own I2C bus, with IRQ and a
   reset line the MCU controls. Do not update the LEDs during a card exchange:
   their 800 kHz data signal is close to the 848 kHz the card answers on.
7. **Buzzer**: a passive buzzer on a GPIO. Generate 2.7 kHz with LEDC for the
   duration of a beep instead of switching an expander pin. Never leave the pin
   high: the coil then carries 180 mA of direct current, twice its rating, and
   its series resistor more than it is made for. Stop the tone in every error
   path and after a few seconds at the latest.
8. **LEDs**: 8 addressable LEDs on GPIO47 (`led_strip`, RMT). Seen from the
   user's side the chain starts at the top right of the NFC field, runs right
   to left along the top (LED 1 to 4), then left to right along the bottom
   (LED 5 to 8). Limit white to 70 % (the LED's datasheet does for all three
   colours together). The data line is held low by a resistor until the
   firmware drives it, so the LEDs stay dark during reset.
9. **Secure boot**: use RSA-3072 Secure Boot v2 on the P4. ESP-IDF marks
   ECDSA secure boot on the P4 as not recommended because of a chip erratum.
   Flash encryption, HMAC and the digital-signature peripheral exist on the P4.
   Before Secure Download Mode is enabled in production, check the chip
   revision: on v3.1 the ROM then cannot switch the flash supply on in download
   mode (erratum ROM-770, fixed in v3.2), and this board powers the flash from
   the chip only. Such a chip could no longer be flashed through the ROM.
10. **Strapping pins**: GPIO34, 35 and 36 carry Ethernet signals. Keep them
    high-impedance or high during reset; the pull-ups on the board do that as
    long as the firmware does not drive them low before a reset.
11. **Power source**: USB, DC and PoE end on the same 5 V rail. The firmware
    cannot tell them apart.
12. **Wi-Fi transmit power**: keep it a setting, not a constant. The module is
    certified up to 19.8 dBm against a limit of 20 dBm; if the reader's
    surroundings raise the antenna gain by more than 0.2 dB, the test lab will
    ask for less power.
13. **Chip revision**: the same part number ships as v3.0, v3.1 and v3.2. v3.0
    can need a second start now and then (erratum MSPI-749; the watchdog
    restarts it), and must not switch the peripheral power domain off in light
    sleep, because the flash is supplied by one of the chip's regulators
    (erratum Analog-765).
14. **Temperature**: the board has no temperature sensor of its own; use the
    one inside the ESP32-P4 (`temperature_sensor` driver). It reads the chip,
    which the thermal estimate puts 5 K above the board under it and 30 to
    40 K above the room in typical use. The reader is a closed plastic case
    with 2.5 to 3.6 W inside, so the room's temperature and the LEDs decide
    how warm it gets: by the estimate the board runs 23 K (USB), 26 K (DC) or
    31 K (PoE) above the room in typical use, and 42 to 55 K with everything
    on for a long time, when the LED rows reach 70 to 80 K above the room.
    Dim the backlight and the LEDs, in that order of how much it helps (LEDs
    first), when the chip passes about 80 °C, and report it. The figures are
    estimates within 40 %; the bring-up plan measures them.

Not verified on hardware: everything in this list. It follows the Espressif
documentation for the parts used.
