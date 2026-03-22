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

### 5. Macro name `HAS_IO_EXPANDER_TCA9554` is a lie

The macro named `HAS_IO_EXPANDER_TCA9554` now controls initialisation of **two** completely different chips:
- V3: TCA9554 (8-bit, I2C address 0x20)
- V4: XL9555 / PCA9555-compatible (16-bit, I2C address 0x24)

The name implies a specific chip but the behaviour diverges dramatically inside `#ifdef IO_EXPANDER_16BIT` sub-guards. This is confusing for anyone reading the code: if `HAS_IO_EXPANDER_TCA9554` is defined but `IO_EXPANDER_16BIT` is also defined, you get the 16-bit code path while the outer flag claims TCA9554.

**Action:** Rename to `HAS_IO_EXPANDER`. Keep `IO_EXPANDER_16BIT` as the discriminator for chip variant. Update all call sites.

---

### 6. `ioexpander.cpp` — `setPin()` is port-0 only but is the generic public API

```cpp
void IOExpander::setPin(uint8_t bit, bool high)
{
    ...
    outputState |= (uint8_t(1 << bit));   // only port 0
    writeRegisterReliable(IOEXP_REG_OUTPUT, outputState);
    // outputState1 / IOEXP_REG_OUTPUT_1 never touched
}
```

On the 16-bit expander (V4), port 1 state (`outputState1`) can only be written via `fullRefresh()`. Any caller that tries to control a port-1 pin via `setPin()` will silently manipulate the wrong register. Currently port 1 is only used for the defaults from the Waveshare demo, but this is a fragile assumption.

**Action:** Either add a `port` parameter, or clearly document that `setPin()` is port-0 only and add an assertion/warning if `bit > 7`.

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

### 13. `beeper.hpp` / `display.hpp` — Asymmetric `setup()` API via `#ifdef`

Both classes conditionally expose a different `setup()` signature depending on compile flags:

```cpp
// beeper.hpp
#ifdef HAS_IO_EXPANDER_TCA9554
    void setup(IOExpander *expander);
#else
    void setup();
#endif
```

This means callers must also `#ifdef` around every `setup()` call, which is what `application.cpp` does. This is the same conditional duplicated in two places. A cleaner pattern is a single `setup(IOExpander *expander = nullptr)` signature that is always available (the non-expander path simply ignores a null pointer), eliminating the conditional at call sites.

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

### 17. `rgb_gt911_driver.cpp` — Touch init failure is non-fatal with no user feedback

```cpp
logger.error("GT911 not found at either address — display will work without touch");
```

The device boots successfully without a working touchscreen. While this is more robust than the old hard-return-false, there is no visual indicator to the end user that touch is broken. The `initialized` flag is set to `true` regardless. If the display is present but touch is not, users will assume the device is broken rather than understanding touch specifically failed.

**Action:** At minimum, show a warning screen or toast via LVGL if `touchInitialized == false`.

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

### 20. `platformio.ini` — `TOUCH_DRIVER_FT6206=1` added to `attractap-touch-ethernet` without corresponding removal of legacy fallback

The `attractap-touch-ethernet` env now has `TOUCH_DRIVER_FT6206=1`, which activates the new compile-time touch selection path in `qualia_ft_cst_driver.cpp`. The old `#else` fallback (try both FT6206 then CST8XX) remains in the source but is now dead code for this target. If the existing board actually needed CST8XX, this change is a silent regression.

**Action:** Verify which touch controller the `attractap-touch-ethernet` hardware actually uses. If FT6206 is confirmed, the legacy `#else` fallback block should be cleaned up or removed.

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

### 23. DRY: `fullRefresh()` duplicates the initialisation sequence from `setup()`

The V4 path in `setup()` writes CONFIG registers and initial OUTPUT values. `fullRefresh()` does the exact same CONFIG + OUTPUT writes. The logic is not shared — it is duplicated. If the default port values or register addresses change, they must be updated in two places.

**Action:** Extract a private `writeDefaultState()` helper and call it from both `setup()` and `fullRefresh()`.

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
| 5 | `ioexpander.hpp` | 🟠 Major | Naming | `HAS_IO_EXPANDER_TCA9554` covers two different chips |
| 6 | `ioexpander.cpp` | 🟠 Major | Bug | `setPin()` only controls port 0 of 16-bit expander |
| 7 | `ioexpander.cpp` | 🟠 Major | SRP / Band-aid | CONFIG re-write duplicated inside `beeperOn/Off` |
| 8 | `rgb_gt911_driver.cpp` | ✅ Fixed | Debug leftover | Touch-poll debug log removed |
| 9 | `rgb_gt911_driver.cpp` | ✅ Fixed | Hardcoding | SDA/SCL pins now use `PIN_TOUCH_I2C_SDA`/`SCL`; `PIN_NFC_I2C_SDA`/`SCL` split added |
| 10 | `ioexpander.cpp` | 🟠 Major | Design | Triple-write workaround blocks loop, misleading return |
| 11 | `application.cpp` | 🟠 Major | Design | Silent periodic `fullRefresh()` hides I2C corruption |
| 12 | `beeper.cpp` | 🟡 Minor | Style | Conditional `#include` not at top of file |
| 13 | `beeper.hpp` / `display.hpp` | 🟡 Minor | Design | Asymmetric `setup()` API causes duplicate `#ifdef` at call sites |
| 14 | `ioexpander.cpp` | ✅ Fixed | Debug leftover | `dumpRegisters()` removed from `setup()` |
| 15 | `ioexpander.cpp` | 🟡 Minor | Readability | `#ifdef` inside format string args |
| 16 | `ioexpander.cpp` | 🟡 Minor | Logging | Write failure logged at `INFO` not `WARN`/`ERROR` |
| 17 | `rgb_gt911_driver.cpp` | 🟡 Minor | UX | No user-visible feedback when touch init fails |
| 18 | `Adafruit_PN532_NTAG424.cpp` | 🟡 Minor | Bug | `uint8_t >= 0` guard is always true |
| 19 | `rgb_gt911_driver.hpp` | 🟡 Minor | Bug | `ioExpander` member uninitialized in non-expander build |
| 20 | `platformio.ini` | 🟡 Minor | Correctness | `TOUCH_DRIVER_FT6206` on ethernet target may be regression |
| 21 | `application.cpp` | ✅ Fixed | Debug leftover | `[INIT]` timing logs removed |
| 22 | `beeper.cpp` | 🟡 Minor | Unexplained change | Beep duration doubled 100→200 ms without comment |
| 23 | `ioexpander.cpp` | 🟡 Minor | DRY | `fullRefresh()` duplicates `setup()` register sequence |
| 24 | `ioexpander.hpp` | 🟡 Minor | Documentation | `IOEXP_PORT1_DEFAULT 0x3A` bits not explained |

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

#### Step 1 — Remove the one-shot `fullRefresh()` at the end of `setup()`

```cpp
// application.cpp — remove this block:
this->ioExpander.fullRefresh();
```

**Rationale:** This was added because GT911 probing was suspected to corrupt the expander state during init. The new pin defines and corrected init order (touch reset via IO expander → touch init → display init) may have fixed the underlying cause. If the hardware comes up cleanly without this, the corruption during init is no longer happening.

---

#### Step 2 — Remove CONFIG re-writes from `beeperOn()` / `beeperOff()`

```cpp
// ioexpander.cpp — remove from both methods:
#ifdef IO_EXPANDER_16BIT
    writeRegisterReliable(IOEXP_REG_CONFIG, 0x00);
#endif
```

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
