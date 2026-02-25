# Attractap P4 – Guition JC1060P470

Target: **Guition JC1060P470** 7" 1024×600 DSI touchscreen (ESP32-P4 + C6 coprocessor)  
Ref: [Reddit thread](https://www.reddit.com/r/homeassistant/s/7yXRVO9815), [esphome-lvgl guition-esp32-p4-jc1060p470](https://github.com/jtenniswood/esphome-lvgl/tree/main/guition-esp32-p4-jc1060p470)

---

## Status

**Serial:** Working (ARDUINO_USB_MODE=1 → HWCDCSerial)  
**Display:** ✅ Working  
**Touch:** GT911 OK  
**WiFi:** ✅ ESP-Hosted init added (Phase 5); verify scan/connect on hardware  
**WebSocket:** ✅ Phase 6 – native P4 implementation (WiFiClient/WiFiClientSecure + RFC 6455)

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

**ESP-Hosted (P4↔C6 SDIO):** CMD=19, CLK=18, D0=14, D1=15, D2=16, D3=17, Reset=54

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

## Troubleshooting: Watchdog Reset Loop

If the device boots into a loop with `invalid header: 0xcc5c8fd5` and `rst:0x7 (HP_SYS_HP_WDT_RESET)`:

### Root cause: wrong flash addresses with manual esptool

**Do not use esptool directly for ESP32-P4.** Use PlatformIO upload:

```bash
pio run -e attractap-p4 -t upload
```

For ESP32-P4, the bootloader must be at **0x2000** (not 0x0). Manual `esptool write_flash 0x0 bootloader.bin ...` writes to the wrong address and causes `invalid header: 0xcc5c8fd5` / watchdog reset loop. PlatformIO uses the correct offsets (bootloader 0x2000, partitions 0x8000, app 0x10000).

---

## Files

| File | Purpose |
|------|---------|
| `platformio.ini` | `[env:attractap-p4]` |
| `src/main_p4.cpp` | P4 entry point |
| `src/display/display_p4.cpp` | P4 display + boot screen |
| `src/display/driver/p4_dsi/p4_dsi_gt911_driver.cpp` | DSI + GT911 |
| `include/display_p4.hpp` | P4 display header |
| `lib/GFX Library for Arduino/.../Arduino_ESP32SPIDMA.cpp` | ESP32-P4 SPI fix |
| `tools/patch_esp32p4_toolchain.py` | RISC-V toolchain patch |
