# Firmware Architecture

Firmware architecture now uses a flat `src/*` layout.

Top-level architecture modules:

- `kernel/`: composition root and lifecycle owner (`AppKernel` + `AppRuntime` wiring).
- `events/`: typed event contracts and EventBus implementation.
- `domain/`: deterministic controllers for auth/connectivity/resource/session/update decisions.
- `runtime/`: runtime orchestration modules (bootstrap/events/state_machine/flows/workers/state).
- `ports/`: side-effect contracts.
- `adapters/`: translation and boundary adapters.
- `contracts/`: app-owned DTOs/types consumed by runtime/domain/events/ports.

Implementation/integration modules:

- `api/`, `display/`, `network/`, `settings/`, `state/`, `nfc/`, `serial/`, `websocket/`, `beeper/`, `logger/`, `ioexpander/`.

Guardrails:

- Run `python3 tools/architecture_guardrails.py` from `apps/attractap-firmware`.
- CI runs `nx run attractap-firmware:guardrails`.
- Guardrails enforce:
  - flat layout (`src/app` must not reappear with code),
  - no obsolete `#include "app/*"` includes,
  - no non-adapter includes from architecture modules into implementation-module headers,
  - no direct legacy static/global usage in `src/{runtime,domain,events}/*`.
