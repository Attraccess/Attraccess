# App Architecture

`src/app` is the only location for firmware application/runtime/domain orchestration logic.

Top-level layout:

- `kernel/`: composition root and lifecycle owner (`AppKernel` + `AppRuntime` wiring).
- `events/`: typed event contracts and EventBus implementation.
- `domain/`: deterministic controllers for auth/connectivity/resource/session/update decisions.
- `runtime/`: runtime orchestration modules (bootstrap/events/state_machine/flows/workers/state).
- `ports/`: app-owned side-effect contracts.
- `adapters/`: legacy/hardware framework bridges and app<->legacy translators.
- `contracts/`: app-owned DTOs/types consumed by runtime/domain/events/ports.

Guardrails:

- Run `python3 tools/architecture_guardrails.py` from `apps/attractap-firmware`.
- CI also runs `nx run attractap-firmware:guardrails`.
- Guardrails enforce:
  - no non-adapter `src/app/*` includes into legacy subsystem headers,
  - no direct legacy static/global usage in `src/app/{runtime,domain,events}/*`,
  - no `namespace app::` definitions outside `src/app/*`.
