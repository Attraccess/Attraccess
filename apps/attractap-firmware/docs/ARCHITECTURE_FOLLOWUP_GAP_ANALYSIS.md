# Attractap Firmware Architecture Follow-up Gap Analysis

Date: 2026-02-28

Note: this gap analysis was written before the final flatten step. Historical `src/app/*`
references correspond to the interim migration state; final code layout is flat `src/*`.

## Question

Did we reach the original migration/finalization goal?

Short answer: **Mostly yes for core runtime architecture, not fully yes for proof/retirement depth.**

## What is achieved

- `main.cpp` now depends on `AppKernel`; startup/loop ownership is kernel-owned.
- `src/app/events` exists with typed event APIs at call sites.
- Runtime orchestration moved under `src/app/runtime` and split into bootstrap/events/state_machine/flows/workers.
- `Application` compatibility orchestration layer is removed from active code.
- App-owned contracts/ports/adapters structure is in place (`src/app/contracts`, `ports`, `adapters`).
- CI guardrail hook exists via Nx target and script (`attractap-firmware:guardrails`).

## Remaining gaps to initial end-state

1. **Verification gap (highest risk)**
   - No dedicated architecture test suite exists yet for:
     - event routing contract checks,
     - flow contract checks,
     - queue/backpressure deterministic behavior.
   - Current confidence relies mostly on build/flash/smoke evidence in docs.

2. **Legacy retirement depth gap**
   - Legacy folders still contain large implementation units (`src/api`, `src/display`, `src/network`, `src/nfc`, `src/websocket`).
   - This can still be valid if glue-only, but current size/shape makes regression risk higher and ownership harder to audit.

3. **Guardrail strictness gap (partially closed in this follow-up)**
   - Guardrails previously missed some include forms and had a weak "app ownership" proxy.
   - This follow-up tightens guardrails for:
     - quoted + angle-bracket include detection,
     - explicit legacy include blocking by prefix,
     - disallowing `app/*` includes outside `src/app` except `src/main.cpp`.

4. **Documentation evidence gap**
   - Finalization plan marks all phases done, but does not separate:
     - "implemented",
     - "verified by automated tests",
     - "verified by manual smoke".

## Follow-up phases to reach full closure

### Phase K - Architecture verification suite

Goal: move confidence from narrative/manual evidence to repeatable checks.

Scope:
- Add minimal host-runnable tests for event routing and flow contracts.
- Add deterministic tests for event queue/backpressure behavior.
- Add a CI target for firmware architecture tests (separate from full hardware flash).

Acceptance:
- Tests run in CI on PRs.
- Failing architecture contracts block merge.

### Phase L - Legacy ownership hardening

Goal: make remaining non-`src/app` modules auditable as glue/infrastructure only.

Scope:
- For each remaining legacy subtree, produce a short ownership note:
  - "orchestration/business logic: none" or exact remaining exceptions.
- Continue internal splits where needed to reduce monolithic files.
- Remove dead files/folders as soon as no references remain.

Acceptance:
- Each legacy subtree has explicit owner + deletion/reduction criteria.
- No ambiguous business-orchestration ownership outside `src/app`.

### Phase M - Final acceptance gate

Goal: lock architecture with objective green criteria.

Scope:
- Run and record:
  - guardrails,
  - architecture tests (Phase K),
  - build + target flash/smoke.
- Update architecture docs with test evidence links.

Acceptance:
- One reproducible checklist with all gates green.
- Finalization status reflects both implementation and automated verification.

## Recommended immediate next actions

1. Add Nx target `attractap-firmware:arch-test` (host-runnable checks first).
2. Land first event-router/flow contract tests (small, deterministic).
3. Add legacy subtree ownership matrix appendix to this doc.
