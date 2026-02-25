# P4 Phase 6 – WebSocket (Real Connection)

**Date:** 2026-02-25  
**Branch:** 8-inch-touchscreen-attractap

## Summary

Phase 6 replaces the WebSocket stub with a real WebSocket implementation for ESP32-P4. Since `esp_websocket_client` is not available on the P4 Arduino framework, a native implementation using WiFiClient/WiFiClientSecure with RFC 6455 WebSocket framing was added.

## Changes

### WebSocket (P4)
- **`src/websocket/websocket_p4.hpp`** – New P4 WebSocket class: WiFiClient/WiFiClientSecure, RFC 6455 handshake and framing, `esp_websocket_event_data_t`-compatible struct for API.
- **`src/websocket/websocket_p4.cpp`** – Implementation: TCP connect, HTTP upgrade handshake (SHA1/base64), send/receive WebSocket frames (text, binary, ping/pong, close), poll in `loop()`.
- **`src/websocket/websocket.hpp`** – Conditional include: `websocket_p4.hpp` for P4, `esp_websocket_client.h` + class declaration for non-P4.
- **`platformio.ini`** – P4 env: exclude `websocket/websocket.cpp`, use `websocket_p4.cpp` (included via `+<*>`).

### TLS / Certs
- **`AdaptiveCertManager`** – Used for wss:// via `WiFiClientSecure::setCACert()`. Same CA cert iteration and success/failure marking as non-P4 path.

### API Compatibility
- **`esp_websocket_event_data_t`** – P4 struct matches layout: `data_ptr`, `data_len`, `payload_len`, `payload_offset`, `op_code`.
- **Binary callback** – OTA firmware chunks delivered via `binaryDataCallback` with same semantics (fragmentation via `payload_len`/`payload_offset` supported in parser).

## Verification

- **Build:** `pio run -e attractap-p4` – SUCCESS
- **Upload:** `pio run -e attractap-p4 -t upload` – (verify on hardware)
- **Serial:** Run `pio device monitor -e attractap-p4 -b 115200`; expect `Websocket setup (P4 native)` instead of stub message; no "Transport not initialized".
- **Camera:** Boot to ConnectionConfigurationScreen; configure WiFi + API host; when connected, WebSocket should connect and API flow should work.

## Next Steps (Phase 7)

- NFC: Replace stub with real NFC; add error screen (Reboot/Retry) when hardware not found.
