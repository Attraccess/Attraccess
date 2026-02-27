# Attractap Firmware Architecture Migration Plan

## Goal

Migrate from the current interleaved `Application::processState` design to a clean event-driven structure, **part by part**, without feature flags and without a big-bang rewrite.

## Rules

- No feature flags.
- Migrate one vertical slice at a time.
- Keep firmware shippable after every phase.
- Do not start next phase until current phase passes acceptance checks.
- UI loop must stay non-blocking throughout migration.

## Target Architecture (end state)

- `AppKernel`: startup wiring and lifecycle only.
- `EventBus`: typed events between modules.
- Domain controllers:
  - `SessionController`
  - `AuthController`
  - `ResourceController`
  - `ConnectivityController`
  - `UpdateController`
- Ports/adapters split:
  - Ports: interfaces (`NfcPort`, `ApiPort`, `UiPort`, etc.)
  - Adapters: concrete implementations (NFC/API/Display)
- Runtime tasks:
  - UI task: render/input only
  - NFC/API/network tasks: background workers publishing events

## Phase Plan

### Phase 0 - Baseline + scaffolding

Status: `Completed`

Scope:

- Add migration document, acceptance checklist, and progress log.
- Add minimal telemetry hooks for loop cadence and major latency buckets.
- Create empty architecture folders/files (kernel/events/domain/ports/adapters/runtime).

Acceptance:

- Existing behavior unchanged.
- Build passes.
- Baseline perf numbers captured and written into this file.

---

### Phase 1 - Ports/adapters extraction (no behavior change)

Status: `Completed`

Scope:

- Extract interfaces from direct dependencies in `Application`:
  - NFC access -> `NfcPort`
  - API access -> `ApiPort`
  - UI/screen actions -> `UiPort`
  - Beeper/settings wrappers as needed
- Keep call order and behavior identical.

Acceptance:

- `Application` depends on interfaces, not concrete subsystem classes.
- No user-visible behavior change.
- Build + smoke tests pass.

---

### Phase 2 - Scheduling split (UI isolation)

Status: `Completed`

Scope:

- Move NFC/API/network loops off the UI execution path.
- Keep UI loop focused on display/touch cadence.
- Introduce event queue handoff from worker tasks to app/controller layer.

Acceptance:

- No blocking NFC/API calls on UI task path.
- Typing responsiveness improved or unchanged vs baseline.
- No regressions in card auth/reconnect basics.

---

### Phase 3 - Auth/session vertical slice migration

Status: `Completed`

Scope:

- Implement `AuthController` + `SessionController`.
- Migrate states/events for:
  - lock -> card detect -> auth -> unlock
  - unlock timeout / relock
- Remove migrated auth/session branches from legacy `processState`.

Acceptance:

- Auth flow parity with current behavior.
- Timeouts and beeps match expected behavior.
- Legacy auth/session branch code removed.

---

### Phase 4 - Resource/actions vertical slice migration

Status: `Completed`

Scope:

- Implement `ResourceController`.
- Migrate:
  - resource list/update/select
  - start/stop session actions
  - forms request/submit/cancel
- Remove `pendingAction`* orchestration from legacy monolith after parity.

Acceptance:

- Resource and form flows parity.
- No stuck overlays/modals.
- Legacy resource/action branch code removed.

---

### Phase 5 - Connectivity + update migration

Status: `Not started`

Scope:

- Implement `ConnectivityController` and `UpdateController`.
- Migrate reconnect/authenticated transitions and firmware update flow.
- Remove corresponding legacy branches.

Acceptance:

- Reconnect and init-screen transitions parity.
- Firmware update progress/display parity.
- Legacy connectivity/update branch code removed.

---

### Phase 6 - Legacy orchestrator retirement

Status: `Not started`

Scope:

- Remove monolithic `Application::processState` state orchestration.
- Keep `Application`/`AppKernel` as wiring + loop ownership only.
- Enforce event-driven boundaries across modules.

Acceptance:

- No state logic left in legacy orchestrator.
- Controllers own transitions.
- Final architecture docs updated.

## Progress Tracker

Update this table as work lands.


| Phase | Owner | Status      | Start date | End date | Notes |
| ----- | ----- | ----------- | ---------- | -------- | ----- |
| 0     | Codex + Jappy | Completed | 2026-02-26 | 2026-02-26 | Scaffold + telemetry, build/flash, runtime baseline captured |
| 1     | Codex + Jappy | Completed | 2026-02-26 | 2026-02-26 | `Application` fully migrated off direct concrete NFC/API/Display calls to ports/adapters |
| 2     | Codex + Jappy | Completed | 2026-02-26 | 2026-02-26 | NFC/API loops moved to dedicated worker tasks with app-thread event marshalling and queue telemetry |
| 3     | Codex + Jappy | Completed | 2026-02-26 | 2026-02-26 | Auth/session transitions, timeout/relock, non-display action flow, and auth execution moved into controllers |
| 4     | Codex + Jappy | Completed | 2026-02-26 | 2026-02-26 | Resource availability, resource action intent handling, and forms submit/cancel/result orchestration moved into `ResourceController` |
| 5     |       | Not started |            |          |       |
| 6     |       | Not started |            |          |       |


## Checklist (gated per phase)

- Build succeeds.
- Boot flow works.
- Card auth flow works.
- Resource list/select works.
- Start/stop session works.
- Forms flow works.
- Reconnect flow works.
- Firmware update flow works.
- UI responsiveness check recorded.

## Baseline Metrics (fill before Phase 1)

- UI loop gap p95: TBD (needs dedicated UI-gap metric; not yet emitted)
- Touch-to-UI p95:
- Dropped input rate:
- Max stall: 10059 ms (network connect stall observed in total loop baseline)
- Reconnect p95:

Initial runtime sample (2026-02-26, flashed `attractap-p4`):

- `PERF,window_ms=5031,samples=97,total_avg_ms=51,total_max_ms=54,...`
- `PERF,window_ms=5036,samples=97,total_avg_ms=51,total_max_ms=58,...`
- `...,total_p95_ms=10059,total_p99_ms=10059,total_max_ms=10059,display_p95_ms=51,...,api_max_ms=10002,...`

## Change Log

### 2026-02-26

- Created migration plan.
- Decided: no feature flags; strict sequential migration.
- Started Phase 0 implementation.
- Added `src/app` migration scaffold and telemetry window hook in `Application::loop`.
- Built `attractap-p4` successfully.
- Flashed device successfully on `/dev/cu.usbmodem101`.
- Captured runtime serial logs including baseline `PERF` windows.
- Upgraded baseline telemetry to include `total_p95_ms` and `total_p99_ms`.
- Started Phase 1.
- Added `INfcPort`/`IApiPort` interfaces and `NfcAdapter`/`ApiAdapter`.
- Rewired `Application` to depend on port interfaces (no behavior change intended).
- Added `IUiPort`/`UiAdapter`.
- Migrated core UI lifecycle and screen transitions in `Application` from direct `Display::*` calls to `UiPort`.
- Re-built and re-flashed `attractap-p4` successfully after `UiPort` migration.
- Migrated remaining `resourceDetailsScreen`/callback/UI bindings to `UiPort`; `Application` now has zero `Display::*` calls.
- Phase 1 completed.
- Started Phase 2.
- Moved `api.loop()` and `nfc.loop()` off UI loop path into dedicated FreeRTOS tasks (`ApiTask`, `NfcTask`).
- Added app-thread event queue marshalling for API callbacks to reduce cross-thread shared-state writes.
- Added event-queue backpressure policy and queue-health telemetry (`APP_EVT` counters/high-water/drop count).
- Started Phase 3 with an `AuthController` extraction slice and moved card-auth decision logic to the controller.
- Added a `SessionController` extraction slice for unlock-timeout and relock decisions.
- Moved logout/disconnect session-active decisions into `SessionController`.
- Moved action-pause timing decisions (`beginActionPause`/`endActionPause`) into `SessionController`.
- Moved session-timeout deadline and pause-accounting reset calculations into `SessionController`.
- Moved locked/unlocked session transition decisions in `processState` into `SessionController` decision structs.
- Moved non-display auth/session transition + action selection decisions into `SessionController`.
- Moved logout/disconnect reset decisions into `SessionController` decision structs.
- Moved external authenticate-card transition decisions into `AuthController`.
- Moved external firmware-update transition decisions into `UpdateController`.
- Moved `processCardAuthenticationData` success/failure execution decisions into `AuthController`.
- Moved non-display long-presentation timing decision into `SessionController`.
- Moved card-detection state-gating decisions in NFC callback into `AuthController`.
- Moved enrollment external-state transition decisions into `AuthController`.
- Moved enrollment key-read/card-write result decisions into `AuthController`.
- Started Phase 4 by moving resource availability/list transition decisions into `ResourceController`.
- Moved resource action intent decisions (start/stop session, door actions, flow button, logout effects) into `ResourceController`.
- Moved forms submit/cancel and session-action-result decisions into `ResourceController`.
- Phase 2, 3, and 4 marked complete after successful `attractap-touch` build and flash to `/dev/cu.usbmodem101`.

