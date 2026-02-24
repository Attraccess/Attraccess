# Attractap P4 – Guition JC1060P470

Target: **Guition JC1060P470** 7" 1024×600 DSI touchscreen (ESP32-P4 + C6 coprocessor)  
Ref: [Reddit thread](https://www.reddit.com/r/homeassistant/s/7yXRVO9815), [esphome-lvgl guition-esp32-p4-jc1060p470](https://github.com/jtenniswood/esphome-lvgl/tree/main/guition-esp32-p4-jc1060p470)

---

## Status: Full Application (Phase 4 complete)

**POC is now the full app.** Full Attractap flow runs on P4: BootScreen → ConnectionConfigurationScreen. Display and touch work. Websocket and NFC use stubs (no real connection/card detection). Ethernet excluded. WiFi init fails (ESP-Hosted/C6 link not up – see Known limitations). P4 alternate files (`main_p4.cpp`, `display_p4.cpp`, `display_p4.hpp`) have been removed; P4 uses unified `main.cpp` and `display.cpp`.

| Component | Status |
|-----------|--------|
| Display | ✅ Working (DSI, GT911 touch) |
| Application flow | ✅ BootScreen → ConnectionConfigurationScreen |
| Websocket | Stub (esp_websocket_client not available on P4) |
| NFC | Stub (mbedtls/NTAG424 incompatible with P4) |
| Ethernet | Excluded (no Ethernet on P4) |
| WiFi | ❌ Fails – ESP-Hosted transport not initialized |

---

## Current State

**Serial:** Working (ARDUINO_USB_MODE=1 → HWCDCSerial)  
**Display:** ✅ Working  
**Touch:** GT911 OK

**Known limitations:**
- **WiFi:** `E (2150) H_API: Transport not initialized, call esp_hosted_init() first` – P4 uses C6 coprocessor for WiFi (ESP-Hosted). The ESP-Hosted link is not up; WiFi init and scan fail. May require board-specific C6/ESP-Hosted initialization.
- **Websocket:** Stub only – no real connection on P4.
- **NFC:** Stub only – no card detection on P4.

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

**Display rotation:** User requested portrait mode. Screen and touch rotated +90° (rotation 1) in `p4_dsi_gt911_driver.cpp`. Logical resolution 600×1024. Verified via flash and camera snapshot.

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
6. **Portrait rotation** – User requested -90° for portrait use. Set rotation 1 (+90°) in `p4_dsi_gt911_driver.cpp`; touch mapping in `readTouch()` handles rotation. Verified with camera snapshot.

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
| `src/main.cpp` | Full app entry (ATTACTAP_P4_FULL_APP=1) |
| `src/display/display.cpp` | Unified display (P4 driver branch) |
| `src/display/driver/p4_dsi/` | DSI + GT911 driver |
| `src/nfc/nfc_p4_stub.hpp/cpp` | NFC stub for P4 |
| `src/websocket/websocket.cpp` | Websocket stub (P4 branch) |
| `lib/GFX Library for Arduino/.../Arduino_ESP32SPIDMA.cpp` | ESP32-P4 SPI fix |
| `tools/patch_esp32p4_toolchain.py` | RISC-V toolchain patch |
| `docs/P4_SETUP.md` | P4 setup guide (build, upload, serial, toolchain) |

---

## Process (Phase 3)

1. **Platformio.ini** – Set `ATTACTAP_P4_FULL_APP=1`, updated `build_src_filter` to include full app sources, exclude Ethernet/NFC, use `display.cpp` instead of `display_p4.cpp`.
2. **Websocket stub** – `esp_websocket_client` not available on P4; added stub types and conditional compilation in `websocket.hpp/cpp`.
3. **NFC stub** – mbedtls/NTAG424 incompatible; added `nfc_p4_stub.hpp/cpp`, conditional include in `application.hpp`.
4. **Ethernet** – Wrapped in `#if !defined(CONFIG_IDF_TARGET_ESP32P4)`; excluded `network/ethernet/` from P4 build.
5. **Build fixes** – `esp_app_format.h` for api.hpp; PIN_* defines for P4; esptool reinstall if ModuleNotFoundError.
6. **Toolchain** – `pio pkg update` or remove/reinstall `toolchain-riscv32-esp*` if cc1plus/riscv32-esp-elf-g++ errors.
7. **Verification** – Build, upload, serial capture (Python 115200 baud), camera snapshot (`./scripts/snapshot.sh`).
