# Pin map and firmware port

What the firmware needs to know to run on the Attractap Touch P4 board.

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

The board has two sensors for this and the firmware does not use them yet.

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
- The buzzer shakes the board at 2.7 kHz: ignore the accelerometer while it
  sounds and for a few milliseconds after.
- A reader on the desk stand gets moved; the tilt alarm should be a setting.
- A reader without a dock magnet reads `DOCK_N` = 1 all the time. The firmware
  cannot tell that from a removed reader, so the dock state should only count
  once it has been seen as 0.

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
   every cycle.
4. **Wi-Fi**: the P4 has no radio. Add `esp_wifi_remote` + `esp_hosted`
   (SDIO, 4-bit). Board-specific settings: SDMMC slot 0, the pins above,
   reset GPIO 45. The ESP32-C6 needs the esp-hosted co-processor firmware:
   first flash through the C6 test points (C6_TX, C6_RX, C6_EN, C6_BOOT),
   later updates over the SDIO link from the P4. The C6 firmware version has to
   be tracked together with the reader firmware. Boards built with the
   MINI-1U module (external antenna) need no firmware change.
5. **Ethernet**: internal EMAC with RMII instead of the W5500. PHY driver
   `ip101`, address 1, external 50 MHz clock on GPIO32
   (`EMAC_CLK_EXT_IN`), MDC 31, MDIO 36, data pins as in the table. Set the
   drive strength of the transmit pins (GPIO33 to 35) to the lowest value
   that works; that keeps the emissions down. On the wifi
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

Not verified on hardware: everything in this list. It follows the Espressif
documentation for the parts used.
