# src -> src/app Migration Manifest

Date: 2026-02-28

This records the Phase N2 mechanical move set used before flattening.

## Folder Moves

- `src/logger` -> `src/app/logger`
- `src/beeper` -> `src/app/beeper`
- `src/ioexpander` -> `src/app/ioexpander`
- `src/debug` -> `src/app/debug`
- `src/core` -> `src/app/core`
- `src/certs` -> `src/app/certs`
- `src/settings` -> `src/app/settings`
- `src/state` -> `src/app/state`
- `src/serial` -> `src/app/serial`
- `src/network` -> `src/app/network`
- `src/websocket` -> `src/app/websocket`
- `src/nfc` -> `src/app/nfc`
- `src/api` -> `src/app/api`
- `src/display` -> `src/app/display`

## File Moves

- `src/utils.hpp` -> `src/app/utils.hpp`
- `src/utils.cpp` -> `src/app/utils.cpp`

## Intentionally Not Moved

- `src/main.cpp` (explicit exception per migration plan)
- `src/idf_component.yml`, `src/idf_component.yml.orig` (project metadata)

## Build/Tool Path Updates Applied

- `platformio.ini` excludes updated from legacy roots to `app/*` roots.
- `.gitignore` cert path updated to `src/app/certs/`.
- `tools/build_individual_ca_certs.py` output updated to `src/app/certs`.
