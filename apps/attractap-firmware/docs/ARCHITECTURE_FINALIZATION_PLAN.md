# Attractap Firmware Architecture Finalization Plan

## Goal

Close all remaining gaps between the current migrated state and the intended end-state architecture:

- `AppKernel` owns startup/lifecycle wiring.
- `EventBus` is the typed cross-module boundary.
- Domain controllers own transition logic and emit commands.
- Ports/adapters fully isolate side effects.
- Runtime workers live under `app/runtime`, not `Application`.

## Why this follow-up exists

The previous plan completed the vertical-slice migration phases, but did not fully realize the structural end-state. In particular, `kernel/` and `events/` remain scaffold-only, and orchestration/runtime ownership still lives in `Application`.

## Current State Snapshot (verified)

What exists:

- Domain controllers in `app/domain/*`.
- Ports/adapters for NFC/API/UI in `app/ports/*` and `app/adapters/*`.
- Worker tasks and app event queue behavior implemented.
- `processState` split into domain-scoped handlers.

What is still missing:

- No concrete `app/kernel` implementation.
- No typed `app/events` module implementation.
- Runtime queue/task ownership still inside `Application`.
- `Application` still owns large shared state and event dispatch plumbing.
- Several side effects still bypass port boundaries (settings/network/time/logger/beeper/task primitives).

## Gap Inventory

1) **Kernel gap**
- `app/kernel/` is empty.
- `main.cpp` instantiates `Application` directly; no `AppKernel` composition root.

2) **Event bus gap**
- `app/events/` is empty.
- `Application` uses internal `AppEventType` + `void*` queue payloads instead of typed event contracts.

3) **Runtime ownership gap**
- `networkTask`, `apiTask`, `nfcTask`, queue creation, queue health logging, and callback-to-event marshalling live in `Application`.
- `app/runtime/` only contains telemetry helper.

4) **Boundary gap**
- Domain decisions are extracted, but command execution still mostly in `Application`.
- `Application` still holds domain state (`selectedResourceId`, pending action/form state, auth/update external states, etc.).

5) **Port completeness gap**
- Missing explicit ports for settings/storage, beeper, timing/clock, scheduler/task/queue, connectivity status provider, and logging.
- Static/global calls remain (`Settings::*`, `State::*`, `Network::loop`, FreeRTOS queue/task APIs, some direct utility use).

6) **Cleanup gap**
- Legacy modules still contain mixed responsibilities and are not yet reorganized to final ownership model.
- `app/README.md` still describes scaffold-only phase-0 context.

7) **Verification gap**
- No explicit architecture-conformance tests (event routing, reducer determinism, queue contract tests).
- No final acceptance gate that proves `Application` is wiring-only.

## Finalization Phases

### Phase A - Contract freeze and architecture invariants

Status: `Done`

Scope:

- Define final boundaries in code comments/docs:
  - what belongs in kernel, events, runtime, controllers, adapters.
- Add architecture invariants checklist (for PR review and CI).
- Update `app/README.md` to reflect post-scaffold reality.

Acceptance:

- Invariants documented and agreed.
- New/updated docs match actual repo structure and intended target.

---

### Phase B - Implement typed EventBus module

Status: `Done`

Scope:

- Create `app/events` concrete implementation:
  - typed event structs (no `void*` payload API at call sites),
  - publish/subscribe API,
  - queue/backpressure policy.
- Replace `Application::AppEventType` and `AppEvent` with typed event bus usage.
- Move queue metrics into event bus/runtime telemetry.

Acceptance:

- No `AppEventType` enum or `void*` app-event payload handling in `Application`.
- Event contracts live under `app/events`.
- Build and runtime behavior parity preserved.

---

### Phase C - Introduce AppKernel composition root

Status: `Done`

Scope:

- Implement `AppKernel` under `app/kernel`:
  - instantiate controllers, adapters, runtime services, and event bus,
  - own setup/start/loop lifecycle.
- Update `main.cpp` to depend on `AppKernel` instead of `Application`.
- Keep a compatibility wrapper only if needed temporarily.

Acceptance:

- `main.cpp` creates kernel, not `Application`.
- Startup wiring centralized in kernel.

---

### Phase D - Move runtime workers out of Application

Status: `Done`

Scope:

- Move task functions and creation (`network/api/nfc`) into `app/runtime`.
- Runtime publishes events to EventBus directly.
- Remove task/queue creation and task helper methods from `Application`.

Acceptance:

- No `xTaskCreate*` or queue creation in `Application`.
- Runtime folder owns worker lifecycle and queue mechanics.

---

### Phase E - Port completion + side-effect isolation

Status: `Done`

Scope:

- Add missing ports + adapters:
  - settings/storage,
  - beeper,
  - clock/timers,
  - connectivity snapshot source,
  - scheduler/queue abstraction (if needed for testability).
- Replace remaining static/global direct calls in orchestration logic.

Acceptance:

- Domain flow logic depends on interfaces, not globals/statics.
- Side effects routed through adapters/ports.

---

### Phase F - Shift orchestration ownership from Application

Status: `Not started`

Scope:

- Move event handling and transition coordination to kernel/domain runtime handlers.
- Reduce `Application` to minimal facade or retire it.
- Ensure controllers receive typed inputs and emit commands/events, not UI/network calls.

Acceptance:

- `Application` is wiring-only or removed.
- No business transition state machine logic remains in `Application`.

---

### Phase G - Structural cleanup, tests, and final docs

Status: `Not started`

Scope:

- Remove obsolete legacy glue and dead compatibility paths.
- Add architecture tests:
  - reducer/controller deterministic tests,
  - event routing tests,
  - runtime queue/backpressure tests.
- Finalize architecture docs and migration record.

Acceptance:

- Final target architecture represented in both code and docs.
- CI includes architecture-level verification.
- End-to-end smoke checks pass (boot/auth/resource/forms/reconnect/fw-update).

## Progress Tracker

Update this table as work lands.

| Phase | Owner | Status | Start date | End date | Notes |
| ----- | ----- | ------ | ---------- | -------- | ----- |
| A     | Codex + Jappy | Done | 2026-02-27 | 2026-02-27 | Contract/docs finalized and architecture invariants aligned for finalization. |
| B     | Codex + Jappy | Done | 2026-02-27 | 2026-02-27 | Added typed EventBus in `app/events` and removed `Application` app-event enum/void* payload API. |
| C     | Codex + Jappy | Done | 2026-02-27 | 2026-02-27 | Added `AppKernel` and switched `main.cpp` lifecycle wiring to kernel. |
| D     | Codex + Jappy | Done | 2026-02-27 | 2026-02-27 | Added `app/runtime/runtime_workers.*`; `Application` now delegates worker task lifecycle to runtime. |
| E     | Codex + Jappy | Done | 2026-02-27 | 2026-02-27 | Added ports/adapters for settings/system/beeper/network/serial/connectivity-state; orchestration no longer uses static globals directly. |
| F     | Codex + Jappy | Not started |            |          |       |
| G     | Codex + Jappy | Not started |            |          |       |

## Progress Notes

### 2026-02-27

- Created finalization follow-up plan to close remaining architecture gaps after phase-based migration.
- Added full gap inventory and A-G implementation phases with acceptance criteria.
- Added progress tracker and notes sections for ongoing status updates.
- Implemented concrete `app/events/event_bus.hpp` typed contracts + queue/backpressure + health metrics.
- Implemented concrete `app/kernel/app_kernel.{hpp,cpp}` composition root and lifecycle ownership.
- Rewired `Application` callback marshalling to EventBus publish/subscribe handlers.
- Updated websocket task stack (`websocket_cfg.task_stack=16384`) to prevent canary overflow during websocket resource-list callback path.
- Implemented `app/runtime/runtime_workers.{hpp,cpp}` for `network/api/nfc` task ownership and moved `xTaskCreate` calls out of `Application`.
- Started Phase E by adding `app/ports/{settings_port,system_port}.hpp` + adapters and routing `Application` through those interfaces for settings persistence and timing/restart side effects.
- Continued Phase E by adding `app/ports/beeper_port.hpp` + `app/adapters/beeper_adapter.hpp` and routing `Application` beeping through `IBeeperPort`.
- Completed Phase E with `network`, `serial-command`, and `connectivity-state` ports/adapters; removed remaining direct `Network::`, `SerialCommandHandler::`, and `State::` calls from orchestration/runtime logic.

## Execution Rules

- No feature flags.
- Keep firmware shippable after each phase.
- Do not merge next phase before acceptance of current phase.
- Preserve current runtime behavior while moving ownership boundaries.

## Suggested Order of Work

1. A -> B first (contracts and event substrate)
2. C -> D (kernel + runtime extraction)
3. E -> F (boundary completion + orchestration retirement)
4. G final (cleanup/tests/docs lock-in)

## Final Acceptance Checklist

- `app/kernel` contains active lifecycle wiring implementation.
- `app/events` contains typed event contracts + bus implementation.
- `app/runtime` owns worker task lifecycle.
- Domain controllers own transitions; orchestration is not monolithic.
- `Application` no longer holds primary business orchestration state.
- Build + flash validation succeeds on active target.
- Architecture docs reflect actual code structure.
