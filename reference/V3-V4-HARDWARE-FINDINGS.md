# Waveshare ESP32-S3-Touch-LCD-4: V3 vs V4 Hardware Findings

## The Core Problem

V4 moved the IO expander (TCA9554) from its own I2C bus to the shared bus, AND changed its address to 0x24 — the same address as the PN532 NFC reader connected to the external I2C header. Both devices ACK the same address, causing bus contention and register corruption.

## V3 vs V4 I2C Bus Differences

| Component | V3 SDA | V3 SCL | V3 Addr | V4 SDA | V4 SCL | V4 Addr |
|-----------|--------|--------|---------|--------|--------|---------|
| IO Expander (TCA9554) | GPIO 8 | GPIO 9 | 0x20 | GPIO 15 | GPIO 7 | 0x24 |
| GT911 Touch | GPIO 15 | GPIO 7 | 0x14/0x5D | GPIO 15 | GPIO 7 | 0x14/0x5D |
| External I2C Header | GPIO 15 | GPIO 7 | — | GPIO 15 | GPIO 7 | — |
| PN532 NFC (external) | GPIO 15 | GPIO 7 | **0x24** | GPIO 15 | GPIO 7 | **0x24** |

**V3**: IO expander on separate bus (GPIO 8/9) at 0x20 → no conflict with PN532 at 0x24.
**V4**: IO expander merged onto shared bus (GPIO 15/7) at 0x24 → **direct conflict with PN532**.

## PN532 I2C Address

The PN532's I2C address is **hardwired to 0x24 (7-bit)** in the NXP silicon. There are no address pins and no software configuration to change it. This is not fixable.

## IO Expander (TCA9554) Pin Mapping

| Bit | Name | Function |
|-----|------|----------|
| 0 | EXIO0 / TP_RST | Touch panel reset |
| 1 | EXIO1 / BACKLIGHT | Display backlight control |
| 2 | EXIO2 / LCD_RST | LCD panel reset |
| 3 | EXIO3 | SD card CS (active low) |
| 4 | EXIO4 | Unknown / unused |
| 5 | EXIO5 / BEEPER | Buzzer control |
| 6 | EXIO6 | Unknown / unused |
| 7 | EXIO7 | Unknown / unused |

## What Happens During the Conflict

1. PN532 I2C traffic (card polling, auth) sends commands to address 0x24
2. IO expander also responds to 0x24 — it interprets PN532 data as register writes
3. TCA9554 has auto-incrementing registers: writes hit OUTPUT (0x01), POLARITY (0x02), CONFIG (0x03)
4. CONFIG register gets corrupted to 0xFF → all pins become inputs (floating)
5. BEEPER pin (bit 5) floats HIGH via internal/external pull-up → buzzer beeps constantly
6. BACKLIGHT and TP_RST may also be affected

## Exposed Connectors (V4 Board)

Bottom edge connectors, left to right:

| Connector | Pins | GPIOs | Signal Type | Usable for PN532? |
|-----------|------|-------|-------------|-------------------|
| DC 7-36V | VIN, GND | N/A | Power | No |
| RS485 | A, B | GPIO 43, 44 → SP3485EN | Differential | No (transceiver blocks raw GPIO) |
| CAN | L, H | GPIO 0, 6 → CAN transceiver | Differential | No (transceiver blocks raw GPIO) |
| I2C | VCC, GND, SDA, SCL | GPIO 15, 7 | Raw GPIO | No (conflict bus) |
| I2C Power | 5V, 3V3 | N/A | Power | No |
| BAT | +, - | N/A | Power | No |
| RTC | Coin cell | N/A | Battery | No |

**RS485 and CAN connectors are NOT usable for raw GPIO** — differential transceivers sit between the ESP32 GPIOs and the connector pads. The only raw GPIOs exposed externally are SDA/SCL on the I2C header, which is the conflict bus itself.

## SD Card Slot GPIOs (The Solution)

The micro SD card slot connects directly to ESP32-S3 GPIOs:

| SD Function | GPIO | Micro SD Pin |
|-------------|------|-------------|
| CMD (MOSI) | **GPIO 1** | Pin 3 |
| CLK (SCK) | **GPIO 2** | Pin 5 |
| DAT0 (MISO) | **GPIO 4** | Pin 7 |
| CS | EXIO3 (IO expander bit 3) | Pin 2 |

**GPIO 1 and GPIO 2 can serve as a second I2C bus (Wire1)** for the PN532, completely avoiding the address conflict. The firmware does not use the SD card.

## Chosen Solution: PN532 on Wire1 via SD Card GPIOs

Move the PN532 from the shared I2C bus (Wire, GPIO 15/7) to a dedicated second I2C bus (Wire1) using SD card slot GPIOs accessed via a micro SD breakout board.

### Wiring

| Device | I2C Bus | SDA | SCL | Address |
|--------|---------|-----|-----|---------|
| IO Expander (TCA9554) | Wire (GPIO 15/7) | GPIO 15 | GPIO 7 | 0x24 |
| GT911 Touch | Wire (GPIO 15/7) | GPIO 15 | GPIO 7 | 0x14/0x5D |
| **PN532 NFC** | **Wire1 (GPIO 1/2)** | **GPIO 1** | **GPIO 2** | **0x24** |

Same address, different buses — no conflict.

### Physical Wiring

Connect PN532 breakout to micro SD breakout board:
- PN532 SDA → SD CMD pad (GPIO 1)
- PN532 SCL → SD CLK pad (GPIO 2)
- PN532 VCC → 3.3V
- PN532 GND → GND
- PN532 IRQ → GPIO 0 (existing wire, directly to ESP32)

No jumper or mode changes needed on the PN532 breakout — it stays in I2C mode.

### Firmware Changes

1. **platformio.ini**: Add `PIN_PN532_I2C_SDA=1`, `PIN_PN532_I2C_SCL=2`
2. **nfc.hpp**: Use `Wire1` instead of `Wire` in constructor
3. **nfc.cpp**: Init `Wire1.begin(SDA=1, SCL=2)` in setup
4. Remove all address conflict workarounds (beeper disable, fullRefresh hacks)

### Benefits

- IO expander works reliably (no more register corruption from PN532 traffic)
- Beeper works normally on V4
- Display backlight and touch reset are stable
- GT911 touch init may work better without bus contention
- No PN532 hardware changes (stays I2C mode, no SEL jumper changes)
- Clean separation of concerns: onboard peripherals on Wire, external NFC on Wire1

## Other Hardware Notes

### GT911 Touch (V4)

- Address selected by INT pin state during RESET rising edge: LOW=0x5D, HIGH=0x14
- V4 uses GPIO 16 for TP_INT
- GT911 not currently detected on V4 — may be address selection timing issue
- Display works without touch (non-fatal failure in firmware)

### Display (ST7701 + RGB Interface)

- SPI init for panel registers, then RGB parallel interface for framebuffer
- Independent of I2C — not affected by the address conflict
- `gfx->begin()` must be called before GT911 init (backlight needed for address selection)

### Beeper

- Connected to IO expander bit 5 (EXIO5)
- On V3: works fine (IO expander on separate bus, no conflict)
- On V4 with PN532 on same bus: constantly beeps due to CONFIG register corruption
- After fix (PN532 on Wire1): should work normally again

### Firmware Build Targets

| Target | Board | Notes |
|--------|-------|-------|
| attractap-touch | Waveshare ESP32-S3-Touch-LCD-4 (WiFi) | Primary target for V3/V4 |
| attractap-touch-ethernet | Same + Ethernet | Uses SPI for Ethernet on different pins |
| attractap-lite-ethernet | Different board | Different I2C pins (GPIO 48/47) |
