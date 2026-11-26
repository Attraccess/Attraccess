# Pin map and firmware port
<!-- llms-description: Pin map of the Touch P4 board and the rules the reader firmware must follow on it: Wi-Fi co-processor, EU radio settings, power and heat limits. -->

What the firmware needs to know to run on the Touch P4 board: the rules it must keep, the pin map, the
I2C devices, the tamper sensors and what changes against the ESP32-S3 firmware. For firmware developers.
Figures marked "simulated" come from the [simulations](hardware/touch-p4/simulations.md); nothing here
has been measured on hardware yet. It follows Espressif's documentation for the parts used.

## Firmware rules

Each rule is something the board cannot protect itself against, or a known trap of its parts. Rules
marked **hard** are requirements, not advice.

| # | Rule | Otherwise | Detail |
|---|---|---|---|
| 1 | Never leave the buzzer pin (GPIO46) high; stop the tone in every error path | 180 mA DC through the coil, twice its rating; its resistor overloaded | [NFC, buzzer and LEDs](#nfc-buzzer-and-leds) |
| 2 | LEDs: white at 70 % at most, only for seconds. Steady light at 30 % or less | The LED rows sit on narrow copper between cut-outs; steady white at 70 % makes them about 30 K warmer than the rest of the board | [Temperature](#temperature) |
| 3 | Read the chip's temperature sensor; dim LEDs, then backlight, above about 80 °C | In a 40 °C room on PoE the display and the PoE module get close to their limits | [Temperature](#temperature) |
| 4 | Pulse the Ethernet PHY's reset through the IO expander before the EMAC starts | The PHY may come up with the wrong address or without its clock | [Ethernet](#ethernet) |
| 5 | esp-hosted: board "none", SDMMC slot 0, reset GPIO 45; the reset line must end high | Defaults are those of Espressif's board (slot 1, GPIO54); the C5 stays in reset: `send_op_cond returned 0x107` | [Wi-Fi co-processor](#wi-fi-co-processor-esp-hosted) |
| 6 | The same esp-hosted release on P4 and C5, 3.1.0 or newer; `esp_wifi_remote` pinned to match | No association, dropped packets, a dead link, a double free | [Wi-Fi co-processor](#wi-fi-co-processor-esp-hosted) |
| 7 | The first image flashed into the C5 is a current release | After a first image of 2.1 to 2.8 the C5 cannot be updated over SDIO | [Wi-Fi co-processor](#wi-fi-co-processor-esp-hosted) |
| 8 | Drive strength of GPIO33 to 35 and GPIO39 to 44 at the default or lower | No series resistors. Simulated overshoot: 0.13 V at the default, 0.8 V at the strongest | [Ethernet](#ethernet) |
| 9 | C5 SDIO timing at its default edges; bring the link up at 20 MHz, then 40 MHz | CRC errors (`0x109`) | [Wi-Fi co-processor](#wi-fi-co-processor-esp-hosted) |
| 10 | No ROM cache functions (`Cache_WriteBack_Addr()` and relatives) in display code; use `esp_cache_msync()` | SDIO times out: "Unrecoverable host sdio state" | [Wi-Fi co-processor](#wi-fi-co-processor-esp-hosted) |
| 11 | No LED data during an NFC exchange | LED data (800 kHz) sits next to the card's answer (848 kHz) | [NFC, buzzer and LEDs](#nfc-buzzer-and-leds) |
| 12 | Backlight PWM at 25 to 40 kHz | Below 2.5 kHz the driver restarts its soft start every cycle | [Display and backlight](#display-and-backlight) |
| 13 | Keep GPIO34 to 36 high or undriven up to a reset | Strapping pins: driven low, the chip starts in the wrong mode | [GPIO map](#esp32-p4-gpio-map); the board's pull-ups hold them high unless the firmware drives them low |
| 14 | On PoE keep the board above 100 mA: no deep sleep with the backlight off | Below the PoE module's minimum load the switch may cycle the port | [design notes](hardware/touch-p4/design-notes.md#power) |
| 15 | Bluetooth: scan window well below the scan interval; test connecting to the devices in use | Wi-Fi and Bluetooth share the C5's one radio; central connections failed for some devices before a fix of July 2026 | [Wi-Fi co-processor](#wi-fi-co-processor-esp-hosted) |
| 16 | 802.11ax is a setting, not a constant | Some access points stall the link in 802.11ax mode | [Wi-Fi co-processor](#wi-fi-co-processor-esp-hosted) |
| 17 | Secure boot with RSA-3072. Check the chip revision before enabling Secure Download Mode | ECDSA secure boot has an erratum; on v3.1 the chip could no longer be flashed through its ROM | [Secure boot and chip revision](#secure-boot-and-chip-revision) |
| 18 | The hall switch counts only after it has read 0 once; ignore the accelerometer while the buzzer sounds | A reader without a dock magnet looks removed; the buzzer shakes the board | [Tamper detection](#tamper-detection) |
| 19 | **Hard.** On USB alone, keep within what the USB source offers | A USB 2.0 port gives 500 mA, the board draws up to 0.9 A: the port shuts down or the eFuse turns the board off | [Power limits per source](#power-limits-per-source) |
| 20 | **Hard.** All LED channels together below 100 mA steady (rule 2 keeps them there) | The 5 V sources' 30 % headroom assumes it ([design notes](hardware/touch-p4/design-notes.md#power-budget)) | [NFC, buzzer and LEDs](#nfc-buzzer-and-leds) |
| 21 | **Hard.** The buzzer sounds only while the NFC field is off | The power budget counts either the buzzer or the NFC transmitter, not both | [NFC, buzzer and LEDs](#nfc-buzzer-and-leds) |
| 22 | **Hard.** Wi-Fi country fixed to the EU rules: manual country policy, 802.11d off, 5 GHz channels 36 to 140 only; no user setting for country or band | The radio would adopt an access point's country, or the user could pick one, which the 5 GHz rules forbid | [EU radio rules](#eu-radio-rules) |
| 23 | **Hard.** No SoftAP (provisioning) on channels 52 to 140: only 2.4 GHz or channels 36 to 48 | The C5 has no radar detection of its own | [EU radio rules](#eu-radio-rules) |
| 24 | **Hard.** Transmit power a setting, capped at what the test lab measured on the reader; never above 20 dBm EIRP at 2.4 GHz and in 5250 to 5725 MHz | The module's certificate is 0.15 dB below the 2.4 GHz limit, measured with the antenna elsewhere | [EU radio rules](#eu-radio-rules) |
| 25 | **Hard.** The C5 sends at most 40 % of the time, averaged over a minute | The air beside the module would pass its 85 °C rating on PoE in a 40 °C room | [Temperature](#temperature) |
| 26 | Never burn the C5's eFuse JTAG_SEL_ENABLE | The C5 would then read SDIO D1 (its GPIO7) at start to choose its JTAG source | [Wi-Fi co-processor](#wi-fi-co-processor-esp-hosted) |

What the board does itself: resistors hold the LEDs, backlight, buzzer and PN532 off until the firmware
drives their pins, and the supervisor U204 holds the MCU in reset for 120 to 280 ms after the 3.3 V rail is up (the
chip asks for 50 us).

## ESP32-P4 GPIO map

| GPIO | Signal | Notes |
|---|---|---|
| 0 | TP_RST | GT911 touch reset |
| 1 | I2C0_SCL | touch, IO expander, tamper sensors; 2.2 k pull-up |
| 2 | I2C0_SDA | |
| 3 | TP_INT | GT911 interrupt; also selects the touch I2C address at reset |
| 4 to 8 | LCD R5, R4, R3, R2, R1 | through 33 ohm |
| 9 to 14 | LCD G5, G4, G3, G2, G1, G0 | through 33 ohm |
| 15 to 19 | LCD B5, B4, B3, B2, B1 | through 33 ohm |
| 20 / 21 / 22 / 23 | LCD_HSYNC / LCD_VSYNC / LCD_DE / LCD_PCLK | |
| 24 / 25 | USB D- / D+ | USB Serial/JTAG |
| 26 | BL_PWM | backlight, PWM 25 to 40 kHz, high = on, pulled low at reset |
| 27 | not connected | |
| 28 / 29 / 30 | RMII CRS_DV / RXD0 / RXD1 | |
| 31 | ETH MDC | |
| 32 | RMII REF_CLK | 50 MHz input from the PHY |
| 33 | RMII TX_EN | |
| 34 | RMII TXD0 | strapping pin, 10 k pull-up |
| 35 | RMII TXD1 | strapping pin, BOOT button, 10 k pull-up |
| 36 | ETH MDIO | strapping pin, 1.5 k pull-up |
| 37 / 38 | UART0 TX / RX | test points TX0, RX0 |
| 39 to 42 | SDIO D0 to D3 | to the ESP32-C5, 51 k pull-ups |
| 43 | SDIO CLK | 22 ohm series |
| 44 | SDIO CMD | 51 k pull-up |
| 45 | C5_EN | resets the ESP32-C5, through 1 k |
| 46 | BUZZER | 2.7 kHz square wave, high = coil on |
| 47 | LED_DATA | 8 x SK6812, GRB, 800 kbit/s; 100 k pull-down |
| 48 | not connected | |
| 49 | NFC_IRQ | PN532 P70_IRQ, active low |
| 50 | NFC_RST | PN532 RSTPD_N, 10 k pull-down: drive high to run |
| 51 / 52 | NFC_SDA / NFC_SCL | second I2C bus, 2.2 k pull-ups |
| 53, 54 | not connected | |

The map comes from `P4_GPIO` in `scripts/bootstrap/circuit_core.py`, which also generates the short
version printed on the board's component side.

## IO expander

TCA9554 at 0x20 on I2C0. All pins are inputs with weak pull-ups after power-up. Its interrupt output is
not connected: poll the input register.

| Pin | Signal | Direction |
|---|---|---|
| P0 / P1 / P2 | LCD_CS / LCD_SCK / LCD_SDA | out |
| P3 | LCD_RST | out |
| P4 | ETH_RST_N | out, low = PHY in reset; must be pulsed (see [Ethernet](#ethernet)) |
| P5 | DC_PRESENT | in: high while the DC converter's output is on (+5V_DC through 51 k / 100 k) |
| P6 | DOCK_N | in: low while the reader is on its dock (hall switch U703) |
| P7 | POE_PRESENT | in: high while the PoE module's output is on (+5V_POE through 51 k / 100 k) |

## I2C addresses

| Bus | Device | Address |
|---|---|---|
| I2C0 (GPIO1/2) | GT911 touch | 0x5D or 0x14 (INT level at reset) |
| I2C0 | TCA9554 IO expander | 0x20 |
| I2C0 | LIS2DH12 accelerometer | 0x19 |
| I2C0 | VCNL4040 proximity and light sensor | 0x60 |
| I2C1 (GPIO51/52) | PN532 | 0x24 |

- Use two controllers: `I2C_NUM_0` for GPIO1/2, `I2C_NUM_1` for GPIO51/52. The firmware's single shared
  bus (`getSharedI2CBus()`) has to be split.
- The PN532 has its own bus, so no address shifter is needed (`PN532_I2C_ADDRESS` is 0x24; on the
  `attractap-touch-v2` hardware the expander also sat at 0x24 and the PN532 was shifted to 0x64). Its
  clock stretching no longer delays touch polling.
- The expander's three address pins are grounded: 0x20. The part must be the TCA9554, not the TCA9554A
  (0x38).
- The GT911 reads TP_INT while TP_RST is released: hold TP_INT low for 0x5D.
- The Ethernet PHY answers on MDIO at address 1.

`scripts/bootstrap/check_netlist.py` prints the devices and addresses on each I2C bus from the schematic.
It fails when two devices on one bus share an address or a device has no entry in its address table.

## Power limits per source

USB, DC and PoE all feed the same 5 V rail; the firmware cannot tell which one is supplying it, only
whether DC and PoE are present. The board does not read what a USB source offers, so on USB alone the
firmware assumes the smallest offer, 500 mA (a USB 2.0 port; a Type-C source at Default USB Power gives
500 or 900 mA).

1. Read expander P5 (DC present) and P7 (PoE present) at least every 0.5 s. If either is high, no USB
   limit applies.
2. Otherwise: LEDs off, no buzzer, backlight at 30 % or less, NFC polling as usual. Estimated draw
   0.43 A (3.3 V rail at its typical 0.34 A, backlight at 30 %, PN532); bring-up measures it.

Without this the hardware stays safe: the eFuse limits USB current to 1.8 to 2.2 A and turns the board
off when VBUS falls below about 3.9 V, and a source that cannot deliver protects itself.

Reading the source's CC level would let a 1.5 or 3 A charger run the board without limits. It is not
fitted: the only free ADC pins (GPIO53, GPIO54) sit behind the crystal, and no route to the USB-C
connector was left on any layer. A service port does not need the full board.

## Tamper detection

Three sensors; the firmware does not use them yet.

- **Hall switch U703 (DRV5032FA)** on expander P6, net `DOCK_N`. Leave P6 an input. It reads 0 while the
  dock's magnet is in front of it, 1 off the dock. It samples 20 times a second, so reading the expander a
  few times a second is enough.
- **Accelerometer U702 (LIS2DH12)** on I2C0 at 0x19 (`WHO_AM_I`, 0x0F, reads 0x33). Its interrupt sources
  latch (bit `LIR` in `CTRL_REG5`), so poll `INT1_SRC` and `CLICK_SRC`; no interrupt pin is needed. INT1
  is on test point TP814. Set up click detection for knocks, and the 6D or activity function against the
  direction of gravity stored at installation, for the reader being swung open or pulled off.
- **Proximity sensor U704 (VCNL4040)** on I2C0 at 0x60 (ID register 0x0C reads 0x0186). Registers are
  16 bits, low byte first. It measures the infrared light the dock's plate reflects and is the sensor to
  trust for "on the dock": nothing outside the case reaches its light path, while a magnet held to the
  case keeps `DOCK_N` at 0.
  - Set-up: `PS_CONF1`/`PS_CONF2` (0x03) for pulse length, repetition and 16-bit output;
    `PS_CONF3`/`PS_MS` (0x04) for the emitter current (50 to 200 mA). Proximity value in 0x08. It powers
    up with the measurement off.
  - At commissioning, store the mounted reader's value as reference and write a band around it to
    `PS_THDL` (0x06) and `PS_THDH` (0x07), interrupt in both directions. The part then latches a flag in
    `INT_Flag` (0x0B, high byte) when a value leaves the band, so a lift between two polls is not missed.
    Reading the flag clears it. INT is on test point TP815 only.
  - The value depends on the dock's colour: no fixed threshold fits every reader. Off the dock it is close
    to 0.
  - Ambient light in 0x09 (`ALS_CONF`, 0x00, switches it on). Behind the board it is dark on the dock;
    treat light as a hint, not proof, until measured on real units.
- Ignore the accelerometer while the buzzer sounds (2.7 kHz) and for a few milliseconds after.
- A reader on the desk stand gets moved: the tilt alarm should be a setting.
- A reader without a dock magnet reads `DOCK_N` = 1 all the time, like a removed one: count the hall
  switch only once it has read 0.
- Suggested rule: the proximity sensor decides "on the dock"; hall switch and accelerometer add detail
  (lifted off, swung open, knocked).

## Differences to the ESP32-S3 firmware

### Target

`esp32p4`, chip revision v3.x (ESP-IDF v6.1 defaults to it; on v6.0.x check that
`CONFIG_ESP32P4_SELECTS_REV_LESS_V3` is off). 32 MB PSRAM in the package; flash stays 16 MB.

### Display and backlight

- Same ST7701 panel and `esp_lcd_st7701` driver, 16-bit RGB. The 3-wire SPI for the init sequence goes
  through the IO expander: `esp_lcd_panel_io_additions` accepts expander pins for CS/SCL/SDA
  (`esp_io_expander_tca9554`).
- The P4's pixel-processing accelerator (PPA) can serve LVGL 9 as a draw unit.
- Backlight: LEDC at 25 to 40 kHz on GPIO26 instead of an expander pin. GPIO26 is one of the USB pads (24
  to 27), which leave reset in their USB function; Espressif's own board uses the same pin for its
  backlight. Check it on the first board.

### Wi-Fi co-processor (esp-hosted)

The P4 has no radio. Add `esp_wifi_remote` and `esp_hosted` (SDIO, 4-bit) on the P4; the ESP32-C5-MINI-1
(PCB antenna, 2.4 and 5 GHz) runs the esp-hosted co-processor firmware. Background on this pair is in
the [design notes](hardware/touch-p4/design-notes.md#wi-fi).

| esp-hosted setting (main branch, November 2026) | Value |
|---|---|
| Board | "No specific PCB board" (`ESP_HOSTED_P4_DEV_BOARD_NONE`). For a P4 host the default is "ESP32-P4-Function-EV-Board", which fixes reset to GPIO54 and slot 1 on GPIO14 to 19 |
| Slot | "Slot 0 (IOMUX-fixed pins)" (`ESP_HOSTED_SDIO_SLOT_0`) |
| Reset GPIO | 45 (`ESP_HOSTED_HOST_RESET_GPIO`) |
| Reset polarity (2.x releases) | `ESP_HOSTED_SDIO_RESET_ACTIVE_HIGH`, the default: the line goes to EN, low is reset, and it must end high. The other choice leaves the C5 in reset (`send_op_cond returned 0x107`). 3.x releases always pulse low |
| C5 SDIO timing | Default (`EH_TRANSPORT_CP_SDIO_TIMING`: send and sample on the rising edge). The C5's edge strap pins (GPIO25, MTDI) are left open |
| C5 partition table | `partitions_eh_cp_ota_4m.csv` (4 MB module) |

- The slot's pins get 3.3 V straight from the board; the SD card supply setting of Espressif's board is
  not needed.
- **Versions.** Build the C5 image from the same esp-hosted release as the P4's component, 3.1.0 or newer
  (the first to list the C5 as SDIO co-processor; 3.0.9 can lose the link for good after a failed buffer
  allocation). Check the version the C5 reports at start, and track it with the reader firmware. Pin
  `esp_wifi_remote` in `idf_component.yml`: esp-hosted 2.11 or newer with `esp_wifi_remote` older than
  1.3.1 frees a receive buffer twice.
- **Flashing.** First flash through the C5's test points (TX, RX, EN, BOOT beside the "C5" tag); its USB
  pins carry SDIO D2 and D3, so the C5 has no USB here. Later updates go over SDIO from the P4. The first
  image decides whether that works: after a first image of 2.1 to 2.8, updates to newer releases fail
  (different flash modes in boot loader and image). Flash a current release at production.
- **Reset pulse.** At least 2 ms, because it reaches EN through 1 k into 1 uF; esp-hosted's is 10 ms.
- **Clock.** Bring the link up at 20 MHz, then 40 MHz. Other edge settings gave Espressif CRC errors
  (`0x109`) on its own board (with the ESP32-C6). Bring-up measures throughput and error count at 40 and
  50 MHz before the clock is fixed.
- **Cache.** Display code that calls `Cache_WriteBack_Addr()` or its relatives while SDIO is busy makes
  the link time out (`0x107`, "Unrecoverable host sdio state"). Use `esp_cache_msync()`.
- **802.11ax.** With some access points the data path stalls on the first large download when the station
  joins in 802.11ax mode (reported with the ESP32-C6; the C5 has 802.11ax too). If it shows, limit the
  station to b/g/n with `esp_wifi_set_protocol()`.
- **Bluetooth.** The controller runs on the C5, NimBLE on the P4, with HCI over the same SDIO link
  (`ESP_HOSTED_ENABLE_BT_NIMBLE`); the controller settings in today's `sdkconfig.defaults` move into the
  C5's build. Connections as a central that never completed for some devices were fixed by a patch posted
  in esp-hosted issue 204 in July 2026 (the issue was still open in November 2026): check the release in
  use has it, and test with the devices the plugins talk to. A permanent scan (the advertisement watch)
  takes air time from Wi-Fi: keep its window well below its interval.
- **JTAG.** Never burn the C5's eFuse JTAG_SEL_ENABLE (rule 26).

### EU radio rules

Sources and clauses are in [compliance](hardware/touch-p4/compliance.md). The C5 only listens for radar:
it "supports DFS channels in the 5 GHz band, but only supports passive radar detection" and "cannot
operate as a DFS AP in SoftAP mode" (ESP-IDF Wi-Fi guide, "Dynamic Frequency Selection"). Set once at
start:

- **Country**: `esp_wifi_set_country()` with `WIFI_COUNTRY_POLICY_MANUAL` (Germany's channels and limits
  for the EU build), so the radio never adopts the country an access point announces. ESP-IDF's default is
  world mode with the automatic policy, which follows the access point. The EU 5 GHz decision requires that
  the user cannot change country or band where that breaks the rules: no such setting in the UI or API.
- **5 GHz channels**: `wifi_5g_channel_mask` in the same `wifi_country_t` (effective only under the manual
  policy): 36 to 64 and 100 to 140. Not 149 to 165: in the EU those are a short-range-device band at
  25 mW, outside the RLAN decision, with national conditions.
- **SoftAP**: provisioning runs on 2.4 GHz or channels 36 to 48, and stays off while the station is
  connected on a DFS channel, because in STA+SoftAP mode the C5 moves its access point to the station's
  channel. ESP-IDF 6.0.2, which this repository pins, has no hint to lock SoftAP out of DFS channels; the
  manual policy with the channel mask does it.
- **Transmit power**: a setting capped at the value the test lab finds compliant on the reader
  (`esp_wifi_set_max_tx_power()`, steps of 0.25 dB). The module's certificate lists 19.85 dBm at 2.4 GHz
  (limit 20 dBm EIRP) and 20.58 to 20.77 dBm in the three 5 GHz bands, measured on Espressif's board.
  Here the antenna sits elsewhere, and in the full-wave model it radiates up to 5.5 dB more in some 5 GHz
  channels than at Espressif's position ([design notes](hardware/touch-p4/design-notes.md#antenna)). Limits for a station without radar detection: 20 dBm EIRP at 2.4 GHz, 23 dBm in 5150 to
  5250 MHz, 20 dBm in 5250 to 5725 MHz unless the firmware does transmit power control (TPC), which the lab
  then has to confirm.
- Indoor use only for channels 36 to 64 is a duty of the manual and packaging, not the firmware.

### Ethernet

- Internal EMAC with RMII instead of the W5500. PHY driver `ip101`, address 1, external 50 MHz clock on
  GPIO32 (`EMAC_CLK_EXT_IN`), MDC 31, MDIO 36, data pins as in the GPIO map.
- Set the transmit pins' (GPIO33 to 35) drive strength to the lowest value that works, never above the
  default (`GPIO_DRIVE_CAP_2`). It stands in for series resistors, which these lines do not have (receive
  lines and clock have 33 ohm at the PHY), and keeps emissions down. Simulated with the routed lengths:
  0.13 V overshoot at the default, 0.8 V at the strongest. The same holds for the SDIO data and command
  lines (GPIO39 to 42, 44).
- On the Wi-Fi version the PHY is not fitted: probe it and fall back to Wi-Fi.
- **Reset the PHY before the driver starts.** The board has no reset circuit for it: after power-up the
  expander pin is an input with pull-up, so the PHY leaves reset with its supply and may read its
  configuration pins (address, RMII mode) wrongly.
  1. Write 0 to bit 4 of the expander's output register (it is 1 after power-up, so switching the pin to
     output alone gives no pulse).
  2. Switch P4 to output, wait at least 10 ms.
  3. Write 1, wait at least 10 ms more, then start the EMAC and the driver.

  The ESP-IDF `ip101` driver can only reset through an MCU GPIO: give it `reset_gpio_num = -1`.

### NFC, buzzer and LEDs

- **NFC**: unchanged PN532 protocol, now on its own I2C bus, with IRQ and a reset line the MCU controls.
  No LED updates during a card exchange (rule 11).
- **Buzzer**: passive, on GPIO46. Generate 2.7 kHz with LEDC for the length of a beep. Never leave the pin
  high: the coil then carries 180 mA DC, twice its rating, and its series resistor more than it is made
  for. Stop the tone in every error path and after a few seconds at the latest; sound it only while the
  NFC field is off.
- **LEDs**: eight addressable LEDs on GPIO47 (`led_strip`, RMT). Seen from the user, the chain starts top
  right of the NFC field, runs right to left along the top (LED 1 to 4), then left to right along the
  bottom (LED 5 to 8). White at 70 % at most (the LED datasheet's limit for all three colours together);
  see rules 2 and 20. A resistor holds the data line low, so the LEDs stay dark during reset.

### Secure boot and chip revision

- Use RSA-3072 Secure Boot v2. ESP-IDF marks ECDSA secure boot on the P4 as not recommended because of a
  chip erratum. Flash encryption, HMAC and the digital-signature peripheral exist.
- The same part number ships as v3.0, v3.1 and v3.2. Before enabling Secure Download Mode in production,
  check the revision: on v3.1 the ROM then cannot switch the flash supply on in download mode (erratum
  ROM-770, fixed in v3.2), and this board powers the flash from the chip only. Such a chip could no longer
  be flashed through the ROM.
- v3.0 can need a second start now and then (erratum MSPI-749; the watchdog restarts it), and must not
  switch the peripheral power domain off in light sleep, because one of the chip's regulators supplies the
  flash (erratum Analog-765).

### Temperature

The board has no temperature sensor of its own: use the one in the ESP32-P4 (`temperature_sensor`
driver). It reads the chip, which the thermal estimate puts 5 K above the board under it and 30 to 40 K
above the room in typical use.

- The closed case holds 2.5 to 3.5 W, so room temperature and LEDs decide how warm it gets. Estimated
  board rise over the room in typical use: 22 K (USB), 26 K (DC), 31 K (PoE); with everything on for a
  long time 39 to 52 K, with the LED rows at 70 to 82 K.
- In a 40 °C room on PoE the estimate puts the display at 63 °C (limit 70 °C) and the air around the PoE
  module at 71 °C (limit 85 °C): closer than the estimate is exact.
- Above about 80 °C at the chip: dim the LEDs first, then the backlight, and report it; if that is not
  enough, hold the radio back as well.
- The Wi-Fi module's 85 °C rating is about the air right outside it: up to 75 °C on PoE in a 40 °C room
  with the module mostly receiving, 84 °C when it sends 40 % of the time. So the firmware keeps sending to
  40 % of the time, averaged over a minute (from the bytes queued and the link rate, or from esp-hosted's
  statistics). The reader's own traffic stays far below; it bites only on long uploads such as logs.
- The figures are estimates within 40 %; the [bring-up plan](hardware/touch-p4/bring-up.md) measures them.
