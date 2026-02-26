# Firmware Architecture Review and Restructure Plan

## Purpose

This document reviews current firmware architecture issues and defines a practical migration plan to a cleaner, maintainable, scalable structure.

Goals:

- reduce interleaved state-machine complexity
- isolate concerns (UI, domain logic, hardware, transport)
- shrink classes/files to focused responsibilities
- make behavior testable without hardware
- keep feature velocity high as complexity grows

---

## Current Architecture Snapshot

Current entry/orchestration path:

- `main.cpp` -> `Application::setup()` / `Application::loop()`
- `Application` coordinates:
  - display and screen transitions
  - NFC polling/auth/enrollment
  - API message handling and callbacks
  - session and timeout logic
  - network/websocket readiness gating
  - firmware update state

Main supporting modules:

- `api/` (protocol parsing + websocket usage + OTA)
- `websocket/` (two implementations: ESP-IDF and P4-native)
- `network/` (wifi/ethernet state machines)
- `display/` (LVGL root + screens)
- `nfc/` (PN532 flow + auth)
- `state/` (global static connectivity/auth state)
- `settings/` (global static config store)

---

## Main Architecture Issues

## 1) God object orchestration (`Application`)

Symptoms:

- one large controller (`application.cpp` ~1158 LOC) owns most app behavior
- mixed responsibilities: state transitions, UI updates, NFC control, API callback wiring, timeout/session policy
- cross-cutting mutable flags (`state`, `externalState`, `unlocked`, `resourceIsSelected`, form/project pending flags)

Impact:

- hard to reason about transition correctness
- fragile changes: small feature tweaks touch many unrelated branches
- high regression risk in state-dependent flows

## 2) Interleaved state machines without explicit contracts

Observed state layers:

- application state (`APPLICATION_STATE_*`)
- external event state (`EXTERNAL_STATE_*`)
- network state (`State::NetworkState`)
- websocket state (`State::WebsocketState`)
- API auth state (`State::ApiState`)
- UI screen state (actual visible screen + screen internals)

Problems:

- transitions are encoded as distributed `if` trees in `processState()`
- no single state-transition table/graph
- side effects and state transitions happen together (e.g., UI transition + hardware enable/disable + API call)

Impact:

- transition conflicts/ordering bugs are likely
- difficult to add new flows (forms, enrollment variants, failover behavior) safely

## 3) Shared global mutable state pattern

`State` and `Settings` use static mutable state and global access.

Problems:

- implicit coupling across modules
- hidden dependencies (hard to know who mutates what)
- weak thread-safety guarantees (multiple tasks exist: loop task, network task, websocket callbacks, async LVGL calls)

Impact:

- race-prone behavior and non-deterministic bugs
- difficult unit testing due to global process state

## 4) Transport/protocol/domain concerns mixed in `API`

`api.cpp` currently mixes:

- websocket lifecycle usage
- protocol parsing/dispatch
- domain command handling
- OTA chunk protocol and partition writes
- callback fan-out to UI/application logic

Impact:

- large blast radius for protocol changes
- OTA complexity entangled with normal event processing
- low cohesion, hard targeted tests

## 5) UI screens contain heavy workflow logic

Example: `resourceDetailsScreen.cpp` (~2158 LOC) mixes:

- view construction
- form schema rendering
- form validation/submission shaping
- project pagination behavior
- action overlay/toast logic

Impact:

- difficult to reuse/test independently
- UI code owns behavior that should be in presentation/use-case layer

## 6) Variant handling via compile-time branching inside core paths

Large `#ifdef` branching in central modules (`Application`, `Websocket`, `Network`).

Impact:

- behavior divergence grows over time
- one variant fix can silently break others
- code readability and navigation degrade

## 7) Blocking operations on interactive path

Research doc already identified responsiveness issues when blocking work runs near UI loop (`TOUCH_RENDER_PERFORMANCE_RESEARCH.md`).

Impact:

- missed touches and lag
- timing-sensitive bugs under network/NFC load

## 8) File/class size and ownership boundaries

Several core files are very large (`application.cpp`, `api.cpp`, `resourceDetailsScreen.cpp`, NFC driver wrapper layers).

Impact:

- high cognitive load
- slow onboarding
- low confidence refactoring

---

## Target Architecture (Recommended)

Adopt layered architecture with event-driven orchestration:

1. **Platform layer (HAL/Drivers)**
   - NFC, display driver, wifi/ethernet adapter, websocket adapter, storage adapter
2. **Infrastructure layer**
   - protocol codecs, repositories, OTA service, logging/metrics, scheduler abstractions
3. **Domain layer**
   - explicit use-cases and state machines (session, enrollment, authentication, connectivity)
4. **Presentation layer**
   - screen presenters/view-models and thin LVGL views
5. **Application composition**
   - wiring/DI and task startup only

Core rule:

- UI does not call NFC/API directly.
- UI dispatches intents -> domain use-cases.
- domain emits events/state -> presenter updates views.

---

## Proposed Module Split

Suggested structure:

- `src/app/`
  - `AppBootstrap.*` (setup/wiring)
  - `TaskRunner.*` (task start/stop)
- `src/domain/`
  - `session/SessionStateMachine.*`
  - `auth/AuthStateMachine.*`
  - `enrollment/EnrollmentFlow.*`
  - `resource/ResourceSelectionFlow.*`
  - `events/AppEvent.*`
- `src/usecases/`
  - `AuthenticateCardUseCase.*`
  - `StartSessionUseCase.*`
  - `StopSessionUseCase.*`
  - `DoorControlUseCase.*`
  - `FetchProjectsUseCase.*`
- `src/infrastructure/`
  - `protocol/EventRouter.*`
  - `protocol/MessageCodec.*`
  - `ota/OtaUpdateService.*`
  - `repositories/SettingsRepository.*`
  - `repositories/RuntimeStateStore.*`
- `src/platform/`
  - `nfc/NfcAdapter.*`
  - `net/NetworkAdapter.*`
  - `ws/WebsocketClient.*`
  - `display/LvglDisplayRuntime.*`
- `src/presentation/`
  - `presenters/ResourceDetailsPresenter.*`
  - `presenters/ResourceListPresenter.*`
  - `views/lvgl/...` (screen widgets only)

---

## State Machine Strategy

Replace implicit branching with explicit transition tables.

Implement:

- one primary app flow machine (high-level mode)
- sub-state machines per bounded context:
  - connectivity
  - card/authentication
  - session/action
  - enrollment

Each machine must define:

- states
- events
- guards
- side effects (commands)
- deterministic transition function

Side effects run via effect handlers, not inline in transition logic.

---

## Concurrency and Eventing Model

Introduce internal event bus (queue-based, fixed-size, bounded).

Recommended tasks:

- `UiTask` (high priority): LVGL tick + render + presenter application
- `DomainTask` (medium): state machines + use-cases
- `IoTask` (medium/low): websocket/network/nfc adapters

Communication:

- adapters publish typed events (`CardDetected`, `WsConnected`, `ResourceListUpdated`, ...)
- domain consumes events and emits state updates/intents
- presenters consume domain state changes and update views

Rules:

- no blocking I/O in `UiTask`
- no direct LVGL calls outside UI context (except queued/async marshaling)

---

## File/Class Size Guidelines (Enforced)

- target file size: <= 300 LOC (hard max 500 for exceptional files)
- target class responsibility: one bounded purpose
- max public methods per class: ~12 guideline
- split by behavior, not by technical type only

When a file grows >500 LOC:

- mandatory split ticket in backlog
- no new unrelated features added before split

---

## Coding Standards for Maintainability

- prefer explicit interfaces over global static access
- avoid hidden mutable singletons for runtime behavior
- one direction dependencies: `presentation -> domain -> infra -> platform`
- move compile-time variant branching behind adapter interfaces
- every async callback must document thread/task context
- reduce logging in hot paths; structured periodic metrics preferred

---

## Testing Strategy to Support the Refactor

Minimum test pyramid:

- unit tests:
  - state machine transition tests
  - use-case tests with mocked adapters
  - protocol parse/serialize tests
- integration tests:
  - websocket message flow -> domain events
  - NFC event -> auth/session outcome
- hardware/system tests:
  - UI responsiveness under NFC/network load
  - reconnect and OTA flows

Key requirement:

- domain layer must compile and run tests on host without hardware.

---

## Incremental Migration Plan

## Phase 0 - Baseline and safety nets (1-2 days)

- add architecture diagrams (current and target)
- capture current behavior contracts (critical flows)
- add high-level smoke tests/checklists for:
  - boot/config
  - auth + resource selection
  - start/stop session
  - enrollment
  - OTA initiation/progress

## Phase 1 - Introduce seams without behavior changes (2-4 days)

- extract interfaces:
  - `INfcService`, `ITransport`, `ISettingsRepository`, `IViewGateway`
- wrap existing static/global modules behind adapters
- keep old logic but route access through interfaces

Outcome: future refactors no longer depend on global concrete types.

## Phase 2 - Extract domain state machines (4-7 days)

- implement `AppFlowStateMachine` and `SessionStateMachine`
- port `processState()` rules into transition tables
- keep existing UI screens but drive them via emitted state

Outcome: transition logic centralized and testable.

## Phase 3 - Split `API` into transport/protocol/use-cases (3-6 days)

- isolate websocket transport client
- isolate message codec/router
- isolate OTA update service
- map protocol events to domain events

Outcome: protocol and OTA changes become localized.

## Phase 4 - Presenter/View-model layer for screens (5-10 days)

- split `ResourceDetailsScreen`:
  - pure LVGL view
  - presenter for projects/forms/actions/session timer
- apply same to resource list + config screens

Outcome: much smaller screen classes; logic reusable and testable.

## Phase 5 - Concurrency hardening (3-5 days)

- move blocking NFC/API operations fully off UI path
- enforce queue-based cross-task boundaries
- add task-context assertions for UI calls

Outcome: responsiveness and determinism improve substantially.

## Phase 6 - Variant cleanup (2-4 days)

- replace core `#ifdef` branching with variant-specific adapters/factories
- keep shared domain logic variant-agnostic

Outcome: adding new board/variant no longer touches core app flow heavily.

---

## Priority Refactor Backlog (Top 10)

1. split `Application` into `AppController` + domain state machines
2. remove direct `Display::*` calls from domain logic
3. split `api.cpp` into router/codec/ota services
4. create typed app event model (replace scattered callback flags)
5. isolate global `State` behind `RuntimeStateStore` with controlled mutation
6. isolate `Settings` as repository interface
7. split `ResourceDetailsScreen` presenter vs view
8. centralize timeout/session policy in one service
9. move enrollment flow out of generic `processState` branches
10. enforce file size and ownership boundaries in PR review

---

## Definition of Done (Architecture Refactor)

Refactor considered successful when:

- no single orchestration file exceeds 500 LOC in core flows
- primary flow transitions are covered by unit tests
- UI no longer blocks on NFC/API operations
- protocol handling and OTA are isolated modules
- screen classes are mostly view construction/render updates
- variant-specific behavior resides in adapter layer, not domain logic

---

## Immediate Next Step (Recommended)

Start with Phase 1 + Phase 2 only:

- create interfaces and extract `AppFlowStateMachine`
- keep behavior identical
- validate with current hardware test checklist

This gives biggest maintainability gain with lowest regression risk.
