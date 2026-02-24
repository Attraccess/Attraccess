# P4 Merge Plan – Handoff for Next Phase

**Last updated:** After Phase 3 completion  
**Next phase:** Phase 4 – Remove P4 Alternate Files and Document

---

## Phase 3 Status: COMPLETE

Phase 3 has been implemented.

### What Was Done

1. **`platformio.ini`** – [env:attractap-p4]:
   - Added `ATTACTAP_P4_FULL_APP=1` to build_flags
   - Removed exclusions for application/, api/, network/, nfc/, state/, settings/, websocket/, serial/, certs/, and all display screens
   - Switched from display_p4.cpp to display.cpp (excluded display_p4.cpp)
   - Added lib_deps: bblanchon/ArduinoJson@^7.4.2, arduino-libraries/Arduino_CRC32@^1.0.0
   - Kept exclusions: -<display/driver/qualia/>, -<display/driver/gt911/>, -<display/images/>, -<ioexpander/>

2. **`src/main.cpp`** – No changes needed; full-app branch uses Application which includes display/display.hpp

3. **Websocket P4 stub** – esp_websocket_client.h not available on ESP32-P4 platform:
   - `src/websocket/websocket.hpp`: Added CONFIG_IDF_TARGET_ESP32P4 stub types (esp_websocket_event_data_t, esp_websocket_client_handle_t)
   - `src/websocket/websocket.cpp`: P4 stub – setup/loop/connectWebSocket/sendMessage/disableConnectionAttempts skip real websocket; event handler excluded
   - `src/websocket/certManager/AdaptiveCertManager.hpp`: Removed unused esp_websocket_client.h include

4. **NFC P4 stub** – mbedtls/NTAG424 incompatible with P4 framework:
   - `src/nfc/nfc_p4_stub.hpp`, `src/nfc/nfc_p4_stub.cpp`: Stub NFC class; Application uses stub when CONFIG_IDF_TARGET_ESP32P4
   - Excluded real NFC (mbedtlscmac, Adafruit_PN532_NTAG424, nfc.cpp) from P4 build

5. **Ethernet excluded** – ETH_W5500_DEFAULT_CONFIG API differs on P4; P4 has no Ethernet:
   - `src/network/network.hpp/cpp`: #if !defined(CONFIG_IDF_TARGET_ESP32P4) around Ethernet
   - `build_src_filter`: -<network/ethernet/>

6. **Build fixes** – PIN_PN532_IRQ, PIN_ETH_*, esp_app_format.h for api.cpp; esptool: `~/.platformio/penv/bin/pip install --force-reinstall esptool` if ModuleNotFoundError

### Verification (Phase 3 – completed)

| Step | Result |
|------|--------|
| Build | `pio run -e attractap-p4` – SUCCESS |
| Upload | `pio run -e attractap-p4 -t upload` – SUCCESS (ESP32-P4 on /dev/ttyACM0) |
| Serial | Python script, 115200 baud, 30s capture – boot sequence captured |
| Camera | `./scripts/snapshot.sh` – ConnectionConfigurationScreen (WLAN tab) visible |

**Boot sequence observed:**

```
[Main] INFO: Welcome to Attractap
[Main] INFO: Firmware: Attractap P4, Variant: Display, Version: 1.2.1
[Settings] INFO: Setting up...
[Network] INFO: Starting WiFi interface
[WiFi] ERROR: Failed to initialize WiFi: ESP_FAIL  (ESP-Hosted/C6 link not up)
[Display] INFO: GT911 touch init OK
[Display] INFO: Transitioning to screen: BootScreen
[NFC] INFO: NFC stub (ESP32-P4): no NFC hardware support
[Websocket] INFO: WebSocket: ESP32-P4 stub (esp_websocket_client not available)
[Application] DEBUG: Connection is not configured, showing connection configuration screen
[Display] INFO: Transitioning to screen: ConnectionConfigurationScreen
```

**Visual:** BootScreen → ConnectionConfigurationScreen. WLAN tab shows "Keine Netzwerke gefunden" (WiFi scan fails; ESP-Hosted not initialized). No crashes in 30s run.

**Known limitation:** WiFi fails with `H_API: Transport not initialized, call esp_hosted_init() first` – P4 uses C6 coprocessor for WiFi (ESP-Hosted); link init may need board-specific setup.

---

## Phase 2 Status: COMPLETE

Phase 2 has been implemented.

### What Was Done

1. **`src/main.cpp`** – Added conditional minimal mode:
   - When `DISPLAY_DRIVER_P4_DSI` is defined and `ATTACTAP_P4_FULL_APP` is not set: minimal flow (Wire init, `Display::setup()`, `Display::loop()`) using `display_p4.hpp`
   - Else: full application flow (unchanged)

2. **`platformio.ini`** – [env:attractap-p4] `build_src_filter`:
   - Removed `-<main.cpp>`
   - Added `-<main_p4.cpp>`

P4 now uses `main.cpp` instead of `main_p4.cpp`. The minimal branch matches the former `main_p4.cpp` behavior.

### Verification Steps

1. **Build:** `pio run -e attractap-p4` (and attractap-touch, attractap-touch-ethernet)
2. **Flash:** `pio run -e attractap-p4 -t upload`
3. **Serial:** Use Python script from "How to Get Serial Logs" below; expect same boot sequence as Phase 1
4. **Visual:** BootScreen should show "Attraccess" and "Attractap P4 v1.2.1"; touch should work
5. **Snapshot:** `./scripts/snapshot.sh` if available

### Verification Results (Phase 2)

- **Build:** All three envs build successfully
- **Upload:** Verified on ESP32-P4 (USB-Serial-JTAG on /dev/ttyACM0)
- **Serial:** Boot sequence matches expected output; main.cpp minimal branch confirmed
- **Display:** BootScreen shows black background with "Attraccess" and version in white (centered) – expected
- **Stuck on BootScreen:** Expected. Minimal build excludes Application and all other screens; BootScreen is the only screen. Phase 3 will re-enable full app flow.

---

## Phase 1 Status: COMPLETE

Phase 1 has been implemented and verified.

### What Was Done

1. **`src/display/display.cpp`** – Added P4 driver branch:
   - `#if defined(DISPLAY_DRIVER_P4_DSI)` include of `driver/p4_dsi/p4_dsi_gt911_driver.hpp`
   - `#elif defined(DISPLAY_DRIVER_P4_DSI)` instantiation of `P4DsiGt911Driver` in `Display::setup()`

2. **`platformio.ini`** – Added exclusions for non-P4 envs (fixes linker errors):
   - `attractap-touch`: `-<main_p4.cpp> -<display/display_p4.cpp>`
   - `attractap-touch-ethernet`: same exclusions

### Build Verification

All three environments build successfully:

```bash
cd apps/attractap-firmware
pio run -e attractap-touch
pio run -e attractap-touch-ethernet
pio run -e attractap-p4
```

If P4 build fails with toolchain errors, run `pio pkg update` and retry.

### Hardware Verification

- **Upload:** `pio run -e attractap-p4 -t upload`
- **Display:** BootScreen shows "Attraccess" and "Attractap P4 v1.2.1" (verified via camera snapshot)
- **Serial:** Stable boot; no crashes observed (see below)

---

## Stability: 5-Minute Run

A 5-minute serial capture was run after a DTR reset. **No crashes.**

| Metric | Result |
|--------|--------|
| Duration | 5 minutes |
| Crashes/restarts | 0 |
| Last log activity | ~1 s into run (boot complete) |
| Behavior | Boot completes, BootScreen displayed, device idle |

**Boot sequence observed:**

```
[Main] INFO: Attractap P4 - Display+Touch only
[Main] INFO: Firmware: Attractap P4, Variant: Display, Version: 1.2.1
[Main] INFO: Initializing display...
[Display] INFO: Initializing
[Display] INFO: GT911 touch init OK
[Display] INFO: Transitioning to screen: BootScreen
[Display] INFO: Setup done
[Main] INFO: Setup done
```

After that, no further logs (expected for P4 POC – display+touch only, no application loops that log).

---

## Verification Process

1. **Build:** `pio run -e attractap-p4`  
   - If toolchain error (`cc1plus` or `riscv32-esp-elf-g++: not found`): run `pio pkg update`; or `rm -rf ~/.platformio/packages/toolchain-riscv32-esp*` and rebuild.  
   - If `ModuleNotFoundError: esptool`: `~/.platformio/penv/bin/pip install --force-reinstall esptool`

2. **Upload:** `pio run -e attractap-p4 -t upload`  
   - Device typically on `/dev/ttyACM0` (USB-Serial-JTAG)

3. **Serial capture:** Use Python script below (115200 baud). DTR reset triggers fresh boot. Capture 30–60s to see boot + Application flow.

4. **Camera snapshot:** `./scripts/snapshot.sh` from workspace root. Output: `/tmp/camera-snapshot.XXXXXX/frame.png`. Expect ConnectionConfigurationScreen (WLAN tab) after BootScreen.

---

## How to Get Serial Logs

### Option 1: Python script (recommended)

`pio device monitor` can fail with `termios.error` in non-interactive environments. Use Python instead:

```python
import serial
import serial.tools.list_ports
import time

# Find ports
ports = [p.device for p in serial.tools.list_ports.comports() 
         if 'ttyACM' in p.device or 'ttyUSB' in p.device]

# Open and capture (115200 baud for this project)
for port in ports:
    ser = serial.Serial(port, 115200, timeout=0.1)
    # Optional: DTR reset to trigger fresh boot
    ser.dtr = False
    time.sleep(0.05)
    ser.dtr = True
    time.sleep(0.1)
    ser.dtr = False
    time.sleep(0.5)
    # Read for N seconds
    deadline = time.time() + 60
    while time.time() < deadline:
        if ser.in_waiting:
            print(ser.read(ser.in_waiting).decode('utf-8', errors='replace'), end='')
        time.sleep(0.02)
    ser.close()
```

**Note:** After a DTR reset, the device may re-enumerate (e.g. `/dev/ttyACM0` → `/dev/ttyACM1`). Use `serial.tools.list_ports.comports()` to discover the current port.

### Option 2: Full capture script

```bash
cd /path/to/workspace
python3 << 'EOF'
import serial, serial.tools.list_ports, time, os
ports = [p.device for p in serial.tools.list_ports.comports() 
         if 'ttyACM' in p.device or 'ttyUSB' in p.device]
for path in ['/dev/ttyACM0', '/dev/ttyACM1', '/dev/ttyUSB0']:
    if os.path.exists(path) and path not in ports:
        ports.append(path)
ports = sorted(set(ports))
handles = [(p, serial.Serial(p, 115200, timeout=0.1)) for p in ports if True]
for p, s in handles:
    s.dtr = False; time.sleep(0.05)
    s.dtr = True; time.sleep(0.1)
    s.dtr = False
time.sleep(1)
deadline = time.time() + 300  # 5 min
logs = {p: [] for p, _ in handles}
while time.time() < deadline:
    for p, s in handles:
        try:
            if s.in_waiting:
                logs[p].append(s.read(s.in_waiting).decode('utf-8', errors='replace'))
        except: pass
    time.sleep(0.02)
for p, s in handles: s.close()
os.makedirs('/tmp/serial-capture', exist_ok=True)
for p, chunks in logs.items():
    with open(f'/tmp/serial-capture/{p.replace("/","_")}.log', 'w') as f:
        f.write(''.join(chunks))
print('Logs in /tmp/serial-capture')
EOF
```

### Camera snapshot (visual verification)

```bash
./scripts/snapshot.sh
# Output: /tmp/camera-snapshot.XXXXXX/frame.png
```

---

## Current State for Phase 4

- **P4 build uses:** `main.cpp` (full-app branch), `display.cpp` (unified; excludes `display_p4.cpp`)
- **P4 shows:** Full Attractap flow – BootScreen → Init/ConnectionConfig/Lockscreen; websocket stub (no real connection on P4)
- **`display.cpp`:** Contains P4 driver branch; used for full app
- **`main_p4.cpp`:** Still present but excluded; will be deleted in Phase 4

---

## References

- Merge plan: `docs/P4_MERGE_PLAN.md`
- P4 findings: `attractap-p4-findings.md`
- PlatformIO P4 env: `platformio.ini` [env:attractap-p4]
