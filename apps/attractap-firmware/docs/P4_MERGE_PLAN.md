# P4 Display Support Merge Plan

Implementation plan for merging ESP32-P4 + Guition JC1060P470 display support into the main Attractap application. This document is intended for a future developer or agent to execute the merge without prior context.

**Handoff doc:** See `P4_HANDOFF.md` for current status, serial log instructions, and stability notes.

---

## Overview

### Current State (Phases 1–4 complete)

- **Display and touch:** Working on ESP32-P4 with Guition JC1060P470 7" 1024×600 DSI touchscreen.
- **Full app flow:** BootScreen → ConnectionConfigurationScreen. Uses unified `main.cpp` and `display.cpp`.
- **Stubs:** Websocket, NFC use stubs (no real connection/card detection).
- **WiFi:** Fails – ESP-Hosted/C6 transport not initialized.
- **Ethernet:** Excluded for P4.
- **Follow-up phases (5–8):** WiFi, WebSocket, NFC, Ethernet – see below.

### Phase Summary

| Phase | Scope | Status |
|-------|-------|--------|
| 1 | P4 driver in display.cpp | ✅ Complete |
| 2 | Unify main entry | ✅ Complete |
| 3 | Re-enable full app (stubs) | ✅ Complete |
| 4 | Remove alternate files, document | ✅ Complete |
| 5 | WiFi via ESP-Hosted/C6 | Pending |
| 6 | WebSocket (real connection) | Pending |
| 7 | NFC (required) + error screen on init failure | Pending |
| 8 | Ethernet (optional, if hardware) | Pending |

### Merge Approach

1. **Unify display layer:** Add P4 DSI driver support to `display.cpp` via `DISPLAY_DRIVER_P4_DSI` build flag; remove `display_p4.cpp` and `display_p4.hpp`.
2. **Unify main entry:** Use single `main.cpp` for all targets; remove `main_p4.cpp`. Entry-point differences handled by build flags.
3. **Re-enable full application:** Remove exclusions from P4 `build_src_filter` so `application/`, `api/`, `network/`, `nfc/`, etc. are included.
4. **Resolve dependencies:** Ensure all screens and modules compile and run on P4 (WiFi/Ethernet, NFC, API, etc.).
5. **Document P4 setup:** Create a dedicated P4 setup and hardware doc.

### Working P4 Configuration (Preserve)

| Parameter        | Value |
|------------------|-------|
| Display reset    | GPIO05 |
| Backlight        | GPIO23, PWM, **active-high** |
| HSYNC pulse      | 20 |
| DSI lane rate    | 750 Mbps |
| Prefer speed     | 48 MHz |
| Build flag       | `P4_LCD_BL_ACTIVE_HIGH=1` |

**Hardware pins (Guition JC1060P470):** I2C SDA=7, SCL=8; Touch reset=22, int=21; Display reset=5; Backlight=23.

**Key files:** `attractap-p4-findings.md`, `platformio.ini` [env:attractap-p4], `src/display/driver/p4_dsi/`, `tools/patch_esp32p4_toolchain.py`.

---

## Phase 1: Add P4 Driver Branch to display.cpp

### Scope

- **In scope:** Add `DISPLAY_DRIVER_P4_DSI` branch to `display.cpp` for driver include and instantiation. P4 build continues to use `display_p4.cpp`; no build_src_filter changes.
- **Out of scope:** Switching P4 to use `display.cpp`, changing `main.cpp`, re-enabling excluded modules.

### Deliverables

1. **`src/display/display.cpp`** – Add after existing driver includes (around line 8):
   ```cpp
   #if defined(DISPLAY_DRIVER_P4_DSI)
   #include "driver/p4_dsi/p4_dsi_gt911_driver.hpp"
   #endif
   ```
   And in `Display::setup()` (around line 124), add before `#else`:
   ```cpp
   #elif defined(DISPLAY_DRIVER_P4_DSI)
       Display::driver = new P4DsiGt911Driver(Display::logger);
   ```

### Test Requirements

- `pio run -e attractap-touch` – builds successfully
- `pio run -e attractap-touch-ethernet` – builds successfully
- `pio run -e attractap-p4` – builds successfully (still uses display_p4.cpp)

### Acceptance Criteria

- All three envs build without errors
- No functional change to P4 POC behavior
- `display.cpp` contains P4 driver code path (ready for Phase 3)

---

## Phase 2: Unify Main Entry Point

### Scope

- **In scope:** Modify `main.cpp` to support a minimal mode when `DISPLAY_DRIVER_P4_DSI` is defined and the full Application is excluded. In minimal mode, `main.cpp` performs Wire init, `Display::setup()`, and `Display::loop()` (same as `main_p4.cpp`). Update `platformio.ini` [env:attractap-p4] to use `main.cpp` instead of `main_p4.cpp`.
- **Out of scope:** Re-enabling Application or other excluded modules.

### Dependencies

- Phase 1 complete

### Deliverables

1. **`src/main.cpp`** – Wrap Application usage in a conditional. When `DISPLAY_DRIVER_P4_DSI` is defined and Application-related code is excluded (or when a new flag `ATTACTAP_P4_FULL_APP` is not set), use minimal flow:
   ```cpp
   #if defined(DISPLAY_DRIVER_P4_DSI) && !defined(ATTACTAP_P4_FULL_APP)
   // Minimal P4: display+touch only (no Application)
   #include "display_p4.hpp"  // or display.hpp if Display is unified
   void setup() { ... Wire, Display::setup(); }
   void loop() { Display::loop(); }
   #else
   // Full application
   #include "application/application.hpp"
   Application application;
   ...
   #endif
   ```
   Note: If `display.hpp` pulls in `state` and screens, keep `#include "display_p4.hpp"` for minimal mode until Phase 3. The P4 build excludes Application, so the `#else` branch will not be compiled.
2. **`platformio.ini`** – In [env:attractap-p4] `build_src_filter`:
   - Remove `-<main.cpp>`
   - Add `-<main_p4.cpp>`

### Test Requirements

- `pio run -e attractap-p4` – builds successfully
- Flash and run on P4 hardware – BootScreen appears, touch works (same as current POC)
- `pio run -e attractap-touch` and `attractap-touch-ethernet` – still build and run

### Acceptance Criteria

- P4 build uses `main.cpp`; `main_p4.cpp` is excluded
- P4 device shows BootScreen and responds to touch
- Other envs unchanged

---

## Phase 3: Re-enable Full Application for P4

### Scope

- **In scope:** Re-enable `application/`, `api/`, `network/`, `nfc/`, `state/`, `settings/`, `websocket/`, `serial/`, `certs/`, `ioexpander/` (or exclude if P4 has no hardware), and all display screens in [env:attractap-p4] `build_src_filter`. Switch from `display_p4.cpp` to `display.cpp`. Add missing lib_deps (ArduinoJson, Arduino_CRC32). Resolve compile and link errors. Add `ATTACTAP_P4_FULL_APP=1` so `main.cpp` uses Application.
- **Out of scope:** NFC hardware support on P4 (if hardware differs); ioexpander (exclude if not present).

### Dependencies

- Phase 1 and Phase 2 complete

### Deliverables

1. **`platformio.ini`** – [env:attractap-p4]:
   - Set `ATTACTAP_P4_FULL_APP=1` in build_flags
   - Remove exclusions: `-<application/>`, `-<api/>`, `-<network/>`, `-<nfc/>`, `-<state/>`, `-<settings/>`, `-<websocket/>`, `-<serial/>`, `-<certs/>`, and all `-<display/screens/...>`, `-<display/shared/>`
   - Remove `-<display/display.cpp>` and add `-<display/display_p4.cpp>` (switch to unified display)
   - Add `lib_deps`: `bblanchon/ArduinoJson@^7.4.2`, `arduino-libraries/Arduino_CRC32@^1.0.0`
   - Keep `-<display/driver/qualia/>`, `-<display/driver/gt911/>`, `-<display/images/>` (or include images if needed)
   - Evaluate `ioexpander/`: exclude if P4 hardware has no TCA9554
2. **`src/main.cpp`** – Ensure `#include "display/display.hpp"` (or correct path) when `ATTACTAP_P4_FULL_APP` is set; remove `display_p4.hpp` from minimal branch if no longer needed
3. **Resolve build errors** – Address any P4-specific compile issues (e.g. `pre:tools/build_adaptive_certs_wrapper.py` may need P4 handling; NFC/network code may need `#ifdef` for ESP32-P4)

### Test Requirements

- `pio run -e attractap-p4` – builds successfully
- Flash and run – full application starts: BootScreen → Init/ConnectionConfig/Lockscreen/etc. as applicable
- WiFi/network and API connectivity (if hardware supports)
- NFC (if hardware present)

### Acceptance Criteria

- Full Attractap application builds for P4
- Device boots to full UI flow
- No regressions in attractap-touch or attractap-touch-ethernet builds

---

## Phase 4: Remove P4 Alternate Files and Document

### Scope

- **In scope:** Delete `main_p4.cpp`, `display_p4.cpp`, `display_p4.hpp`. Create P4 setup documentation. Update `attractap-p4-findings.md`.
- **Out of scope:** Changing application logic or driver code.

### Dependencies

- Phase 3 complete and validated

### Deliverables

1. **Delete files:**
   - `src/main_p4.cpp`
   - `src/display/display_p4.cpp`
   - `include/display_p4.hpp`
2. **`docs/P4_SETUP.md`** (or similar) – P4-specific setup guide:
   - Hardware: Guition JC1060P470 pinout, wiring
   - Build: `pio run -e attractap-p4`
   - Upload: `pio run -e attractap-p4 -t upload`
   - Serial: `ARDUINO_USB_MODE=1` for USB-Serial-JTAG; `dialout` group
   - Working config table (reset GPIO05, backlight GPIO23 active-high, hsync 20, etc.)
3. **`attractap-p4-findings.md`** – Update to reflect merged state: POC is now full app; remove "Next step" merge note; keep hardware/config reference

### Test Requirements

- `pio run -e attractap-p4` – still builds after file deletion
- All envs build

### Acceptance Criteria

- No P4-specific alternate source files remain
- P4 setup is documented for future developers
- Findings doc is current

---

## Phase 5: WiFi via ESP-Hosted (C6 Coprocessor)

### Scope

- **In scope:** Initialize ESP-Hosted transport so P4 can use the C6 coprocessor for WiFi. Call `esp_hosted_init()` before WiFi init. Configure transport (SPI/UART) for P4↔C6 link. Enable WiFi scan, connect, and network connectivity.
- **Out of scope:** Ethernet; boards without C6.

### Dependencies

- Phase 4 complete

### Background

P4 uses C6 coprocessor for WiFi. Current error: `H_API: Transport not initialized, call esp_hosted_init() first`. The ESP-Hosted component (`espressif__esp_hosted`) is present but the transport (SPI or UART between P4 and C6) is not initialized. Guition JC1060P470 has P4+C6; C6 handles WiFi.

### Deliverables

1. **ESP-Hosted init** – Add `esp_hosted_init()` (or equivalent) before `Network::setup()` or `Wifi::setup()`. Determine correct transport config (SPI vs UART) for Guition board from board schematic, ESP-Hosted docs, or Espressif examples.
2. **Transport config** – Pin assignments, clock speed, and transport type for P4↔C6. May require `sdkconfig` or runtime config.
3. **`docs/P4_SETUP.md`** – Document ESP-Hosted init, transport pins, and any board-specific steps.

### Test Requirements

- `pio run -e attractap-p4 -t upload`
- WiFi scan lists networks
- WiFi connect succeeds with valid credentials
- Device obtains IP and can reach network

### Acceptance Criteria

- WiFi scan works
- WiFi connect works
- No `Transport not initialized` errors
- ConnectionConfigurationScreen can complete WLAN setup

---

## Phase 6: WebSocket (Real Connection)

### Scope

- **In scope:** Replace WebSocket stub with real WebSocket connection on P4. Use `esp_websocket_client` if available in P4 framework, or alternative (e.g. `libwebsockets`, raw TCP with WebSocket framing, or platform-specific API).
- **Out of scope:** Changing API protocol; NFC.

### Dependencies

- Phase 5 complete (WiFi must work for WebSocket)

### Background

Current: `esp_websocket_client` not available on P4; stub in `websocket.cpp`. Check if pioarduino/ESP-IDF 5.5+ adds WebSocket support for P4. If not, evaluate alternatives.

### Deliverables

1. **WebSocket implementation** – Remove stub; implement `connectWebSocket`, `sendMessage`, event handling using P4-compatible API.
2. **`websocket.hpp/cpp`** – Remove `CONFIG_IDF_TARGET_ESP32P4` stub branch; use real implementation.
3. **TLS/certs** – Ensure `AdaptiveCertManager` and TLS work on P4 for wss://.

### Test Requirements

- Device connects to configured API host via WebSocket
- Send/receive messages
- Reconnect on disconnect
- No stub logs

### Acceptance Criteria

- WebSocket connects when WiFi is up and API host is configured
- API communication works (state sync, commands)
- Lockscreen and other API-dependent screens function

---

## Phase 7: NFC (Card Detection and NTAG424)

### Scope

- **In scope:** Replace NFC stub with real NFC on P4. NFC is a core requirement for all targets. Resolve mbedtls/NTAG424 compatibility. Support card detection, authentication, enrollment. When NFC hardware is not found or not connected, display error/warning screen with Reboot and Retry buttons instead of silently stubbing.
- **Out of scope:** Making NFC optional; silent stub fallback.

### Dependencies

- Phase 6 complete (API needed for enrollment flow)

### Background

Current: `nfc_p4_stub` – mbedtls/NTAG424 libs incompatible with P4. NFC is the core Attractap feature; all targets must support it. Options: (a) port or replace mbedtls for P4, (b) use P4-compatible NTAG424 implementation, (c) use different NFC stack. PN532 over I2C/SPI; pins TBD per board. When hardware init fails (not found, not connected), show user-facing error with recovery actions.

### Deliverables

1. **NFC implementation** – Replace stub with real NFC on P4. Resolve mbedtls/NTAG424 build for P4. Include `nfc.cpp`, `Adafruit_PN532_NTAG424`, `mbedtlscmac` in P4 build.
2. **Error/warning screen** – When NFC hardware is not found or init fails: display a dedicated screen with error message, Reboot button, and Retry button. No silent stub; user must be informed and given recovery options.
3. **`application.hpp`** – Use real `nfc.hpp` for all P4 builds; remove `nfc_p4_stub` conditional.
4. **Build filter** – Remove NFC exclusions for P4; include full NFC stack.

### Test Requirements

- Card tap detected when hardware present
- Card authentication works
- Enrollment flow works (if API configured)
- When NFC hardware absent or disconnected: error screen shown with Reboot/Retry
- Retry re-attempts NFC init; Reboot restarts device

### Acceptance Criteria

- NFC is required and built for all P4 targets
- NFC card detection works on P4 when hardware present
- Full Attractap access-control flow: tap → authenticate → unlock
- Hardware-not-found / init-failure shows error screen with Reboot and Retry buttons

---

## Phase 8: Ethernet (Optional – If Hardware Supports)

### Scope

- **In scope:** Add Ethernet support for P4 boards that have an external PHY (e.g. W5500, LAN8720). Most P4+C6 boards (including Guition JC1060P470) do not have Ethernet; this phase is optional.
- **Out of scope:** Boards without Ethernet hardware; changing WiFi path.

### Dependencies

- Phase 5 complete
- Hardware with Ethernet PHY

### Background

Current: Ethernet excluded for P4 (`#if !defined(CONFIG_IDF_TARGET_ESP32P4)` in `network.hpp`; `-<network/ethernet/>` in build filter). ETH_W5500_DEFAULT_CONFIG API may differ on P4. If a P4 board adds Ethernet, re-enable and fix API compatibility.

### Deliverables

1. **Ethernet on P4** – Remove P4 exclusion; fix `ethernet.cpp` and any ETH_* API differences for P4.
2. **Network selection** – User can choose WiFi or Ethernet in ConnectionConfigurationScreen when both available.
3. **`platformio.ini`** – Remove `-<network/ethernet/>` for P4 when Ethernet enabled; add board-specific env if needed (e.g. `attractap-p4-ethernet`).

### Test Requirements

- Ethernet connect works on P4 board with PHY
- Network selection (WiFi vs Ethernet) works
- API/WebSocket work over Ethernet

### Acceptance Criteria

- Ethernet supported on P4 when hardware present
- No impact on WiFi-only P4 boards

---

## References

| Item | Path |
|------|------|
| POC findings | `apps/attractap-firmware/attractap-p4-findings.md` |
| PlatformIO P4 env | `apps/attractap-firmware/platformio.ini` [env:attractap-p4] |
| P4 DSI driver | `src/display/driver/p4_dsi/p4_dsi_gt911_driver.cpp` |
| Main display | `src/display/display.cpp`, `src/display/display.hpp` |
| Display driver interface | `src/display/driver/display_driver.hpp` |
| P4 toolchain patch | `tools/patch_esp32p4_toolchain.py` |
| GFX P4 fix | `lib/GFX Library for Arduino/.../Arduino_ESP32SPIDMA.cpp` |

### Build Flags (P4)

- `CONFIG_IDF_TARGET_ESP32P4=1`
- `DISPLAY_DRIVER_P4_DSI=1`
- `P4_PANEL_JC1060P470=1`
- `P4_LCD_BL_ACTIVE_HIGH=1`
- `ATTACTAP_P4_FULL_APP=1` (Phase 3+)

---

## Risks and Assumptions

### Risks

1. **NFC hardware:** P4 board may use different NFC pins or no NFC. May need `#ifdef` or separate env for NFC-less P4.
2. **Network:** WiFi/Ethernet on ESP32-P4 may differ. `network/` and `api/` might need P4-specific handling.
3. **Certs/build script:** `tools/build_adaptive_certs_wrapper.py` may assume ESP32-S3; verify P4 compatibility.
4. **Memory:** Full app + LVGL on 1024×600 may stress RAM; monitor and tune buffers if needed.
5. **Library compatibility:** ArduinoJson, Arduino_CRC32, and others must support ESP32-P4 toolchain.

### Assumptions

- Guition JC1060P470 config (GPIO05, GPIO23, hsync 20, etc.) remains correct.
- `tools/patch_esp32p4_toolchain.py` and GFX Library P4 patches stay in place.
- Platform `https://github.com/pioarduino/platform-espressif32.git#develop` continues to support ESP32-P4.
- P4 build uses WiFi (no Ethernet on typical P4+C6 boards unless external PHY).
