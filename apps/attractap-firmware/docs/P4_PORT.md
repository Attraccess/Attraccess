# ESP32-P4 Port – Attractap Firmware

Single doc for P4 port status, setup, and remaining work. Target: **Guition JC1060P470** 7" 1024×600 DSI (ESP32-P4 + C6).

**Hardware / example firmware:** [Reddit post](https://www.reddit.com/r/homeassistant/s/7yXRVO9815)

---

## Status Summary


| Area            | Status                                               |
| --------------- | ---------------------------------------------------- |
| Display + touch | ✅ Working (DSI, GT911)                               |
| Full app flow   | ✅ main.cpp, display.cpp (unified)                    |
| WiFi            | ✅ ESP-Hosted (C6, SDIO 4-bit)                        |
| WebSocket       | ✅ Native P4 impl (WiFiClientSecure + RFC 6455)       |
| NFC             | ⏳ Stub (mbedtls/NTAG424 incompatible)                |
| Ethernet        | ⏳ Excluded (ETH API differs on P4; hardware present) |


---

## Quick Start

### Build & Upload

```bash
cd apps/attractap-firmware
pio run -e attractap-p4
pio run -e attractap-p4 -t upload
```

### Hardware (Guition JC1060P470)


| Function        | Pin                                   |
| --------------- | ------------------------------------- |
| I2C SDA/SCL     | 7, 8                                  |
| Touch reset/int | 22, 21                                |
| Display reset   | 5                                     |
| Backlight       | 23 (active-high)                      |
| ESP-Hosted SDIO | CMD=19, CLK=18, D0–D3=14–17, Reset=54 |


### Config (preserve)


| Parameter     | Value                     |
| ------------- | ------------------------- |
| Display reset | GPIO05                    |
| Backlight     | GPIO23, PWM, active-high  |
| HSYNC pulse   | 20                        |
| DSI lane rate | 750 Mbps                  |
| Build flag    | `P4_LCD_BL_ACTIVE_HIGH=1` |


**Serial:** USB-Serial-JTAG; add user to `dialout`. `pio device monitor -e attractap-p4 -b 115200` for logs.

**Upload:** Use PlatformIO only. Manual esptool writes bootloader to wrong offset (0x0 vs 0x2000) → watchdog loop.

---

## What’s Done

- **Unified entry:** `main.cpp` for all targets; `main_p4.cpp` excluded (dead code).
- **Unified display:** `display.cpp` with `DISPLAY_DRIVER_P4_DSI` branch; `display_p4.cpp` excluded (dead code).
- **P4 DSI driver:** `src/display/driver/p4_dsi/p4_dsi_gt911_driver.cpp`.
- **WiFi:** `esp_hosted_init()` + `esp_hosted_connect_to_slave()` in `network.cpp` before WiFi; SDIO transport.
- **WebSocket:** `websocket_p4.cpp` (WiFiClientSecure, RFC 6455); `websocket.cpp` excluded for P4.
- **NFC stub:** `nfc_p4_stub.cpp`; real NFC excluded (mbedtlscmac, Adafruit_PN532_NTAG424).
- **Ethernet:** Excluded – board has Ethernet PHY (works in demo firmware); code excluded due to `ETH_W5500_DEFAULT_CONFIG` API differences on P4.
- **Build:** `platformio.ini` [env:attractap-p4]; `sdkconfig.p4.defaults`.

---

## What’s Left

### Phase 7: NFC (required)

**Current:** `nfc_p4_stub` – mbedtls/NTAG424 libs incompatible with P4.

**Goal:** Real NFC on P4; card detection, auth, enrollment. When hardware absent or init fails: error screen with Reboot/Retry Button (no silent stub).

**Plan:**

1. **Resolve mbedtls/NTAG424 on P4:** Port or replace mbedtls; or use P4-compatible NTAG424 impl; or different NFC stack. PN532 over I2C/SPI; pins TBD per board.
2. **Error screen:** Dedicated screen on init failure; message, Reboot/Retry buttons.
3. **Build:** Remove `nfc_p4_stub` conditional in `application.hpp`; include `nfc.cpp`, Adafruit_PN532_NTAG424, mbedtlscmac in P4 build.
4. **Filter:** Remove `-<nfc/nfc.cpp>`, `-<nfc/mbedtlscmac.c>`, `-<nfc/Adafruit_PN532_NTAG424.cpp>` from P4 build_src_filter.

**Acceptance:** Card tap; auth; enrollment; hardware-not-found → error screen with Reboot/Retry Button.

### Phase 8: Ethernet

**Current:** Excluded for P4; `ETH_W5500_DEFAULT_CONFIG` API differs on P4. Board has Ethernet PHY soldered (works in demo firmware).

**Goal:** Re-enable Ethernet on P4; fix API compatibility.

**Plan:**

1. Remove `#if !defined(CONFIG_IDF_TARGET_ESP32P4)` around Ethernet in `network.hpp/cpp`.
2. Remove `-<network/ethernet/>` from P4 build_src_filter.
3. Fix `ethernet.cpp` and `ETH_W5500_DEFAULT_CONFIG` / ETH_* API for P4 (check ESP-IDF P4 docs or demo firmware for correct usage).

---

## Key Files


| Item              | Path                                                      |
| ----------------- | --------------------------------------------------------- |
| P4 env            | `platformio.ini` [env:attractap-p4]                       |
| P4 DSI driver     | `src/display/driver/p4_dsi/p4_dsi_gt911_driver.cpp`       |
| Display (unified) | `src/display/display.cpp`, `display.hpp`                  |
| WebSocket P4      | `src/websocket/websocket_p4.cpp`, `websocket_p4.hpp`      |
| NFC stub          | `src/nfc/nfc_p4_stub.cpp`, `nfc_p4_stub.hpp`              |
| P4 sdkconfig      | `sdkconfig.p4.defaults`                                   |
| GFX P4 fix        | `lib/GFX Library for Arduino/.../Arduino_ESP32SPIDMA.cpp` |
| Toolchain patch   | `tools/patch_esp32p4_toolchain.py`                        |


---

## Build Flags (P4)

- `CONFIG_IDF_TARGET_ESP32P4=1`
- `DISPLAY_DRIVER_P4_DSI=1`
- `P4_PANEL_JC1060P470=1`
- `P4_LCD_BL_ACTIVE_HIGH=1`
- `ATTRACTAP_P4_FULL_APP=1`

---

## Cleanup (optional)

These files exist but are excluded from the P4 build; safe to delete:

- `src/main_p4.cpp`
- `src/display/display_p4.cpp`
- `include/display_p4.hpp`

