# AttractaP Firmware Unified Implementation Plan

Target: **Guition JC1060P470** (ESP32-P4 + C6, 1024x600 DSI, GT911 touch).
Scope: one plan for remaining P4 work + architecture/security/perf findings.

## Verification Harness (use for all tasks)

Current known blocker:
- `pio run -e attractap-p4 -t upload` currently fails.
- Therefore **T0 must be completed first** before any other task verification.

1. Build and flash latest test build:
   - `cd apps/attractap-firmware`
   - `pio run -e attractap-p4 -t upload`
2. Open serial monitor:
   - `pio device monitor -b 115200`
3. Serial command format:
   - `CMND <topic> <json-payload>`
   - Response format: `RESP <topic> <json>`
4. Recommended auth bootstrap (if PIN not yet set):
   - `CMND auth.status.get {}`
   - If `pinIsSet=false`: `CMND auth.code.set {"newCode":"1234"}`
5. Useful built-in status commands:
   - `CMND network.status.get {"authCode":"1234"}`
   - `CMND api.status.get {"authCode":"1234"}`
   - `CMND network.wifi.ssids.get {"authCode":"1234"}`
6. For tests that need extra observability, add temporary serial commands in `src/serial/serialCommandHandler.cpp` and remove them before merge.

## Priority Model

- **P0**: ship blocker / security-critical / data-corruption risk.
- **P1**: major UX/perf/reliability.
- **P2**: maintainability/architecture follow-up.

## Dependency Map (blockers)

- **T0 Build/flash pipeline fix** blocks **all tasks T1-T10**.
- **T1 OTA integrity hardening** blocks **T2 OTA robustness**.
- **T3 LVGL quick wins** should run before **T4 LVGL deep profiling/tuning**.
- **T5 P4 NFC hardware validation** and **T6 P4 Ethernet enablement** can run in parallel (after T0).
- **T7 shared state synchronization** should land before **T8 architectural state refactor**.
- **T8 architecture refactor** should land before **T9 API/UI boundary cleanup**.

## Task List

| ID | Priority | Task | Blocked By | Owner | Exit Criteria |
| --- | --- | --- | --- | --- | --- |
| T0 | P0 | Fix `attractap-p4` upload/build pipeline | - | Firmware/Build | `pio run -e attractap-p4 -t upload` succeeds on connected device; serial monitor confirms boot |
| T1 | P0 | OTA authenticity verification | T0 | Firmware | OTA rejects tampered image; signature/manifest verification enforced before boot-switch |
| T2 | P0 | OTA chunk/order/integrity hardening | T1 | Firmware | Strict offset/length checks; replay/out-of-order chunks rejected; no corrupted upgrade state |
| T3 | P1 | LVGL responsiveness quick wins | T0 | UI/Firmware | Measurable touch latency drop; no regressions in forms/session screens |
| T4 | P1 | LVGL profiling + final timing tune (P4) | T3 | UI/Firmware | Chosen refresh/input periods backed by metrics; stable under load |
| T5 | P1 | NFC hardware validation on P4 | T0 | HW/Firmware | Tap/auth/enroll/init-fail UX validated on device; long-run stability pass |
| T6 | P1 | Ethernet enablement on P4 | T0 | Network/Firmware | P4 build includes Ethernet path; link-up/reconnect validated |
| T7 | P1 | Shared runtime state synchronization | T0 | Firmware | No unsynchronized cross-task shared mutable state in hot paths |
| T8 | P2 | Replace global `State` with evented state service | T7 | Firmware/Arch | UI/runtime consume typed snapshots/events; static global state removed/deprecated |
| T9 | P2 | API/UI boundary cleanup (contracts-only UI) | T8 | Firmware/Arch | Display/screens no longer use legacy `API::*` models directly |
| T10 | P2 | Runtime decomposition (dependency overload reduction) | T8 | Firmware/Arch | Smaller feature modules/contexts; reduced constructor/context fan-in |

## Detailed Work Packages

### T0 (P0): Fix `attractap-p4` upload/build pipeline

**Why**
- Current implementation cannot be validated because flash step fails.

**Changes**
1. Reproduce failure with full logs from:
   - `pio run -e attractap-p4`
   - `pio run -e attractap-p4 -t upload`
2. Identify failure class (build config, toolchain, partition/upload args, port/permissions, board env mismatch).
3. Apply minimal fix in config/scripts/source as needed.
4. Document root cause and final command sequence that works.

**Files likely touched**
- `platformio.ini`
- `sdkconfig.p4.defaults`
- build scripts/env-specific config (if needed)

**Precise verification steps**
1. Clean build:
   - `pio run -e attractap-p4 -t clean`
   - `pio run -e attractap-p4`
2. Upload:
   - `pio run -e attractap-p4 -t upload`
3. Boot confirmation:
   - `pio device monitor -b 115200`
   - confirm firmware boots and command handler is alive.
4. Serial sanity:
   - `CMND auth.status.get {}`
   - expect `RESP auth.status.get ...`
5. Run upload twice consecutively to confirm stability.

**Exit**
- Build + upload + boot + serial command round-trip succeed reliably.

---

### T1 (P0): OTA authenticity verification

**Why**
- Current OTA path validates image header magic only; not sufficient for authenticity.

**Changes**
1. Define signed update format (manifest + firmware digest/signature).
2. Verify signature/hash before accepting update stream.
3. Fail closed: abort update on any verification mismatch.
4. Add explicit telemetry/log event for auth failures.

**Files likely touched**
- `src/api/api.cpp`
- `src/api/api.hpp`
- crypto/verification helper module (new)

**Validation**
- Positive: valid signed firmware updates.
- Negative: modified payload rejected before `esp_ota_set_boot_partition`.

**Precise verification steps**
1. Flash test firmware with T1 changes.
2. Configure API endpoint using serial:
   - `CMND api.configuration.set {"authCode":"1234","hostname":"<host>","port":443,"useSSL":true}`
3. Trigger update path (normal flow) and verify:
   - Update reaches 100%.
   - Device reboots into new app.
4. Serve tampered artifact (same version, modified bytes/signature mismatch).
5. Trigger update again and verify:
   - Update aborts before boot partition switch.
   - Device stays on previous firmware after reboot/power-cycle.
6. Capture evidence:
   - Serial logs showing verification failure reason.
   - `api.status.get` still reachable post-failure.

---

### T2 (P0): OTA chunk/order/integrity hardening

**Why**
- Offset/order checks are not strict enough; risk of corrupted write state.

**Changes**
1. Track `expectedOffset`; enforce incoming chunk offset/len continuity.
2. Enforce chunk boundaries against requested ranges.
3. Add overflow guards for byte counters.
4. Reset OTA state atomically on abort/end.

**Validation**
- Inject out-of-order/replayed/misaligned chunks; update must abort cleanly.

**Precise verification steps**
1. Keep T1 enabled (T2 depends on T1).
2. Use a test sender/backend mode that can emit:
   - out-of-order chunk offsets,
   - duplicate chunks,
   - mismatched length for requested offset.
3. For each fault mode:
   - Start OTA.
   - Confirm device aborts update with explicit reason.
   - Confirm no boot partition switch occurs.
4. Run one valid OTA immediately after fault injection; it must still succeed.
5. Pass criteria:
   - No deadlock in OTA state machine.
   - Counters reset cleanly (next update starts from offset 0).

---

### T3 (P1): LVGL responsiveness quick wins

**Why**
- Responsiveness likely hurt by too-frequent UI writes + forced layout/invalidation.

**Changes**
1. Only call `lv_label_set_text` / `lv_bar_set_value` on value change.
2. Reduce session timeout bar tick frequency (`resourceDetails`).
3. Remove synchronous `lv_obj_update_layout` in hot interaction paths where safe.
4. Stop repeated style-set churn in `InitScreen::loop` (apply on transition only).
5. Disable LVGL logs in release configs.

**Files likely touched**
- `src/display/screens/resourceDetails/resourceDetailsScreen.cpp/.hpp`
- `src/display/screens/init/initscreen.cpp`
- `include/lv_conf.h`

**Validation**
- Touch-to-action latency metric improves.
- No visual regression on forms/session/progress indicators.

**Precise verification steps**
1. Add temporary debug metric logs (or serial command) for:
   - touch event timestamp,
   - button callback timestamp,
   - UI loop duration percentiles.
2. Baseline before changes:
   - Record 50 taps on key actions (resource select, start/stop session, modal form submit).
   - Record p50/p95 touch-to-action latency.
3. Apply T3 changes; flash and repeat same 50-tap set.
4. Pass criteria:
   - p95 latency improvement >= 20% or absolute p95 < 120ms.
   - No missing taps.
   - No visible regressions on resource details/forms screens.

---

### T4 (P1): LVGL profiling + timing tune (P4)

**Why**
- P4 overrides currently aggressive (`LV_DISP_DEF_REFR_PERIOD=5`, `LV_INDEV_DEF_READ_PERIOD=3`).

**Changes**
1. Add lightweight UI timing metrics (`ui_loop_ms`, dropped frames, input latency).
2. Test matrix for refresh/input periods (e.g. 8/8, 10/10, 10/8 ms).
3. Pick settings by measured latency + CPU headroom, not intuition.

**Validation**
- Decision doc in repo with selected values + benchmark evidence.

**Precise verification steps**
1. Test matrix (each config gets fresh flash + reboot):
   - A: `LV_DISP_DEF_REFR_PERIOD=5`, `LV_INDEV_DEF_READ_PERIOD=3` (baseline)
   - B: `8/8`
   - C: `10/8`
   - D: `10/10`
2. For each config run 10-minute interaction script:
   - rapid tap navigation,
   - open/close forms modal repeatedly,
   - idle + periodic touches.
3. Collect for each config:
   - touch-to-action p50/p95,
   - avg/max UI loop time,
   - subjective missed/laggy touch count.
4. Choose config with best p95 + stability (not just max FPS).

---

### T5 (P1): NFC hardware validation on P4

**Why**
- Code path exists, but hardware/runtime validation still open.

**Test checklist**
1. Tap detection reliability.
2. Auth flow success/failure.
3. Enrollment end-to-end.
4. Init-fail popup (`Retry`/`Reboot`) behavior.
5. 8-24h soak on shared I2C load (touch + PN532).

**Exit**
- Pass checklist on real hardware, no unrecovered lockups.

**Precise verification steps**
1. Tap detection:
   - 100 tap/remove cycles; zero missed detections.
2. Auth flow:
   - 20 valid, 20 invalid cards; verify expected allow/deny behavior.
3. Enrollment:
   - Enroll new tag, re-auth with enrolled tag, verify persistence after reboot.
4. Init-fail UX:
   - Simulate PN532 disconnect at boot; verify popup + both actions (`Retry`, `Reboot`).
5. Soak:
   - 8h minimum with periodic touch + NFC interactions every 2-5 min.
6. Pass criteria:
   - No watchdog resets, no stuck I2C bus, no unrecoverable NFC state.

---

### T6 (P1): Ethernet enablement on P4

**Changes**
1. Re-enable Ethernet code path for P4 in `src/network`.
2. Remove P4 source-filter exclusion in `platformio.ini`.
3. Resolve ESP32-P4 API incompatibilities (`ETH_*` and related init/event path).
4. Validate link, DHCP/static config, reconnect, coexistence with WiFi.

**Exit**
- `attractap-p4` build includes Ethernet and passes hardware reconnect test.

**Precise verification steps**
1. Build confirms Ethernet path compiled for `attractap-p4`.
2. Link-up test:
   - Connect cable, boot, verify interface gets IP.
   - Confirm API connection can authenticate over Ethernet path.
3. Reconnect test:
   - Unplug for 30s, replug; verify automatic recovery.
4. Coexistence test:
   - With WiFi creds configured (`network.wifi.credentials.set`), validate preferred/fallback behavior.
5. Pass criteria:
   - 10 unplug/replug cycles without manual reset.

---

### T7 (P1): Shared runtime state synchronization

**Why**
- Multiple worker tasks (`network/api/nfc`) + static shared state without synchronization.

**Changes**
1. Add synchronization strategy for shared mutable state (lock or single-writer queue).
2. Remove unsynchronized reads/writes in cross-task code paths.
3. Add stress test for rapid connect/disconnect + UI transitions.

**Exit**
- No known race-prone shared mutable state in active paths.

**Precise verification steps**
1. Add temporary serial debug command returning atomic snapshot counters for state updates (wifi/ws/api).
2. Run stress scenario for 30 min:
   - toggle AP availability,
   - repeated API config writes via serial,
   - active UI touch interactions.
3. Verify:
   - no torn/inconsistent snapshots,
   - no crashes/assertions,
   - stable command responses from `network.status.get` + `api.status.get`.

---

### T8 (P2): Replace global `State` with evented state service

**Changes**
1. Introduce typed state snapshots/events (network/ws/api).
2. Inject state service via ports/adapters.
3. Migrate screens/runtime to consume snapshots/events.
4. Deprecate/remove static `State`.

**Exit**
- No direct `State::get*`/`State::set*` in UI/runtime modules.

**Precise verification steps**
1. Static check:
   - `rg "State::get|State::set" src/runtime src/display src/adapters`
2. Expectation:
   - no matches in migrated modules; only compatibility shim (if temporary) allowed.
3. Runtime check:
   - repeat core boot/network/auth/session flows on device and compare behavior with pre-refactor baseline.

---

### T9 (P2): API/UI boundary cleanup

**Changes**
1. Remove legacy `API::*` data leakage into display/screens.
2. Use contracts at UI boundaries only.
3. Simplify translator layer to unavoidable mapping points.

**Exit**
- UI layer contract-only.

**Precise verification steps**
1. Static check:
   - `rg "API::" src/display src/adapters/ui_adapter.hpp`
2. Expectation:
   - no `API::*` types in display layer.
3. Runtime check:
   - resource list, details, forms, projects pagination, action buttons all still function on device.

---

### T10 (P2): Runtime decomposition

**Why**
- `AppRuntime`/`RuntimeContext` dependency fan-in is high.

**Changes**
1. Split runtime into feature coordinators (connectivity/session/update/ui-flow).
2. Reduce constructor/context fan-in by grouped interfaces.
3. Keep current behavior via incremental migration + parity tests.

**Exit**
- Lower coupling, easier test seams, no behavior regressions.

**Precise verification steps**
1. Static check:
   - compare constructor/context dependency counts before/after.
2. Unit/integration:
   - run existing tests; add focused tests for each extracted coordinator.
3. Device regression pass:
   - full app flow: boot -> config -> connect -> auth -> resource interaction -> logout.
4. Pass criteria:
   - behavior parity; no increase in crash/reset rate during 1h interactive run.

## Suggested Execution Order (phases)

1. **Phase A (P0 unblock):** T0
2. **Phase B (P0 security):** T1 -> T2
3. **Phase C (P1 perf/reliability):** T3 -> T4 -> T5 -> T6 -> T7
4. **Phase D (P2 architecture):** T8 -> (T9 + T10)

## Single-Agent Execution + Commit Policy

Constraints for implementation run:

- One agent, one continuous implementation run.
- No PR splitting during execution.
- Mandatory incremental commits after each meaningful checkpoint so progress is auditable and reversible.

Required commit checkpoints (minimum):

1. `T0` complete + verified -> commit
2. `T1` complete + verified -> commit
3. `T2` complete + verified -> commit
4. `T3` complete + verified -> commit
5. `T4` complete + verified -> commit
6. `T5` complete + verified -> commit
7. `T6` complete + verified -> commit
8. `T7` complete + verified -> commit
9. `T8` complete + verified -> commit
10. `T9` complete + verified -> commit
11. `T10` complete + verified -> final commit

Commit rules:

- Do not mix unrelated tasks in one commit.
- Include verification evidence in commit message body.
- If a task is large, split into sub-commits (`T#-part1`, `T#-part2`) but keep same task scope.
- If blocked, create a "checkpoint" commit with current state + blocker note, then continue with unblocked tasks only if dependency map allows it.

Commit message format (required):

- Subject: `T#: <short task outcome>`
- Body:
  - `Why: ...`
  - `Changes: ...`
  - `Verification: ...` (exact commands/tests run)
  - `Result: PASS/FAIL`
  - `Blocked-by:` (if any)

## Tracking Template (copy per task into commit notes / run log)

- **Task ID:** T#
- **Priority:** P#
- **Status:** Todo / In progress / Blocked / Done
- **Blocked by:** T#
- **Commit(s):**
- **Test evidence:**
- **Risks / rollback:**

## Build / Flash

```bash
cd apps/attractap-firmware
pio run -e attractap-p4
pio run -e attractap-p4 -t upload
```

Use PlatformIO upload for this target.

## Serial Command Quick Reference (existing)

- `CMND auth.status.get {}`
- `CMND auth.code.set {"newCode":"1234"}` or `{"newCode":"5678","currentCode":"1234"}`
- `CMND network.status.get {"authCode":"1234"}`
- `CMND network.wifi.ssids.get {"authCode":"1234"}`
- `CMND network.wifi.credentials.set {"authCode":"1234","ssid":"<ssid>","password":"<pw>"}`
- `CMND api.status.get {"authCode":"1234"}`
- `CMND api.configuration.set {"authCode":"1234","hostname":"<host>","port":443,"useSSL":true}`

## Key Files

- `platformio.ini` (`[env:attractap-p4]`)
- `sdkconfig.p4.defaults`
- `include/lv_conf.h`
- `src/api/api.cpp`
- `src/runtime/app_runtime.*`
- `src/runtime/runtime_context.*`
- `src/runtime/runtime_workers.*`
- `src/state/state.*`
- `src/display/screens/resourceDetails/resourceDetailsScreen.*`
- `src/display/screens/init/initscreen.cpp`
- `src/display/driver/p4_dsi/p4_dsi_gt911_driver.cpp`
- `src/websocket/websocket_p4.cpp`
- `src/network/network.cpp`
- `src/nfc/nfc.cpp`

