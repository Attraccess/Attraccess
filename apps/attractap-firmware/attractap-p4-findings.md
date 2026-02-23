# Attractap P4 – Guition JC1060P470

Target: **Guition JC1060P470** 7" 1024×600 DSI touchscreen (ESP32-P4 + C6 coprocessor)  
Ref: [Reddit thread](https://www.reddit.com/r/homeassistant/s/7yXRVO9815), [esphome-lvgl guition-esp32-p4-jc1060p470](https://github.com/jtenniswood/esphome-lvgl/tree/main/guition-esp32-p4-jc1060p470)

---

## POC vs Full Application

**Status: POC (proof of concept).** Display and touch work, but this is not the full Attractap application.

| POC (current) | Full application |
|---------------|------------------|
| `main_p4.cpp` – minimal entry | `main.cpp` – full app entry |
| `display_p4.cpp` + `display_p4.hpp` – P4-only display | `display.cpp` – full display with all screens |
| Boot screen only | Application, API, network, NFC, etc. |
| Excluded: application/, api/, network/, nfc/, most screens | All of the above included |

**Build filter** excludes `main.cpp` and `display.cpp`; includes `main_p4.cpp` and `display_p4.cpp`. Many screens and modules are excluded.

**Next step:** Merge P4 support into the full app – unify display.cpp to support P4 DSI driver via build flags, switch main entry by target, re-enable application/network/etc for P4.

---

## Status

**Serial:** Working (ARDUINO_USB_MODE=1 → HWCDCSerial)  
**Display:** ✅ Working  
**Touch:** GT911 OK

---

## Working Configuration

| Parameter        | Value |
|------------------|-------|
| Display reset    | GPIO05 |
| Backlight        | GPIO23, PWM, **active-high** |
| HSYNC pulse      | 20 |
| DSI lane rate    | 750 Mbps |
| Prefer speed     | 48 MHz |

Build flag: `P4_LCD_BL_ACTIVE_HIGH=1`

---

## Hardware Pins (Guition JC1060P470)

| Function        | Pin  |
|-----------------|------|
| I2C SDA         | 7    |
| I2C SCL         | 8    |
| Touch reset     | 22   |
| Touch interrupt | 21   |
| Display reset   | 5    |
| Backlight       | 23   |

---

## Fixes Applied

1. **Serial** – `-DARDUINO_USB_MODE=1` for USB-Serial-JTAG output
2. **Arduino_ESP32SPIDMA.cpp** – `spiFrequencyToClockDiv` API fix for ESP32-P4
3. **Backlight** – PWM active-high (ESPHome config says active-low; this board uses active-high)
4. **Display reset** – GPIO05 (ESPHome uses 5; Arduino_GFX example uses 27)
5. **HSYNC** – 20 (ESPHome; Arduino_GFX uses 40)

---

## Build & Upload

```bash
cd apps/attractap-firmware
pio run -e attractap-p4
pio run -e attractap-p4 -t upload
```

User must be in `dialout` for serial: `sudo usermod -a -G dialout $USER`

---

## Files

| File | Purpose |
|------|---------|
| `platformio.ini` | `[env:attractap-p4]` + build_src_filter |
| `src/main_p4.cpp` | **POC** – alternate main (replaces main.cpp) |
| `src/display/display_p4.cpp` | **POC** – alternate display (replaces display.cpp) |
| `include/display_p4.hpp` | **POC** – P4 display header |
| `src/display/driver/p4_dsi/` | **Reusable** – DSI + GT911 driver (to merge into full app) |
| `lib/GFX Library for Arduino/.../Arduino_ESP32SPIDMA.cpp` | ESP32-P4 SPI fix |
| `tools/patch_esp32p4_toolchain.py` | RISC-V toolchain patch |

**Actual application code** (excluded in POC): `main.cpp`, `display.cpp`, `application/`, `api/`, `network/`, `nfc/`, most screens.
