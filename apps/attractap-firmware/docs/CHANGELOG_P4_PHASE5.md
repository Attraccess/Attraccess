# P4 Phase 5 – WiFi via ESP-Hosted (Changelog)

**Date:** 2026-02-24  
**Branch:** 8-inch-touchscreen-attractap

## Summary

Phase 5 implements WiFi support for ESP32-P4 (Guition JC1060P470) via ESP-Hosted, using the on-board ESP32-C6 coprocessor over SDIO 4-bit transport.

## Changes

### Network
- **`src/network/network.cpp`** – Added `esp_hosted_init()` and `esp_hosted_connect_to_slave()` before WiFi init (P4 only). 2.5s delay for C6 handshake.
- **`src/network/network.hpp`** – Conditional Ethernet include (excluded for P4).
- **`src/network/network.cpp`** – Conditional Ethernet setup/loop (excluded for P4).

### Dependencies
- **`src/idf_component.yml`** – Added `espressif/esp_hosted` and `espressif/esp_wifi_remote` for target `esp32p4`. *(File is gitignored; see P4_SETUP.md for manual setup.)*

### Platform / Build
- **`platformio.ini`** – P4 env: full app (main.cpp, application, network, api, websocket, nfc). Excluded: main_p4, display_p4, ioexpander, nfc.cpp, mbedtlscmac, Adafruit_PN532_NTAG424, ethernet. Added ArduinoJson, Arduino_CRC32, PIN_ETH_*=–1.

### Display
- **`src/display/display.cpp`** – Added P4 DSI driver branch (`DISPLAY_DRIVER_P4_DSI` → `P4DsiGt911Driver`).

### Application
- **`src/application/application.hpp`** – Conditional NFC: `nfc_p4_stub.hpp` for P4, `nfc.hpp` otherwise.

### WebSocket
- **`src/websocket/websocket.hpp`** – P4 stub types: `esp_websocket_client_handle_t`, `esp_websocket_event_data_t` (no `esp_websocket_client.h` on P4).
- **`src/websocket/websocket.cpp`** – P4 stub: setup/connect/send/disable no-op; event handler excluded.
- **`src/websocket/certManager/AdaptiveCertManager.hpp`** – Conditional `esp_websocket_client.h` include.

### API
- **`src/api/api.cpp`** – Added `#include "esp_app_format.h"` for OTA firmware header validation.

### Documentation
- **`attractap-p4-findings.md`** – WiFi status, ESP-Hosted SDIO pins.
- **`docs/P4_SETUP.md`** – ESP-Hosted section, WiFi troubleshooting, idf_component.yml note.
- **`docs/P4_MERGE_PLAN.md`** – Phase 5 marked complete.
- **`docs/P4_HANDOFF.md`** – Phase 5 status, next phase, verification notes.

## Verification

- **Build:** `pio run -e attractap-p4` – SUCCESS
- **Flash:** `pio run -e attractap-p4 -t upload` – SUCCESS
- **Runtime:** Device boots to ConnectionConfigurationScreen; no crashes observed

## Next Steps (Phase 6)

- WebSocket: real connection on P4 (replace stub with P4-compatible implementation)
