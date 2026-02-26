# System Smoothness Research (ESP32-P4)

## Goal

Investigate end-to-end smoothness (touch/render + app state + server communication), and propose architecture-level fixes with measurable proof.

## Executive verdict

This is primarily an architecture/scheduling problem, not raw ESP32-P4 compute shortage.

Main issue: the UI loop (`Application::loop`) runs blocking NFC/API work inline after `Display::loop()`. Any blocking call there delays the next LVGL/touch cycle, causing visible input lag and missed taps.

## Key findings (ranked)

1. **Blocking NFC polling in main loop (critical)**
   - `Application::loop()` calls `nfc.loop()` every iteration.
   - `NFC::handleCardDetection()` calls `readPassiveTargetID(..., timeout=100)`.
   - PN532 path waits with `delay(10)` polling until timeout (`waitready`), so one call can block up to ~100ms (or more depending on transport behavior).
   - This caps effective UI loop responsiveness and can easily cause missed short key taps.

2. **Excessive synchronous logging on hot paths (critical)**
   - `platformio.ini` enables `LOG_LEVEL=DEBUG`, `LOGGER_LEVEL_NUM=4` in active envs.
   - `sdkconfig.p4.defaults` sets `CONFIG_LOG_DEFAULT_LEVEL=5`.
   - Serial logging is synchronous (`Serial.print/println`) and used heavily across loop paths (API/WebSocket/WiFi/NFC/UI transitions).
   - `DEBUG_LOOP_TIMING` is enabled in P4 build flags, emitting logs on slow loops, which can amplify slowness while diagnosing slowness.

3. **UI loop mixes realtime input/render with non-realtime subsystems (critical)**
   - `Display::loop()` (LVGL + touch) shares thread/tick with serial command parsing, NFC, API loop, and state machine logic.
   - No explicit frame budget / cooperative slicing for non-UI work.
   - A single slow subsystem blocks touch sampling and LVGL timers.

4. **Potentially blocking reconnect/handshake paths (high)**
   - P4 WebSocket client performs blocking `connect(..., 10000)` and handshake response wait loops.
   - Even if not always active during keyboard entry, this design can intermittently stall overall behavior if reached on main path timing boundaries.

5. **LVGL config inconsistency (high)**
   - `lv_conf.h` defines `LV_MEM_CUSTOM` twice (first `1`, then `0`), effectively disabling custom allocator path.
   - This can produce unexpected allocation behavior and performance variance under UI churn.

6. **Possible redraw/flush cost spikes (medium)**
   - Large P4 buffers are attempted; fallback to PSRAM if DMA alloc fails.
   - If buffers live in PSRAM, flush bandwidth/latency can degrade responsiveness during heavy invalidation.
   - Not the main 1s symptom driver, but likely contributes to jitter.

## Why keyboard feels especially bad

Keyboard typing needs frequent touch scans + fast LVGL event/render turnaround. Current design allows long pauses between `lv_timer_handler()` calls when NFC/API work blocks. That produces:

- delayed key visual feedback,
- dropped taps (press/release happens between sparse polls),
- occasional bursts (multiple actions processed after stall).

## High-confidence root cause chain

1. Main loop runs `Display::loop()` once.
2. Main loop then enters blocking subsystem work (notably NFC polling timeout).
3. During blocking window, no LVGL/touch processing occurs.
4. User taps keyboard; sampling cadence is too low -> lag/missed input.
5. Debug logging increases blocking time and serial contention.

## Recommended architecture changes (prioritized)

### Phase 1: Immediate wins (low risk)

1. **Reduce/disable blocking work while typing/config screens are active**
   - Disable NFC polling when screen/state does not need card detection.
   - In `CONFIGURATION_REQUIRED` and other non-card screens: `nfc.disableCardDetection()`.
   - Treat this as the default policy: NFC is opt-in per state, not always-on.
2. **Lower logging overhead for production/perf runs**
   - Default build to `INFO` or `WARN`.
   - Disable `DEBUG_LOOP_TIMING` except targeted profiling sessions.
3. **Shrink NFC poll timeout aggressively**
   - Replace 100ms passive read timeout with very small timeout or non-blocking/IRQ-based approach.

### State-aware responsiveness policy

Not every state needs the same responsiveness target.

1. **UI-reactive states (strict latency)**
   - Examples: keyboard entry, settings/forms editing, resource browsing.
   - Policy: NFC polling off.
   - Goal: maximize touch/render responsiveness.
2. **NFC-centric states (relaxed UI latency allowed)**
   - Examples: wait-for-card/auth/enroll flows.
   - Policy: NFC polling on; some blocking is acceptable if bounded.
   - Goal: reliable card detection/auth over UI fluidity.

This matches product behavior: when user is typing/configuring, responsiveness is critical; when waiting for card, UI interactivity is secondary.

### Phase 2: Structural fix (recommended)

1. **Separate UI from blocking subsystems**
   - Keep LVGL/touch loop on dedicated high-priority task/core with strict cadence.
   - Move NFC and API work to separate tasks.
   - Communicate via queues/events (no blocking calls in UI task).
2. **Introduce frame budget**
   - Target `lv_timer_handler()` every 5-10ms.
   - Non-UI tasks must not block UI thread.
3. **Debounce expensive state updates**
   - Coalesce repeated UI updates and avoid unnecessary label/style writes.

### Phase 3: Robustness/perf hardening

1. Fix `lv_conf.h` allocator config (`LV_MEM_CUSTOM` single source of truth).
2. Add runtime telemetry:
   - loop latency histogram (p50/p95/p99),
   - max consecutive UI-gap duration,
   - dropped-touch estimate.
3. Validate draw buffer placement/perf on P4:
   - confirm DMA/internal RAM success rate,
   - benchmark flush time per frame and per invalidated area.

## Concrete implementation plan

1. **Task split**
   - `uiTask`: `Display::loop()` only (plus lightweight UI state apply).
   - `nfcTask`: polling/auth/card detection state machine.
   - `apiTask`: websocket/network heartbeat/message processing.
2. **Event bus**
   - NFC -> UI/API via queue events.
   - API -> UI via queue events (then `lv_async_call` or UI-task direct apply).
3. **State-driven NFC enablement**
   - Explicitly enable only in lock/auth/enroll states; disable elsewhere.
4. **Perf gate in CI/manual QA**
   - Keyboard test: 30 fast taps, target 0 drops, p95 input-to-render < 80ms.

## Measurement plan (before/after proof)

### Scope

We treat smoothness as an end-to-end property across:

1. UI input/render path.
2. Internal app-state processing path.
3. Network/websocket/server path.

### What to measure (core KPIs)

1. **UI loop cadence**
   - Metric: gap between consecutive `Display::loop()` calls (ms).
   - Report: p50, p95, p99, max.
2. **Touch-to-UI latency**
   - Metric: time from touch sample (`touchpad_read`) to text update in target textarea.
   - Report: p50, p95, p99, max.
3. **Dropped input rate**
   - Metric: `(expected key presses - applied key presses) / expected key presses`.
   - Report per 100 taps.
4. **Blocking budget by subsystem**
   - Metric: per-loop time spent in `display`, `nfc`, `api`, `processState`, `serial`.
   - Report: mean, p95, max for each.
5. **Render/flush cost**
   - Metric: display flush duration and bytes/chunk per flush.
   - Report: p50/p95/max flush time and frame-time spikes.
6. **State transition latency**
   - Metric: time from triggering event to target app state/UI screen ready.
   - Examples: card detected -> unlock screen; settings save -> connected/authenticated.
   - Report: p50, p95, max.
7. **Server roundtrip latency**
   - Metric: request send timestamp -> matching ACK/event response timestamp.
   - Examples: `REQUEST_CARD_AUTHENTICATION_DATA`, session start/stop, project fetch.
   - Report: p50, p95, p99, timeout rate.
8. **Reconnect recovery time**
   - Metric: disconnect detected -> websocket reconnected -> API authenticated.
   - Report: p50/p95 and failure rate.
9. **Backpressure / queue health**
   - Metric: pending outbound messages, dropped/skipped events, async queue depth peaks.
   - Report: max queue depth, overflow count, event age p95.

### Instrumentation points (minimal code hooks)

1. `Application::loop()`
   - Keep existing `LoopTiming`, but collect histogram/counters instead of only slow-print logs.
2. `Display::loop()`
   - Record `lastDisplayLoopTs`; derive gap histogram (`now - last`).
3. `Display::touchpad_read()`
   - On `PRESSED`, store `lastTouchDownTs` and increment touch counter.
4. Keyboard input handlers (LVGL textarea/keyboard events)
   - On `VALUE_CHANGED`, compute `millis() - lastTouchDownTs` for touch-to-text latency.
5. Display driver flush callback
   - Timestamp before/after `driver->flush(...)`, store duration and area size.
6. API/WebSocket send+receive
   - Add correlation IDs for measured requests (or reuse message IDs).
   - Track send ts, ack ts, response ts.
7. `Application::processState()` and screen transitions
   - Mark transition start/end and originating trigger.
8. Connection state changes
   - Record timestamps for wifi up/down, websocket up/down, API authenticated.

### How to capture data

1. **Binary modes**
   - `perf-baseline`: current code + metrics only.
   - `perf-change-X`: one optimization at a time + same metrics.
2. **Logging format**
   - Emit compact CSV-like lines every 5s (not per event) to avoid perturbation:
   - Example: `PERF,window_ms=5000,ui_gap_p95=...,touch2ui_p95=...,drop_rate=...,nfc_p95=...,state_p95=...,ws_rtt_p95=...,reconnect_p95=...,qdepth_max=...`
3. **Sampling windows**
   - Warmup 10s, then collect 60s steady-state per scenario.

### Test matrix (run each for baseline and each change)

1. **Keyboard stress**
   - On config screen, type 50-100 chars continuously.
2. **Idle with NFC enabled**
   - Same screen, no typing, NFC hardware connected, card absent.
3. **Network disturbance**
   - Trigger reconnect attempts while typing.
4. **Combined worst case**
   - Typing + NFC polling + network reconnect in parallel.
5. **State churn**
   - Rapid resource updates + project/form updates while user interacts.
6. **Server delay/fault injection**
   - Artificial server delay/jitter (e.g. +50/100/300ms), intermittent timeout, reconnect storms.

### Pass/fail targets

1. UI loop gap: p95 < 20ms, p99 < 40ms, max < 100ms.
2. Touch-to-UI: p95 < 80ms, p99 < 120ms.
3. Dropped input: < 1% in 100-tap run (target 0%).
4. No repeated >300ms stalls during 60s run.
5. Request/response RTT p95 < 250ms on healthy LAN test setup.
6. Reconnect-to-authenticated p95 < 5s on transient disconnect test.
7. State transition p95 < 200ms for local transitions; <500ms when server ack required.
8. Zero queue overflow/dropped critical events.

### Mode-specific acceptance (important)

Use different budgets per state category:

1. **UI-reactive states**
   - Must meet strict touch/UI targets above.
   - NFC must remain disabled throughout these scenarios.
2. **NFC-centric states**
   - Allow higher UI latency if card detection/auth reliability improves.
   - Still track max stalls and ensure no watchdog-risk behavior.

### Change-evaluation method

1. Apply **one change only**.
2. Re-run full matrix.
3. Compare against baseline with deltas:
   - `delta_p95_touch2ui`, `delta_drop_rate`, `delta_ui_gap_p99`.
4. Keep change only if:
   - at least one core KPI improves materially,
   - no KPI regresses beyond tolerance (+10% allowed on non-primary KPI).

### Suggested result table template

| Build | Scenario | UI gap p95 (ms) | Touch->UI p95 (ms) | Drop rate (%) | Max stall (ms) | Notes |
|---|---|---:|---:|---:|---:|---|
| baseline | keyboard stress |  |  |  |  |  |
| phase1-nfc-off-config | keyboard stress |  |  |  |  |  |
| phase1-log-info | keyboard stress |  |  |  |  |  |
| phase1-nfc-timeout-short | keyboard stress |  |  |  |  |  |

### Suggested system-level table template

| Build | Scenario | State p95 (ms) | WS RTT p95 (ms) | Reconnect p95 (ms) | Queue max depth | Timeout rate (%) |
|---|---|---:|---:|---:|---:|---:|
| baseline | normal ops |  |  |  |  |  |
| baseline | delay injection 100ms |  |  |  |  |  |
| change-X | normal ops |  |  |  |  |  |
| change-X | delay injection 100ms |  |  |  |  |  |

### Bias controls

1. Same hardware, power supply, firmware config, and display brightness.
2. Same test operator/script and same input pace.
3. Disable extra debug logs except perf aggregator output.
4. Run each scenario at least 3 times; compare median of runs.

## Open questions

1. Is NFC required at all on config/PIN settings screens? If no, disabling there is immediate low-risk gain.
2. Should P4 target run a production profile with drastically reduced logs by default?
3. Are we okay making UI task highest priority (recommended) and treating NFC/API as best-effort background?

## Bottom line

The firmware can be made much smoother without major UI redesign. The biggest gain will come from removing blocking NFC/API/logging behavior from the UI execution path, adding end-to-end telemetry, and validating improvements against both UI and server/state KPIs.
