# Follow-up: Merge P4 POC into Full Attractap Application

**Copy everything below the line into a new agent chat to merge the ESP32-P4 display POC into the main application.**

---

## Context

The Attractap firmware has a working **POC (proof of concept)** for the ESP32-P4 + Guition JC1060P470 7" DSI touchscreen. Display and touch work, but the POC uses **alternate files** (`main_p4.cpp`, `display_p4.cpp`, `display_p4.hpp`) and excludes most of the full application (application/, api/, network/, nfc/, most screens).

**Read these files first:**
- `apps/attractap-firmware/attractap-p4-findings.md` – POC status, working config, hardware pins, what’s excluded
- `apps/attractap-firmware/platformio.ini` – `[env:attractap-p4]` section and its `build_src_filter`

## Task

Merge the P4 display support into the main application in a **maintainable** way so that:

1. **Single codebase** – No duplicate `main_p4.cpp` / `display_p4.cpp`. Use `main.cpp` and `display.cpp` with `#if` / build flags to select P4 vs other targets.
2. **P4 DSI driver** – Keep `src/display/driver/p4_dsi/` and wire it into the unified display layer when `DISPLAY_DRIVER_P4_DSI` is defined.
3. **Full app on P4** – Re-enable `application/`, `api/`, `network/`, `nfc/`, and all screens for the attractap-p4 env. Resolve any P4-specific build/runtime issues (e.g. network stack, NFC if used).
4. **Other targets unchanged** – `attractap-touch`, `attractap-touch-ethernet`, etc. must still build and behave as before.

## Requirements

- Use build flags (e.g. `DISPLAY_DRIVER_P4_DSI`, `CONFIG_IDF_TARGET_ESP32P4`) to conditionally compile P4 code.
- Keep the Arduino_ESP32SPIDMA.cpp fix and `tools/patch_esp32p4_toolchain.py` for P4 builds.
- Preserve the working P4 config: reset GPIO05, backlight GPIO23 PWM active-high, hsync 20, etc. (see findings doc).

## Deliverables

1. **Code changes** – Unified main/display with P4 support, updated platformio build_src_filter for attractap-p4.
2. **Documentation** – Create or update a doc (e.g. `apps/attractap-firmware/docs/P4_SETUP.md` or section in README) that covers:
   - **Hardware setup** – What to connect and where (USB, power, etc.)
   - **Pin reference** – Table of all pins used on the Guition JC1060P470 (display reset, backlight, I2C for touch, etc.)
   - **Build & upload** – Commands to build and flash the P4 firmware
   - **Post-flash steps** – Any user actions after flashing (e.g. connecting to WiFi, pairing with Attraccess backend, configuring C6 for connectivity if applicable)
   - **Troubleshooting** – Serial port, dialout group, what to check if display stays dark

The next person (or agent) should be able to pick up a Guition board, follow the doc, and get the full Attractap app running without prior context from this conversation.
