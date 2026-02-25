# P4 Continuation – Agent Prompt

**Purpose:** Handoff for an autonomous agent to continue ESP32-P4 (Guition JC1060P470) firmware work. The agent must verify all changes using **camera** (display) and **serial monitor** (logs).

---

## Your Role

You are continuing the P4 merge plan. Work autonomously. After every significant change:

1. **Build** – `pio run -e attractap-p4`
2. **Flash** – `pio run -e attractap-p4 -t upload`
3. **Verify with serial** – Capture boot and runtime logs
4. **Verify with camera** – Capture display state (screens, UI)

Do not consider a task done until verification passes.

---

## Current State

- **Branch:** `8-inch-touchscreen-attractap`
- **Phases 1–5:** Complete
- **Device:** Guition JC1060P470 (ESP32-P4 + C6, 7" 1024×600 DSI touchscreen)
- **Boot flow:** BootScreen → ConnectionConfigurationScreen
- **WiFi:** ESP-Hosted init added; hardware verification pending
- **Stubs:** WebSocket, NFC (no real connection/card detection)

---

## Next Work (in order)

### Phase 6: WebSocket (real connection)

- **Goal:** Replace WebSocket stub with real connection on P4
- **Constraint:** `esp_websocket_client` is not available on P4
- **Options:** `libwebsockets`, raw TCP + WebSocket framing, or other P4-compatible API
- **Files:** `src/websocket/websocket.hpp`, `websocket.cpp`; remove `CONFIG_IDF_TARGET_ESP32P4` stub branches
- **Verification:** Device connects to API host; send/receive messages; reconnect on disconnect

### Phase 7: NFC (required)

- **Goal:** Replace NFC stub with real NFC; add error screen on init failure
- **Constraint:** mbedtls/NTAG424 compatibility issues on P4
- **Deliverables:** Real NFC, error screen with Reboot/Retry when hardware not found
- **Verification:** Card tap detected; auth works; error screen shown when NFC absent

### Phase 8: Ethernet (optional)

- **Goal:** Add Ethernet for P4 boards with PHY (Guition has none; skip if not applicable)

---

## Verification Requirements

### Serial Monitor

```bash
cd apps/attractap-firmware
pio device monitor -e attractap-p4 -b 115200
```

Or use a Python script if the monitor fails in non-interactive mode:

```python
import serial
ser = serial.Serial('/dev/ttyACM0', 115200)
while True:
    print(ser.readline().decode('utf-8', errors='replace'), end='')
```

**Capture and inspect:**
- Boot sequence (Welcome, Network init, ESP-Hosted, WiFi)
- No "Transport not initialized" or similar errors
- No watchdog resets or crashes
- Expected log lines for the feature you implemented

### Camera

- Take a photo of the display after boot
- Confirm correct screen (e.g. ConnectionConfigurationScreen, Lockscreen)
- Confirm UI elements render correctly
- If testing WiFi: show WLAN tab with scan results
- If testing NFC: show card detection or error screen

**Store captures** in `camera-debug/` (or similar) for the session.

---

## Key Paths

| Item | Path |
|------|------|
| PlatformIO P4 env | `platformio.ini` [env:attractap-p4] |
| Merge plan | `docs/P4_MERGE_PLAN.md` |
| Handoff / status | `docs/P4_HANDOFF.md` |
| Setup guide | `docs/P4_SETUP.md` |
| Phase 5 changelog | `docs/CHANGELOG_P4_PHASE5.md` |
| Hardware config | `attractap-p4-findings.md` |

---

## Build & Flash

```bash
cd apps/attractap-firmware
pio run -e attractap-p4
pio run -e attractap-p4 -t upload
```

**Upload:** Use PlatformIO only. Manual esptool with wrong addresses causes boot failure (bootloader at 0x2000).

---

## Autonomy Rules

1. Read `P4_MERGE_PLAN.md` and `P4_HANDOFF.md` before coding
2. Make incremental changes; build and verify often
3. After each phase: build, flash, serial capture, camera capture
4. Update `P4_HANDOFF.md` and `P4_MERGE_PLAN.md` when a phase is complete
5. Document work in a changelog (e.g. `CHANGELOG_P4_PHASE6.md`)
6. Commit and push when a phase is verified

---

## Start Command

Begin with Phase 6 (WebSocket). Research P4-compatible WebSocket options, implement, then verify with serial and camera before moving on.
