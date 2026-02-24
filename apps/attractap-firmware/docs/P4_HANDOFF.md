# P4 Merge Plan – Handoff for Next Phase

**Last updated:** After Phase 2 completion  
**Next phase:** Phase 3 – Re-enable Full Application for P4

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

## Current State for Phase 3

- **P4 build uses:** `main.cpp` (minimal branch), `display_p4.cpp` (excludes `main_p4.cpp`, `display.cpp`)
- **P4 shows:** BootScreen only; display and touch work
- **`display.cpp`:** Contains P4 driver branch (ready for Phase 3 display unification)
- **`main_p4.cpp`:** Still present but excluded from P4 build; will be deleted in Phase 4

---

## References

- Merge plan: `docs/P4_MERGE_PLAN.md`
- P4 findings: `attractap-p4-findings.md`
- PlatformIO P4 env: `platformio.ini` [env:attractap-p4]
