# Code Review — `feat/attractap-waveshare-v4` vs `main`

> Scope: all changes introducing the `attractap-touch-v2` PlatformIO target and adapting the firmware to Waveshare ESP32-S3-Touch-LCD-4 V4 hardware.

---

## 🔴 Critical / Must Fix

### 1. `apps/api/project.json` — Broken build dependency

```diff
-  "dependsOn": [
+  "not_dependsOn": [
```

`not_dependsOn` is **not a valid NX key**. NX silently ignores it, meaning the `build` target no longer waits for `copy-attractap-firmware-into-assets` to finish. This was obviously introduced to skip the slow firmware build during development and was never reverted. The CI/release build will produce an API without the firmware assets bundled.

**Action:** Revert to `dependsOn`.

---

### 2. `main.cpp` — `i2cBusScan()` unconditionally runs on every boot

```cpp
// Scan I2C bus to identify all connected devices
i2cBusScan();
```

This scans all 126 possible I2C addresses on every power-on, adding latency and spamming the serial log. It is purely a debugging utility. There is no compile-time guard, no runtime flag, nothing preventing it from running in production firmware.

**Action:** Remove entirely or wrap in `#ifdef DEBUG` / `#if LOG_LEVEL >= DEBUG`.

---

### 3. `application.cpp` — Boot-time beep is a debug artefact

```cpp
// Hardware validation beep — confirms beeper works through normal code path
this->beeper.singleBeep();
```

A physical beep on every device boot is user-facing behaviour baked in with a comment admitting it is a validation test. This will annoy users and is inconsistent with how the device behaves when there is no IO expander.

**Action:** Remove.

---

### 4. `platformio.ini` — Debug log level hardcoded in production target

```ini
-D LOG_LEVEL=DEBUG
-D LOGGER_LEVEL_NUM=4
```

The `attractap-touch-v2` target ships with `DEBUG` logging. Every `debugf` call — including the touch-poll log that fires every 2 seconds (see §8) — will hit the serial output in production firmware. The `attractap-touch-ethernet` target uses a lower level.

**Action:** Change to the same log level used by the other production targets, or introduce a separate `attractap-touch-v2-debug` env.

---

## 🟠 Major Issues

### 5. Macro name `HAS_IO_EXPANDER_TCA9554` is a lie ✅ Fixed

The macro named `HAS_IO_EXPANDER_TCA9554` now controls initialisation of **two** completely different chips:
- V3: TCA9554 (8-bit, I2C address 0x20)
- V4: XL9555 / PCA9555-compatible (16-bit, I2C address 0x24)

The name implied a specific chip but the behaviour diverges dramatically inside `#ifdef IO_EXPANDER_16BIT` sub-guards.

Renamed to `HAS_IO_EXPANDER` across all files (`platformio.ini`, `application.hpp/cpp`, `beeper.hpp/cpp`, `display.hpp/cpp`, `rgb_gt911_driver.hpp/cpp`). `IO_EXPANDER_16BIT` remains as the chip-variant discriminator.

---

### 6. `ioexpander.cpp` — `setPin()` is port-0 only but is the generic public API ✅ Fixed

On the 16-bit expander (V4), port 1 state (`outputState1`) can only be written via `fullRefresh()`. Documented the limitation with a header comment on `setPin()`. Added a `#ifdef IO_EXPANDER_16BIT` runtime guard that logs a warning and returns early if `bit > 7` is ever passed, preventing silent corruption of the port-0 output state.

---

### 7. `ioexpander.cpp` / `beeperOn()` / `beeperOff()` — CONFIG re-write inside operation methods (SRP violation + band-aid)

```cpp
void IOExpander::beeperOn()
{
#ifdef IO_EXPANDER_16BIT
    writeRegisterReliable(IOEXP_REG_CONFIG, 0x00);  // Re-write config before beep
#endif
    setPin(IOEXP_BIT_BEEPER, true);
}
```

Re-writing the direction config register inside individual pin-toggle methods violates Single Responsibility Principle — the beeper method now owns part of hardware recovery logic. The same re-write is in `beeperOff()` too. The comment admits it is a workaround:

> _"Re-write config register before beep — I2C bus traffic from GT911/NFC can corrupt the IO expander config"_

This is a band-aid for a hardware/wiring problem. The correct fix is in `fullRefresh()` (which also does this), making `beeperOn/Off` partially duplicate it.

**Action:** Centralise the defensive CONFIG re-write into a single `ensureConfigured()` helper called from `fullRefresh()` only. Do not spread it into every operation.

---

### 8. `rgb_gt911_driver.cpp` — Periodic debug touch-poll log in production code

```cpp
static uint32_t lastLog = 0;
if (millis() - lastLog > 2000) {
    lastLog = millis();
    logger.debugf("Touch poll: touched=%d", touched);
}
```

This fires every 2 seconds at `DEBUG` level. Combined with finding §4 (the V2 target uses DEBUG level), this will flood the serial log continuously during normal operation.

**Action:** Remove entirely. If polling diagnostics are needed, do it only in a debug build.

---

### 9. `rgb_gt911_driver.cpp` — SDA/SCL pin numbers hardcoded in driver ✅ Fixed

The values `15` (SDA) and `7` (SCL) were hardcoded in the driver rather than using build-flag defines. The generic `PIN_I2C_SDA` / `PIN_I2C_SCL` defines have been split into two device-specific pairs:

- `PIN_NFC_I2C_SDA` / `PIN_NFC_I2C_SCL` — used by `Wire.begin()` in `main.cpp` and the PN532
- `PIN_TOUCH_I2C_SDA` / `PIN_TOUCH_I2C_SCL` — used by the GT911 driver

Both pairs are set to the same physical pins on current hardware (shared bus), but the split allows future hardware variants to route NFC and touch to separate I2C buses without any source changes.

---

### 10. `ioexpander.cpp` — `writeRegisterReliable()` triple-write is a workaround, not a fix

```cpp
// Write the same register 3 times with 1ms delays between writes.
// On a noisy I2C bus ... individual writes can silently fail.
for (int attempt = 0; attempt < 3; attempt++)
{
    if (writeRegister(reg, value))
        anyOk = true;
    delay(1);
}
```

This adds 3 ms per every I2C write, called from:
- `setup()` (4× on V4 path)
- `beeperOn()` / `beeperOff()` (adds 6 ms total to beep latency on top of the existing `delay(200)`)
- `fullRefresh()` in the loop (4× writes every 10 s)

The rationale is understandable given the hardware, but `delay(1)` inside a retrying write will block the Arduino main loop. More fundamentally, silently retrying and returning `anyOk` (which is true if _any_ of the 3 attempts succeeded) means the caller has no way to know if 2 of 3 writes failed.

**Issues:**
- `anyOk` semantics are misleading — even if 2/3 attempts fail it returns `true`
- Using `delay()` blocks the main task; `vTaskDelay` or a non-blocking approach would be better in a production firmware
- This workaround should at minimum be behind a `#ifdef IO_EXPANDER_16BIT` since it only exists because of the V4 hardware issue

---

### 11. `application.cpp` — Periodic `fullRefresh()` every 10 s is a silent background workaround

```cpp
if (millis() - lastIoRefresh > 10000)
{
    lastIoRefresh = millis();
    this->ioExpander.fullRefresh(false); // quiet — no register dump
}
```

Running this every 10 seconds without any logging means state corruption is happening and being silently corrected. If the I2C bus was truly reliable, this would not be needed. Silently masking the symptom is acceptable short-term, but:
- It should at minimum count how many times it had to correct state and log a warning
- The interval is a magic number — it should be a named constant

---

## 🟡 Minor Issues / Code Smells

### 12. `beeper.cpp` — `#include` placed after `#ifdef` at file scope

```cpp
#include "beeper.hpp"

#ifdef HAS_IO_EXPANDER_TCA9554
#include "../ioexpander/ioexpander.hpp"
#endif

#ifdef HAS_IO_EXPANDER_TCA9554
void Beeper::setup(IOExpander *expander) { ... }
#else
void Beeper::setup() { ... }
#endif
```

Conditional includes in `.cpp` files placed in the middle of the file (not at the top) make it harder to understand the translation unit's dependencies at a glance. The `#include` should be at the top of the file, grouped with the other includes.

---

### 13. `beeper.hpp` / `display.hpp` — Asymmetric `setup()` API via `#ifdef` ✅ Fixed

`Beeper::setup()` now declares `setup(IOExpander *expander = nullptr)` (matching the existing `= nullptr` default already present on `Display::setup()`). In `application.cpp` the two previously separate `#ifdef HAS_IO_EXPANDER` blocks (one for beeper, one for display) are merged into a single outer block, eliminating the nested `#ifdef HAS_IO_EXPANDER` inside `#ifdef HAS_LVGL_DISPLAY`.

---

### 14. `ioexpander.cpp` — `dumpRegisters()` called unconditionally in `setup()`

```cpp
initialized = true;
logger.info("IO expander initialized");
dumpRegisters();  // always runs, even in production
```

`dumpRegisters()` reads all 8 registers and logs their binary representation. This runs on every boot. It should be guarded by a debug flag or at minimum only called when `verbose = true`.

---

### 15. `ioexpander.cpp` — `fullRefresh()` with `#ifdef` inside a format string is unreadable

```cpp
logger.infof("fullRefresh done: port0=0x%02X"
#ifdef IO_EXPANDER_16BIT
             " port1=0x%02X"
#endif
             , outputState
#ifdef IO_EXPANDER_16BIT
             , outputState1
#endif
);
```

Preprocessor directives embedded inside a function call argument list is a well-known C++ anti-pattern that is very hard to read and maintain. Extract this into two separate `infof` calls or use a conditional variable.

---

### 16. `ioexpander.cpp` — `writeRegister()` failure logs at `infof` instead of `warnf`/`errorf`

```cpp
logger.infof("writeRegister(0x%02X, 0x%02X) FAILED err=%d ...", reg, value, err);
```

An I2C write failure is logged at `INFO` level. This means it appears at all log levels and is visually indistinguishable from normal informational output. Failures should use `warnf` or `errorf`.

---

### 17. `rgb_gt911_driver.cpp` — Touch init failure is non-fatal with no user feedback ✅ Fixed

Added `touchAvailable() const override { return touchInitialized; }` to `RgbGt911Driver` (base interface `IDisplayDriver` gets a default `touchAvailable()` returning `true`). `Display::setup()` checks the flag after `begin()` and calls `showErrorPopup("Touch Unavailable", ...)` via LVGL's top-layer overlay mechanism when touch hardware was not found. `Display::hasTouchInput()` is exposed as a public static for application code that needs to query touch availability at runtime.

---

### 18. `Adafruit_PN532_NTAG424.cpp` — Signed vs unsigned comparison for `_reset` pin

```cpp
if (_reset >= 0)
{
    pinMode(_reset, OUTPUT);
}
```

`_reset` is typed as `uint8_t` in the class. Comparing `uint8_t >= 0` is **always true** — an unsigned integer can never be negative. The intent is to use `-1` as a sentinel (no reset pin), but `(uint8_t)(-1)` is `255`, not negative. This guard does nothing.

**Action:** Use `_reset != 0xFF` (if 0xFF is the sentinel) or change `_reset` to `int8_t` / `int16_t` if a negative sentinel is intended, or use `#define NO_PIN 0xFF`.

---

### 19. `rgb_gt911_driver.cpp` — `ioExpander` member not initialised in non-expander constructor

The header declares two constructor variants via `#ifdef`. The non-expander constructor is `explicit RgbGt911Driver(Logger &logger)`, but the private member `IOExpander *ioExpander` is declared without a default:

```cpp
#ifdef HAS_IO_EXPANDER_TCA9554
    IOExpander *ioExpander;  // no = nullptr initialiser
#endif
```

If `HAS_IO_EXPANDER_TCA9554` is defined but the non-expander constructor is used (e.g. `Display::setup()` called with no argument via the default param), `ioExpander` is uninitialised. Code in `begin()` checks `if (ioExpander)` which is undefined behaviour on an uninitialised pointer.

**Action:** Add `= nullptr` to the member declaration.

---

### 20. `platformio.ini` — `TOUCH_DRIVER_FT6206=1` on `attractap-touch-ethernet` ✅ Documented

The Adafruit Qualia S3 RGB666 board uses a FocalTech FT6206 capacitive touch controller, so `TOUCH_DRIVER_FT6206=1` is correct and intentional. An explanatory comment has been added to `platformio.ini` to document this. The legacy try-both fallback in `qualia_ft_cst_driver.cpp` is now dead code for this target but is harmless and remains available for boards where the touch chip is not known at compile time.

---

### 21. `application.cpp` — Timestamp `[INIT]` logging is debug scaffolding

The setup path is littered with timing-instrumented log lines:

```cpp
this->logger.infof("[INIT] IO expander setup starting at t=%lu ms", millis());
this->logger.infof("[INIT] IO expander setup done at t=%lu ms", millis());
this->logger.infof("[INIT] Display setup starting at t=%lu ms", millis());
// ... etc for NFC, beeper, fullRefresh
```

These were clearly added to debug the initialisation order and timing. They add noise to the production serial log and the `[INIT]` prefix is inconsistent (NFC setup and the beeper test do not use it uniformly). Remove or demote to `DEBUG` level.

---

### 22. `beeper.cpp` — Beep duration silently changed from 100 ms to 200 ms

```diff
-    delay(100);
+    delay(200);
```

No comment explains why the duration was doubled. This could be a tuning decision for the new hardware or a debug artefact (making the beep easier to hear while testing). If it is intentional, add a comment. If it is a leftover, revert.

---

### 23. DRY: `fullRefresh()` duplicates the initialisation sequence from `setup()` ✅ Fixed

Extracted a private `writeDefaultState()` helper that writes the CONFIG direction registers and current output state to hardware. `setup()` now sets `outputState`/`outputState1` to defaults and calls it; `fullRefresh()` calls it with the live output state. Error logging is consolidated in `writeDefaultState()` rather than duplicated in both callers.

---

### 24. `ioexpander.hpp` — `IOEXP_PORT1_DEFAULT 0x3A` is an undocumented magic number

```cpp
#define IOEXP_PORT1_DEFAULT 0x3A  // Binary 0011 1010 (bits 1,3,4,5 high)
```

The comment lists which bits are high but does not explain **what those bits are** (which peripherals/functions they control). Looking at the V4 schematic, these bits represent real hardware signals (RS485, CAN, IMU, RTC, SD card control lines), but none of that is documented in the code. A future developer has no way to know if changing this value is safe.

**Action:** Document what each bit in `IOEXP_PORT1_DEFAULT` controls, or define named bit constants for port 1 the same way port 0 has `IOEXP_BIT_TP_RST`, `IOEXP_BIT_BACKLIGHT`, etc.

---

## 📋 Summary Table

| # | File | Severity | Category | Issue |
|---|------|----------|----------|-------|
| 1 | `apps/api/project.json` | ✅ Fixed | Bug | `not_dependsOn` → `dependsOn` restored |
| 2 | `main.cpp` | ✅ Fixed | Debug leftover | `i2cBusScan()` removed |
| 3 | `application.cpp` | ✅ Fixed | Debug leftover | Boot-time `singleBeep()` removed |
| 4 | `platformio.ini` | ✅ Fixed | Config | `attractap-touch-v2` changed to `LOG_LEVEL=INFO` / `LOGGER_LEVEL_NUM=3` |
| 5 | all firmware files | ✅ Fixed | Naming | `HAS_IO_EXPANDER_TCA9554` renamed to `HAS_IO_EXPANDER` everywhere |
| 6 | `ioexpander.cpp` / `ioexpander.hpp` | ✅ Fixed | Bug | `setPin()` documented as port-0 only; runtime `bit > 7` guard added |
| 7 | `ioexpander.cpp` | ✅ Fixed | SRP / Band-aid | CONFIG re-writes removed from `beeperOn/Off`; needs hardware test |
| 8 | `rgb_gt911_driver.cpp` | ✅ Fixed | Debug leftover | Touch-poll debug log removed |
| 9 | `rgb_gt911_driver.cpp` | ✅ Fixed | Hardcoding | SDA/SCL pins now use `PIN_TOUCH_I2C_SDA`/`SCL`; `PIN_NFC_I2C_SDA`/`SCL` split added |
| 10 | `ioexpander.cpp` | 🟠 Major | Design | Triple-write workaround blocks loop, misleading return |
| 11 | `application.cpp` | 🟠 Major | Design | Silent periodic `fullRefresh()` hides I2C corruption |
| 12 | `beeper.cpp` | ✅ Fixed | Style | Include already at top of file — no change needed |
| 13 | `beeper.hpp` / `application.cpp` | ✅ Fixed | Design | `Beeper::setup()` gets `= nullptr` default; `application.cpp` consolidated to one `#ifdef HAS_IO_EXPANDER` block |
| 14 | `ioexpander.cpp` | ✅ Fixed | Debug leftover | `dumpRegisters()` removed from `setup()` |
| 15 | `ioexpander.cpp` | ✅ Fixed | Readability | `#ifdef` inside format string replaced with two separate `infof` calls |
| 16 | `ioexpander.cpp` | ✅ Fixed | Logging | Write failure now logged at `warnf` |
| 17 | `display.cpp` / `display_driver.hpp` | ✅ Fixed | UX | `touchAvailable()` on driver interface; `Display::showErrorPopup()` shown on touch failure |
| 18 | `Adafruit_PN532_NTAG424.cpp` | ✅ Fixed | Bug | `_reset >= 0` (always true for uint8_t) changed to `_reset != 0xFF` |
| 19 | `rgb_gt911_driver.hpp` | ✅ Fixed | Bug | `ioExpander` member initialised to `nullptr` |
| 20 | `platformio.ini` | ✅ Fixed | Correctness | Confirmed FT6206 is correct for Qualia board; added comment to `platformio.ini` |
| 21 | `application.cpp` | ✅ Fixed | Debug leftover | `[INIT]` timing logs removed |
| 22 | `beeper.cpp` | ✅ Fixed | Unexplained change | Added comment: 200ms needed for passive buzzer on V4 (V3 used 100ms) |
| 23 | `ioexpander.cpp` | ✅ Fixed | DRY | `writeDefaultState()` extracted; called from both `setup()` and `fullRefresh()` |
| 24 | `ioexpander.hpp` | ✅ Fixed | Documentation | `IOEXP_PORT1_DEFAULT` now has per-bit comments with TODO to verify against schematic |

---

## 🔬 Follow-up Investigation: Remove Defensive I2C Workarounds

Several pieces of code exist solely to paper over what appeared to be an unreliable I2C bus during development. Now that the pin selection, address shifting (DFR1185), and init ordering are better understood, the root cause may already be fixed. These workarounds should be peeled back **one at a time**, verifying hardware behaviour after each removal.

### Background

The defensive code was introduced because the IO expander's CONFIG register (direction bits) appeared to revert to its power-on default (`0xFF` = all inputs) after GT911 or PN532 bus traffic, causing the beeper to stop working or get stuck on. The workarounds added to combat this:

1. **`writeRegisterReliable()`** — triple-writes every register with 1 ms delays
2. **`beeperOn()` / `beeperOff()`** — re-writes CONFIG register before every pin toggle
3. **`fullRefresh()`** — re-writes all config + output registers every 10 s from the main loop
4. **`fullRefresh()` after NFC init** — one-shot re-write at the end of `setup()`

### Key hypothesis: `fullRefresh()` is overcorrecting for a problem that targeted writes would expose

Every place `fullRefresh()` is called rewrites **all** config and output registers unconditionally. This means a transient write failure is silently swallowed — the next `fullRefresh()` just overwrites everything back to the expected state without ever indicating something went wrong. Importantly, it also means the code has never had to prove that individual `setPin()` / single-register writes actually work reliably on their own.

The ideal end state is:
- `setup()` writes CONFIG + initial OUTPUT once, verifies success
- Every subsequent state change (backlight, beeper, LCD reset) is a **single targeted `writeRegister()` call** to the output register only — no CONFIG re-write, no full-port overwrite
- If a single write fails, the failure is logged and visible

`fullRefresh()` should not exist as a runtime mechanism at all; it belongs only in recovery paths that are explicitly triggered (e.g. after a detected bus reset event), not as a periodic background task.

### Suggested Removal Order

Work through these steps in order on real hardware. If everything still functions correctly (backlight on, touch works, NFC reads, beeper beeps on tap and is silent otherwise), proceed to the next step.

#### Step 1 — Remove the one-shot `fullRefresh()` at the end of `setup()` ✅ Done — needs hardware test

Removed from `application.cpp`. Flash and verify: backlight on, touch works, NFC reads on first scan after boot. If yes, proceed to Step 2.

**Rationale:** This was added because GT911 probing was suspected to corrupt the expander state during init. The new pin defines and corrected init order (touch reset via IO expander → touch init → display init) may have fixed the underlying cause. If the hardware comes up cleanly without this, the corruption during init is no longer happening.

---

#### Step 2 — Remove CONFIG re-writes from `beeperOn()` / `beeperOff()` ✅ Done — needs hardware test

Removed from both methods. Flash and verify: beeper beeps on a successful NFC scan, doesn't get stuck on or go silent after repeated scans. If yes, proceed to Step 3.

**Rationale:** If Step 1 passed, the CONFIG register is stable after init. Writing it on every beep is unnecessary. Removing it also makes `beeperOn/Off` single-responsibility again.

---

#### Step 3 — Replace the periodic `fullRefresh()` in `loop()` with a targeted output-only write, then remove it

First, replace `fullRefresh(false)` with a call to `refreshOutput()` (output registers only, no CONFIG re-write):

```cpp
// application.cpp — change:
this->ioExpander.fullRefresh(false);
// to:
this->ioExpander.refreshOutput();
```

Flash and observe: if the beeper or backlight state ever goes wrong between the 10 s intervals, that confirms the CONFIG register is still being corrupted at runtime and the problem is not fully solved yet. If everything stays correct, the CONFIG writes in `fullRefresh()` were not needed — then **remove the periodic call entirely**.

**Rationale:** Isolating the CONFIG re-write from the output re-write tells you which one was actually doing the work. `fullRefresh()` was doing both unconditionally, which hid the real question: is it the config that gets corrupted, or the output state, or neither?

---

#### Step 4 — Downgrade `writeRegisterReliable()` to a single write

Replace all `writeRegisterReliable()` calls with plain `writeRegister()` calls (or remove the `Reliable` wrapper entirely).

**Rationale:** If CONFIG corruption is gone, every I2C write should succeed on the first attempt. The triple-write was masking transient failures; once those are gone it only adds 3 ms of blocking delay per write for no benefit.

> If single writes start failing (check the `writeRegister FAILED` log), this points to a genuine remaining bus issue — investigate pull-up resistor values, bus capacitance, and `Wire.setTimeOut()` before reintroducing retries.

---

#### Step 5 (optional cleanup) — Remove or demote `dumpRegisters()` from `setup()`

Once the above steps confirm stable operation, `dumpRegisters()` in `setup()` is no longer needed for diagnosis and can be removed or moved behind a `#ifdef DEBUG` guard.

---

### If Any Step Fails

If removing a workaround causes the beeper to malfunction, log `writeRegister FAILED` errors, or produces other regressions, the root cause is still present. At that point, investigate:

- **Pull-up resistors** on SDA/SCL — check values against the I2C bus capacitance for the number of devices on the bus
- **`Wire.setTimeOut(50)`** — may be too short; try 100 ms or 200 ms
- **I2C clock speed** — try `Wire.setClock(100000)` (100 kHz) instead of the default 400 kHz
- **Bus sharing** — if GT911's `touch.begin()` re-configures the Wire bus speed or address, it could affect the IO expander; check the `TouchDrvGT911` library source
- **Power sequencing** — verify the IO expander has fully completed its power-on reset before the first write (`delay(10)` in `setup()` may not be enough)
