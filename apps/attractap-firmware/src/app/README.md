# App Architecture Scaffold

This folder is the migration target for the firmware architecture refactor.

Planned top-level layout:

- `kernel/`: startup wiring and lifecycle ownership.
- `events/`: typed events used for cross-module communication.
- `domain/`: controllers/state reducers by business domain.
- `ports/`: side-effect interfaces.
- `adapters/`: concrete implementations of ports.
- `runtime/`: tasks, queues, schedulers, telemetry.

Phase 0 note:
Only scaffolding and telemetry are added here. No behavior migration yet.
