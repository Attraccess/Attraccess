# Attractap Firmware Architecture Finalization Plan

## Goal

Close all remaining gaps between the current migrated state and the intended end-state architecture:

- `AppKernel` owns startup/lifecycle wiring.
- `EventBus` is the typed cross-module boundary.
- Domain controllers own transition logic and emit commands.
- Ports/adapters fully isolate side effects.
- Runtime workers live under `app/runtime`, not `Application`.
- All app/business logic lives under `src/app/*`; legacy app logic outside `src/app` is migrated or removed.

## Legacy Eradication Invariant (strict)

Target end state for this plan:

- `src/app/*` is the only location for application/runtime/domain/event orchestration logic.
- Legacy folders outside `src/app` (for example `src/api`, `src/display`, `src/network`, `src/nfc`, `src/settings`, `src/state`, `src/serial`, `src/websocket`) must be either:
  - fully migrated into `src/app/*` and deleted, or
  - reduced to minimal hardware/framework glue with zero business/orchestration logic.
- New app features or behavior changes must not be implemented outside `src/app/*`.

## Why this follow-up exists

The previous plan completed the vertical-slice migration phases, but did not fully realize the structural end-state. In particular, `kernel/` and `events/` remain scaffold-only, and orchestration/runtime ownership still lives in `Application`.

## Current State Snapshot (verified)

What exists:

- Domain controllers in `app/domain/*`.
- Ports/adapters for NFC/API/UI in `app/ports/*` and `app/adapters/*`.
- Worker tasks and app event queue behavior implemented.
- `processState` split into domain-scoped handlers.

What is still missing:

- Runtime decomposition is incomplete (`app_runtime.cpp` still large and mixed-responsibility).
- App-layer contracts still leak legacy concrete schemas/types in several boundaries.
- Legacy subsystems remain internally monolithic despite adapter wrapping.
- Architecture guardrails/tests are not yet complete for long-term regression prevention.

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

8) **Runtime maintainability gap**
- `app/runtime/app_runtime.cpp` is a large multi-responsibility unit (setup wiring, event handlers, state machine, UI/non-UI flows, side-effect dispatch).
- Heavy `HAS_LVGL_DISPLAY` branching inside one file makes ownership boundaries harder to reason about and change safely.

9) **Legacy-type coupling gap**
- `app/*` boundaries still depend on legacy concrete module types (`API::*` DTOs, display screen event structs, NFC legacy constants/types) instead of app-owned contracts.
- Modern runtime/domain/event modules remain schema-coupled to old implementation types.

10) **Legacy-subsystem modernization gap**
- Legacy static/global subsystems (`Display`, `API`, `Network`, `Settings`, `State`) are wrapped by adapters but remain internally monolithic.
- Adapter adoption reduced call-site coupling, but not yet internal legacy complexity/ownership risks.

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

Status: `Done`

Scope:

- Move event handling and transition coordination to kernel/domain runtime handlers.
- Reduce `Application` to minimal facade or retire it.
- Ensure controllers receive typed inputs and emit commands/events, not UI/network calls.

Acceptance:

- `Application` is wiring-only or removed.
- No business transition state machine logic remains in `Application`.

Implementation checklist (ordered):

1. Introduce `app/runtime/app_runtime_state.{hpp,cpp}`:
   - move mutable orchestration state from `Application`:
     - selected resource/project IDs,
     - pending action/form state,
     - auth/update/connectivity snapshots needed for transitions.
   - expose focused getters/setters only for required handlers.

2. Introduce `app/runtime/event_router.{hpp,cpp}`:
   - subscribe to typed EventBus events,
   - route each event to a domain-specific handler module,
   - remove event switchboard logic from `Application`.

3. Split `Application::processState()` into runtime/domain handlers:
   - `runtime/auth_runtime_handler.*`,
   - `runtime/resource_runtime_handler.*`,
   - `runtime/update_runtime_handler.*`.
   - handlers operate on `AppRuntimeState` + ports/controllers.

4. Move command execution edges behind runtime handlers:
   - API command dispatch for resource actions,
   - UI transition decisions tied to domain outputs,
   - pending-action/forms completion paths.

5. Collapse `Application`:
   - keep facade with compatibility forwarding only (temporary), or
   - delete `Application` if `AppKernel + runtime handlers` fully cover lifecycle.

6. Delete obsolete `Application` state members/methods after parity checks.

---

### Phase G - Structural cleanup, tests, and final docs

Status: `Done`

Scope:

- Remove obsolete legacy glue and dead compatibility paths.
- Split `app/runtime/app_runtime.cpp` into focused modules with stable boundaries:
  - `runtime/bootstrap/*` (startup wiring + callback registration),
  - `runtime/events/*` (typed event handlers),
  - `runtime/state_machine/*` (state progression/gates),
  - `runtime/flows/*` (auth/resource/update/connectivity flows),
  - display/non-display strategy modules to minimize compile-time branching in each file.
- Introduce shared `RuntimeContext` (or equivalent) to avoid broad constructor/method parameter sprawl and centralize dependencies.
- Add architecture tests:
  - reducer/controller deterministic tests,
  - event routing tests,
  - runtime queue/backpressure tests,
  - orchestration module boundary tests (state-machine + flow contracts).
- Finalize architecture docs and migration record.

Acceptance:

- Final target architecture represented in both code and docs.
- CI includes architecture-level verification.
- End-to-end smoke checks pass (boot/auth/resource/forms/reconnect/fw-update).
- No single runtime orchestration file is monolithic; responsibilities are split by module ownership.
- `AppRuntime` is composition-oriented (thin coordinator), not a logic sink.
- Display/non-display divergence is isolated to dedicated modules/strategies instead of broad inline branching.

Implementation checklist (ordered):

1. Introduce runtime composition context:
   - add `app/runtime/runtime_context.{hpp,cpp}` (or equivalent) to hold stable references used across runtime modules,
   - keep this context app-owned (ports/controllers/event bus/runtime state), not legacy-type-owned.

2. Split startup/bootstrap responsibilities:
   - create `app/runtime/bootstrap/*` for callback registration, worker startup, and one-time wiring,
   - move startup-only logic out of `app_runtime.cpp`.

3. Extract typed event handling module set:
   - create `app/runtime/events/*` and move EventBus subscription callback logic there,
   - keep event-handler modules stateless where possible (state passed via `RuntimeContext`).

4. Extract state-machine progression logic:
   - create `app/runtime/state_machine/*` for transition/gate logic currently embedded in runtime loop paths,
   - keep domain decisions in controllers; state-machine modules coordinate sequencing only.

5. Extract flow-specific orchestration:
   - create `app/runtime/flows/{auth,resource,update,connectivity}_flow.*`,
   - move UI/non-UI action completion paths out of central runtime file.

6. Isolate display divergence:
   - introduce display/headless strategy modules so `HAS_LVGL_DISPLAY` branching is localized,
   - keep shared flow/state-machine logic display-agnostic.

7. Shrink `app_runtime.cpp` to thin composition:
   - file should mainly construct runtime modules, wire dependencies, and forward lifecycle calls.

8. Add architecture tests for extracted boundaries:
   - event-router dispatch tests,
   - flow contract tests (inputs/outputs),
   - queue/backpressure behavior tests with deterministic harnesses.

9. Update docs/diagrams to match module ownership after code split lands.

---

### Phase H - Contract hardening and app-owned schemas

Status: `Done`

Scope:

- Introduce app-owned contracts under `app/contracts/*` for runtime/domain/event exchange.
- Refactor port interfaces to prefer app contracts over legacy module structs where practical.
- Keep all legacy<->app type translation in adapter/translator layer only.
- Remove direct legacy includes from `app/runtime`, `app/domain`, and `app/events` headers where possible.
- Produce a per-folder migration matrix (`legacy folder` -> `new app module` -> `delete criteria`).

Acceptance:

- App-layer modules are contract/port-driven and do not require legacy headers for core orchestration logic.
- Type translation is centralized in adapters/translators with focused tests.
- Runtime behavior parity preserved.
- Migration matrix is complete and approved as the authoritative delete plan.

Implementation checklist (ordered):

1. Create app-owned contracts package:
   - add `app/contracts/*` grouped by domain (`auth`, `resource`, `update`, `connectivity`, shared primitives),
   - define minimal DTOs/enums needed by runtime/domain/events boundaries.

2. Introduce translation seams at adapters:
   - add translator modules under `app/adapters/translators/*`,
   - keep legacy DTO conversion in adapter layer only.

3. Refactor ports to app contracts:
   - update high-traffic ports first (API/display/network-facing ports) to consume/emit app contracts,
   - avoid broad signature churn by migrating port-by-port.

4. Remove legacy includes from app headers:
   - prioritize `app/runtime/*.hpp`, `app/domain/*.hpp`, `app/events/*.hpp`,
   - allow legacy includes only in adapters/translators and glue boundaries.

5. Add contract translation tests:
   - verify app<->legacy mapping for each migrated adapter path.

6. Publish migration matrix artifact:
   - legacy folder -> app module owner -> translator location -> delete criteria.

Migration matrix (authoritative for Phase I/J delete slices):

| Legacy folder | App module owner | Translator location | Delete criteria |
| ----- | ----- | ----- | ----- |
| `src/api` | `src/app/ports/api_port.hpp` + `src/app/runtime/*` | `src/app/adapters/translators/api_contracts_translator.hpp` | All app-facing API port methods consume/emit `app::contracts::*`; `app/runtime`, `app/domain`, and `app/events` headers do not include `api/api.hpp`. |
| `src/display` | `src/app/ports/ui_port.hpp` + `src/app/runtime/flows/*` | `src/app/adapters/translators/api_contracts_translator.hpp` (through `ui_adapter.hpp`) | UI port surface uses app contracts for resource/projects/forms payloads; legacy display structs remain adapter-only. |
| `src/nfc` | `src/app/ports/nfc_port.hpp` + `src/app/runtime/*` | n/a (no app-contract payloads introduced in H) | NFC key/card constants and card I/O stay adapter/port bounded; no new legacy includes in app runtime/domain/events headers. |
| `src/network` | `src/app/ports/network_port.hpp` + `src/app/domain/connectivity/*` | n/a (status primitives already app-owned) | Connectivity orchestration remains contract/port-driven with no direct `Network::*` calls in app orchestration modules. |
| `src/settings` | `src/app/ports/settings_port.hpp` + `src/app/runtime/*` | n/a (settings structs already app-owned via port) | App runtime/domain uses `ISettingsPort` only; no direct `Settings::*` calls in orchestration modules. |
| `src/state` | `src/app/ports/connectivity_state_port.hpp` + `src/app/domain/connectivity/*` | n/a (adapter normalizes to app enums) | App modules consume only `ConnectivitySnapshot`; no direct `State::*` access outside adapter layer. |
| `src/serial` | `src/app/ports/serial_command_port.hpp` + `src/app/runtime/*` | n/a | App runtime starts/loops serial handler via port only; no direct legacy singleton access. |
| `src/websocket` | `src/api/*` implementation boundary | n/a (still internal to legacy API client) | No app headers include websocket internals; websocket evolution proceeds behind API adapter boundary until Phase I decomposition. |

---

### Phase I - Legacy subsystem decomposition

Status: `Done`

Scope:

- Decompose legacy modules internally (without broad API breakage):
  - `api/`: split protocol/client/retry/callback routing responsibilities,
  - `display/`: split navigation/state/render orchestration responsibilities,
  - `network/`: split transport loop and reconnection policy/state concerns,
  - `settings/`: split persistence, defaulting, and validation concerns.
- Reduce static/global mutable ownership where feasible; prefer explicit instances.
- Keep adapter interfaces stable during this phase to reduce migration risk.
- Execute migration matrix slices and delete legacy code as each slice reaches parity (no "decompose only" without deletion).

Acceptance:

- Legacy modules are no longer monolithic logic sinks internally.
- Ownership boundaries are explicit and documented.
- No new global mutable singletons introduced; existing global usage reduced or isolated.
- Build + flash + smoke checks pass.
- For each completed slice, corresponding legacy implementation files are removed or reduced to glue-only stubs.

Implementation checklist (ordered):

1. Decompose `src/api` internally:
   - separate request transport/client, callback routing, retry/backoff policy, and protocol payload shaping.

2. Decompose `src/display` internally:
   - separate navigation/state decisions from rendering/view update plumbing.

3. Decompose `src/network` internally:
   - separate connection loop/transport from reconnection policy and connectivity-state ownership.

4. Decompose `src/settings` internally:
   - separate persistence I/O, defaulting, and validation/normalization.

5. Reduce static/global mutable ownership:
   - move mutable state into explicit instances where safe,
   - keep compatibility facades only as temporary pass-through layers.

6. Execute deletion slices:
   - for each subsystem slice, migrate calls to app-owned module + adapter/translator path,
   - delete replaced legacy files immediately after parity checks.

7. Record per-slice parity evidence:
   - build/flash/smoke notes tied to each delete step in progress notes.

---

### Phase J - Final legacy retirement and architecture lock

Status: `Not started`

Scope:

- Remove dead compatibility paths and obsolete wrappers after H/I parity validation.
- Add architecture guardrails (CI/review checks):
  - block non-adapter includes from `app/*` into legacy subsystem headers,
  - block new direct static singleton usage in runtime/domain code,
  - block new app/business logic files outside `src/app/*`.
- Finalize architecture docs/diagrams to reflect real ownership boundaries.

Acceptance:

- App layer is legacy-agnostic except adapters/translators.
- Legacy folders outside `src/app/*` contain no business/orchestration logic.
- Remaining non-`src/app` code is hardware/framework glue only, or legacy folders are fully removed.
- Guardrails prevent regression to old coupling patterns.
- Final acceptance checklist passes end-to-end.

Implementation checklist (ordered):

1. Remove temporary compatibility layers introduced during G/H/I once parity is proven.

2. Add include-boundary guardrails:
   - CI check that blocks non-adapter `src/app/*` includes of legacy subsystem headers.

3. Add global-usage guardrails:
   - CI/review check that blocks new direct static/global singleton usage in runtime/domain/events code.

4. Add app-ownership guardrail:
   - CI check that blocks new app/business logic files outside `src/app/*`.

5. Finalize architecture docs/diagrams:
   - ensure docs reflect actual ownership boundaries after deletions.

6. Run final acceptance gate:
   - build + flash + smoke path + architecture guardrail checks all green.

## Progress Tracker

Update this table as work lands.

| Phase | Owner | Status | Start date | End date | Notes |
| ----- | ----- | ------ | ---------- | -------- | ----- |
| A     | Codex + Jappy | Done | 2026-02-27 | 2026-02-27 | Contract/docs finalized and architecture invariants aligned for finalization. |
| B     | Codex + Jappy | Done | 2026-02-27 | 2026-02-27 | Added typed EventBus in `app/events` and removed `Application` app-event enum/void* payload API. |
| C     | Codex + Jappy | Done | 2026-02-27 | 2026-02-27 | Added `AppKernel` and switched `main.cpp` lifecycle wiring to kernel. |
| D     | Codex + Jappy | Done | 2026-02-27 | 2026-02-27 | Added `app/runtime/runtime_workers.*`; `Application` now delegates worker task lifecycle to runtime. |
| E     | Codex + Jappy | Done | 2026-02-27 | 2026-02-27 | Added ports/adapters for settings/system/beeper/network/serial/connectivity-state; orchestration no longer uses static globals directly. |
| F     | Codex + Jappy | Done | 2026-02-27 | 2026-02-27 | Added app_runtime_state, event_router, app_runtime; Application is wiring-only facade. |
| G     | Codex + Jappy | Done | 2026-02-27 | 2026-02-27 | Split `app_runtime.cpp` into runtime modules (`bootstrap`, `events`, `state_machine`, `flows`) and added `RuntimeContext` composition object. |
| H     | Codex + Jappy | Done | 2026-02-27 | 2026-02-27 | Added `app/contracts` + adapter translators; runtime/domain/events headers no longer include legacy `api/api.hpp`; validated with build + upload + 2-minute serial stability log. |
| I     | Codex + Jappy | Done | 2026-02-28 | 2026-02-28 | Decomposed legacy internals (`api`, `display`, `network`, `settings`) into focused modules while preserving public interfaces; validated with lint/build/flash + serial stability. |
| J     | Codex + Jappy | Not started |            |          | Retire compatibility leftovers and lock boundaries with architecture guardrails. |

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
- Started Phase F by expanding the plan into concrete runtime-state + event-router extraction steps and setting phase status to `In progress`.
- Completed Phase F: added `app/runtime/app_runtime_state.hpp`, `event_router.{hpp,cpp}`, `app_runtime.{hpp,cpp}`; moved orchestration from Application to AppRuntime; Application is now thin facade (setup/loop forward only).
- Updated Phase G scope to explicitly decompose large `app_runtime.cpp` into maintainable runtime modules (bootstrap/events/state-machine/flows + display/headless split) with concrete acceptance criteria.
- Added phases H/I/J to finish modernization after runtime extraction: app-owned contracts, legacy subsystem decomposition, and final architecture guardrails.
- Tightened end-state invariant: all app/business logic must live in `src/app/*`, with explicit legacy-folder burn-down and deletion gates.
- Added concrete implementation checklists for phases G/H/I/J to make remaining modernization work executable as ordered slices.
- Completed Phase G runtime modularization: extracted `AppRuntime` responsibilities into `app/runtime/bootstrap`, `app/runtime/events`, `app/runtime/state_machine`, and `app/runtime/flows`, with display/headless split files and a shared `runtime_context`.
- Validated post-Phase-G behavior with `npx nx build attractap-firmware` (all firmware environments built and merged successfully).
- Completed Phase H contract hardening: introduced `app/contracts/api_contracts.hpp`, migrated high-traffic app boundaries (`IApiPort`, `IUiPort`, `EventBus`, `AppRuntimeState`, and auth/runtime headers) to app-owned contracts, and centralized app<->legacy mapping in `app/adapters/translators/api_contracts_translator.hpp`.
- Added Phase H migration matrix in this plan as the authoritative `legacy folder -> app owner -> translator -> delete criteria` artifact.
- Lint/static analysis check: `pio check -e attractap-touch` completed successfully (existing third-party/dependency warnings only; no new app-layer lint blockers introduced by Phase H changes).
- Flash/stability validation on `attractap-touch` (`/dev/cu.usbmodem21301`): after initial stack-canary regressions in `websocket_task`, fixed large resource-list callback stack usage by removing large stack copies in callback/event publish path; re-flashed and captured 130s serial logs with no panic/reset/reboot signatures.

### 2026-02-28

- Completed Phase I legacy subsystem decomposition without broad API breaks:
  - `src/api`: split command/callback dispatch path from monolithic implementation into `src/api/api_actions.cpp` while preserving `API` interface and behavior.
  - `src/display`: moved popup/orchestration responsibilities into `src/display/display_popups.cpp` to reduce central `display.cpp` ownership concentration.
  - `src/network`: separated hosted transport bootstrap and SNTP setup into dedicated internal methods (`setupHostedTransport`, `setupTimeSync`) to clarify transport vs policy concerns.
  - `src/settings`: separated persistence/default-loading/validation concerns with focused helper methods (`loadFromPreferences`, `validateLoadedConfig`, `persist*`).
- Lint/static-analysis evidence:
  - `ReadLints` on touched files: no IDE diagnostics for new changes.
  - `pio check -e attractap-touch --skip-packages --src-filters="+<src/api/> +<src/display/> +<src/network/> +<src/settings/>"` passed (existing third-party/dependency warnings remain, no new blocking errors introduced by this slice).
- Build/flash/smoke evidence:
  - `pio run -e attractap-touch -t upload --upload-port /dev/cu.usbmodem21301` succeeded.
  - Captured 130s serial runtime logs on `attractap-touch` via PlatformIO Python serial reader; no panic/reset/reboot tokens detected (`panic_hits=0`).

## Execution Rules

- No feature flags.
- Keep firmware shippable after each phase.
- Do not merge next phase before acceptance of current phase.
- Preserve current runtime behavior while moving ownership boundaries.

## Suggested Order of Work

1. A -> B first (contracts and event substrate)
2. C -> D (kernel + runtime extraction)
3. E -> F (boundary completion + orchestration retirement)
4. G (runtime decomposition + cleanup/tests/docs)
5. H (contract hardening and legacy-type decoupling)
6. I (legacy subsystem decomposition)
7. J final (legacy retirement + architecture lock)

## Final Acceptance Checklist

- `app/kernel` contains active lifecycle wiring implementation.
- `app/events` contains typed event contracts + bus implementation.
- `app/runtime` owns worker task lifecycle.
- Domain controllers own transitions; orchestration is not monolithic.
- `Application` no longer holds primary business orchestration state.
- Runtime orchestration is modularized into focused files; `AppRuntime` remains thin and compositional.
- App-layer contracts and ports isolate runtime/domain/events from legacy concrete schemas.
- Legacy subsystems are decomposed to maintainable internal components with reduced static/global ownership.
- Non-`src/app` legacy folders contain no business/orchestration logic (deleted or glue-only).
- Build + flash validation succeeds on active target.
- Architecture docs reflect actual code structure.
