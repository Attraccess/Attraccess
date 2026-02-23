# P4 Display Support Merge Plan

Implementation plan for merging ESP32-P4 + Guition JC1060P470 display support into the main Attractap application. This document is intended for a future developer or agent to execute the merge without prior context.

---

## Overview

### Current State

- **POC (Proof of Concept):** Display and touch work on ESP32-P4 with Guition JC1060P470 7" 1024×600 DSI touchscreen.
- **POC uses alternate files:** `main_p4.cpp`, `display_p4.cpp`, `display_p4.hpp` instead of `main.cpp`, `display.cpp`, `display.hpp`.
- **POC excludes most application:** `application/`, `api/`, `network/`, `nfc/`, `settings/`, `state/`, `websocket/`, `serial/`, `ioexpander/`, and most screens.
- **Build filter** in `platformio.ini` [env:attractap-p4] explicitly excludes these and includes the P4 alternates.

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
