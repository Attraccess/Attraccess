# ATT-349 Core board — ESP32-P4NRW32 pin map

> **Source of truth:** Espressif ESP32-P4 Series datasheet IOMUX table (rev 0.6+).
> **Verification status:** Draft. Cross-check against the official ESP32-P4 IDF
> `examples/ethernet/basic/sdkconfig.defaults` and the C6 `esp_hosted_sdio`
> reference pin set before tape-out. Any pin marked `(TBV)` is a working
> assignment that needs first-bring-up validation.

The ESP32-P4 uses an IO MUX with GPIO Matrix — every peripheral can be routed
to almost any GPIO, but high-speed peripherals (USB 2.0, MIPI-DSI, MIPI-CSI,
HP SDIO, octal SPI flash) are tied to dedicated pins listed on the LCSC pinout
(see `libs/attractap-hw-shared/src/parts/mcu.tsx`). The assignments below
prefer fixed-function pins where they exist; the rest are pulled from the
IDF ethernet + esp_hosted examples to minimise sdkconfig surgery.

## 1. Power + system pins (fixed)

| Function | P4 pin | Notes |
|----------|--------|-------|
| `CHIP_PU` | 103 | 10 kΩ pull-up to +3V3 + 1 µF to GND + RESET button |
| `XTAL_P` | 100 | 40 MHz crystal + 10 pF load cap to GND |
| `XTAL_N` | 99 | 40 MHz crystal + 10 pF load cap to GND |
| `VBAT` | 102 | Tie to +3V3 (no battery backup) |
| `VDDA` | 101 | +3V3 via 10 Ω + 10 µF LC filter |
| `VCCA` | 51 | +3V3 + 100 nF |
| `VDD_MIPI_DPHY` | 41 | +3V3 + 100 nF |
| `VDD_HP_0/2/3` | 26, 76, 91 | +3V3 + 100 nF each |
| `VDDPST_*` (1–6, A, B, LDO, DCDC) | 9, 21, 30, 59, 62, 67, 75, 77, 85, 96 | +3V3 + 100 nF each (one bulk 10 µF per rail bank) |
| `EN_DCDC` | 79 | Tie to +3V3 (internal DCDC always-on) |
| `FB_DCDC` | 78 | Internal DCDC feedback — tie via 1 µF to GND per datasheet |
| `VFB_VO1..4` | 71–74 | Internal LDO outputs — 1 µF cap each |
| `DSI_REXT` | 34 | Precision 200 Ω to GND |
| `CSI_REXT` | 48 | Precision 200 Ω to GND (CSI unused but tie to spec) |
| `GND` (EP) | 105 | Stitched thermal vias to GND plane |

## 2. Bootstrap pins (fixed)

| Strap | P4 pin | Default | Reason |
|-------|--------|---------|--------|
| `GPIO0` | 104 | Pull-up 10 kΩ → +3V3 + BOOT push-button to GND | 0 = download mode, 1 = SPI boot (default boot) |
| `GPIO35` | 66 | Pull-up 10 kΩ → +3V3 | UART log clock select |
| `GPIO36` | 68 | Pull-up 10 kΩ → +3V3 | UART log enable |

`GPIO0` doubles as the user BOOT button; the button shorts it to GND when held
during a reset pulse.

## 3. USB 2.0 — dual USB-C

### 3.1. `J_USB` → P4 (primary, right edge)

| Function | P4 pin | Net |
|----------|--------|-----|
| `DM` | 49 | Through 22 Ω → `J_USB` D− (USB-2.0 HS) |
| `DP` | 50 | Through 22 Ω → `J_USB` D+ |

`J_USB.VBUS` gated through `D_VBUS` SS34 Schottky → +5V rail. ESD on D±/CC handled by
`U_USB_ESD` (USBLC6-2SC6) located ≤ 5 mm from `J_USB`.

### 3.2. `J_USB_C6` → C6 native USB-Serial-JTAG (left edge, rotated 90°)

Second USB-C dedicated to ESP32-C6 native USB-Serial-JTAG controller. Lets the
PC flash C6 over a standard cable even when P4 is dead or not yet programmed.

| Function | C6 module pin (signal) | Net |
|----------|------------------------|-----|
| `C6_USB_DM` | pin 17 (`IO12`, GPIO12) | Through 22 Ω → `J_USB_C6` D− |
| `C6_USB_DP` | pin 18 (`IO13`, GPIO13) | Through 22 Ω → `J_USB_C6` D+ |

`J_USB_C6.VBUS` gated through `D_VBUS_C6` SS34 → same +5V rail (so either USB
cable also powers the board for bench bring-up). ESD on D±/CC handled by
`U_USB_C6_ESD` (USBLC6-2SC6) ≤ 5 mm from `J_USB_C6`. CC sink pull-downs
`R_USB_C6_CC1/CC2` (5.1 kΩ).

## 4. Octal flash (fixed)

The P4 has a dedicated octal-SPI flash interface on pins 27–33. Wire the
W25Q128JV (16 MB QSPI) on the same bus in quad mode — the chip will run quad,
the spare octal lines stay unused and pulled up.

| Function | P4 pin | Net |
|----------|--------|-----|
| `FLASH_CS` | 27 | W25Q128 pin 1 (`/CS`) + 10 kΩ pull-up to +3V3 |
| `FLASH_Q` (D1, MISO) | 28 | W25Q128 pin 2 (`DO`) |
| `FLASH_WP` (D2) | 29 | W25Q128 pin 3 (`/WP`) + 10 kΩ pull-up to +3V3 |
| `FLASH_HOLD` (D3) | 31 | W25Q128 pin 7 (`/HOLD`) + 10 kΩ pull-up to +3V3 |
| `FLASH_CK` | 32 | W25Q128 pin 6 (`CLK`) — 33 Ω series at the chip end (TBV) |
| `FLASH_D` (D0, MOSI) | 33 | W25Q128 pin 5 (`DI`) |
| (flash D4–D7) | (none) | Pulled to +3V3 internally — left floating |

100 nF decoupling cap on W25Q128 pin 8 (`VCC`) and pin 4 (`GND`) on the EP.

## 5. MIPI-DSI to `J_DISP` (fixed)

| `J_DISP` signal | P4 pin | Notes |
|-----------------|--------|-------|
| `DSI_CLK_P`     | 38     | 90 Ω differential |
| `DSI_CLK_N`     | 37     | 90 Ω differential |
| `DSI_D0_P`      | 39     | 90 Ω differential, ±0.5 mm intra-pair |
| `DSI_D0_N`      | 40     | 90 Ω differential |
| `DSI_D1_P`      | 35     | 90 Ω differential |
| `DSI_D1_N`      | 36     | 90 Ω differential |

Total inter-pair skew ≤ 1 mm. Pair-to-pair ≤ 5 mm.

## 6. RMII to `J_POE` (configurable via GPIO Matrix — assignment locked here)

| `J_POE` signal   | P4 pin (GPIO) | Notes |
|------------------|---------------|-------|
| `RMII_REF_CLK`   | 80 (GPIO39)   | 50 MHz from PHY → P4; 33 Ω series at the J_POE side |
| `RMII_TXD0`      | 81 (GPIO40)   | Length-matched group T |
| `RMII_TXD1`      | 82 (GPIO41)   | Length-matched group T |
| `RMII_TX_EN`     | 83 (GPIO42)   | Length-matched group T |
| `RMII_RXD0`      | 84 (GPIO43)   | Length-matched group R |
| `RMII_RXD1`      | 86 (GPIO44)   | Length-matched group R |
| `RMII_CRS_DV`    | 87 (GPIO45)   | Length-matched group R |
| `MDC`            | 88 (GPIO46)   | Open-drain — 4.7 kΩ pull-up to +3V3 |
| `MDIO`           | 89 (GPIO47)   | Open-drain — 4.7 kΩ pull-up to +3V3 |
| `nRST` (PHY)     | 90 (GPIO48)   | Active-low, driven by P4 |

Group-T (TXD0/TXD1/TX_EN) length-matched within ±5 mm of REF_CLK at the
J_POE side. Group-R likewise. (TBV against ATT-352 PoE module bring-up.)

## 7. SDIO bridge to `MCU-C6`

P4 acts as the SDIO **host**, C6 acts as the SDIO **device** (esp_hosted
firmware on the C6). 4-bit bus + clock + cmd at +3V3.

| Net           | P4 pin (GPIO) | C6 pin (signal) | Pull |
|---------------|---------------|-----------------|------|
| `SDIO_CLK`    | 92 (GPIO49)   | C6 pin 25 (IO19)  | — |
| `SDIO_CMD`    | 93 (GPIO50)   | C6 pin 24 (IO18)  | 10 kΩ to +3V3 |
| `SDIO_D0`     | 94 (GPIO51)   | C6 pin 26 (IO20)  | 10 kΩ to +3V3 |
| `SDIO_D1`     | 95 (GPIO52)   | C6 pin 27 (IO21)  | 10 kΩ to +3V3 |
| `SDIO_D2`     | 97 (GPIO53)   | C6 pin 28 (IO22)  | 10 kΩ to +3V3 |
| `SDIO_D3`     | 98 (GPIO54)   | C6 pin 29 (IO23)  | 10 kΩ to +3V3 |
| `C6_EN`       | 3 (GPIO1)     | C6 pin 8 (EN)     | 10 kΩ to +3V3 + 1 µF to GND. P4 open-drain drives LOW to reset C6. |
| `C6_BOOT`     | 4 (GPIO2)     | C6 pin 23 (IO9)   | 10 kΩ to +3V3. P4 open-drain pulls LOW during EN release for download mode. |
| `C6_U0RXD`    | 5 (GPIO3)     | C6 pin 30 (RXD0)  | P4 TX → C6 U0 RX. esptool-stub UART path. |
| `C6_U0TXD`    | 6 (GPIO4)     | C6 pin 31 (TXD0)  | C6 U0 TX → P4 RX. esptool-stub UART path. |

> **Note**: GPIO1–4 are LP/RTC-domain IO. Drive strength sufficient for
> open-drain reset + 921600 baud UART; validate at first bring-up.
> The four lines together let P4 act as a USB-Serial-stub bridge so the user
> can flash both P4 and C6 over the single `J_USB` USB-C without unplugging.
> Independent flashing of C6 also possible directly via `J_USB_C6` (see §3.2)
> using the native USB-Serial-JTAG controller on C6.IO12/IO13.

## 8. I²C — split into two buses to keep `J_NFC` and `J_DISP` independent

| Bus | SDA | SCL | Devices |
|-----|-----|-----|---------|
| `I2C0` (NFC) | GPIO52 (P4 pin 95) (TBV) | GPIO53 (P4 pin 97) (TBV) | PN532 on `J_NFC` |
| `I2C1` (Touch) | GPIO24 (P4 pin 52) | GPIO25 (P4 pin 53) | GT911 on `J_DISP` |

Same TBV conflict as §7. Final assignment lands at PINMAP-lock review.

## 9. PWM, IRQs, control signals

| Net | P4 pin (GPIO) | Notes |
|-----|---------------|-------|
| `BEEP_PWM` (→ `J_BEEP`) | GPIO26 (P4 pin 55) | 4 kHz square wave |
| `NFC_IRQ` (← `J_NFC`)   | GPIO27 (P4 pin 56) | Active-low, pull-up 10 kΩ |
| `NFC_RSTPDN` (→ `J_NFC`) | GPIO28 (P4 pin 57) | Active-low |
| `NFC_LED_DATA` (→ `J_NFC`) | GPIO29 (P4 pin 58) | WS2812 ring data — 33 Ω series, ferrite |
| `BL_PWM` (→ `J_DISP`)   | GPIO30 (P4 pin 60) | LED-driver PWM |
| `BL_EN`  (→ `J_DISP`)   | GPIO31 (P4 pin 61) | Active-high panel backlight enable |
| `DISP_RESET` (→ `J_DISP`) | GPIO32 (P4 pin 63) | Active-low |
| `TOUCH_INT` (← `J_DISP`)  | GPIO33 (P4 pin 64) | Active-low, pull-up 10 kΩ |
| `TOUCH_RST` (→ `J_DISP`)  | GPIO34 (P4 pin 65) | Active-low |

## 10. JTAG (fixed alt-function — same pins as `GPIO35`–`GPIO38` strap row)

| Function | P4 pin (GPIO) | ARM SWD 10-pin header |
|----------|---------------|-----------------------|
| `TMS`  | GPIO35 (P4 pin 66) | pin 2 (SWDIO) |
| `TCK`  | GPIO36 (P4 pin 68) | pin 4 (SWCLK) |
| `TDO`  | GPIO37 (P4 pin 69) | pin 6 (SWO) |
| `TDI`  | GPIO38 (P4 pin 70) | pin 8 (NC for SWD, used for JTAG-4-wire) |

P4 supports both SWD and JTAG-4-wire on these pins. The ARM Cortex SWD header
also exposes `nRST` (pin 10) wired to `CHIP_PU` so the debugger can reset the
P4 without the user RESET button.

## 11. UART0 console

| Function | P4 pin (GPIO) | Notes |
|----------|---------------|-------|
| `U0TXD` | GPIO43 (P4 pin 84) | Default UART0 |
| `U0RXD` | GPIO44 (P4 pin 86) | Default UART0 |

UART0 also reachable through USB-Serial-JTAG on `DM`/`DP` (preferred bring-up
path). Physical UART pads on the JTAG header (pin 7/9) so a 3.3 V USB-UART
dongle can be attached without USB-C.

## Open follow-ups handed back to ATT-349 schematic step

1. `FLASH_CK` 33 Ω series — confirm against the W25Q128 datasheet at 80 MHz.
2. Touch `INT`/`RST` pull-up values — confirm against GT911 datasheet.
3. RMII length match against ATT-352 PoE board ticket — both sides need the
   same numeric target.
4. LP-IO drive strength on `C6_EN`/`C6_BOOT`/`C6_U0RXD`/`C6_U0TXD` (GPIO1–4)
   — first-bring-up smoke test confirms UART works at 921600 baud.
