# Cursor Cloud Agent Guide

## Quick Facts
- NX monorepo managed with `pnpm`.
- Node version: `22.17.1` (from `.nvmrc`).
- Run commands from the repo root.
- Prefer `pnpm nx` targets; avoid long-running dev servers unless asked.
- Firmware is in `apps/attractap-firmware` and uses PlatformIO (not Nx).

## Setup
1. Install dependencies:
   - `pnpm install`
2. Create environment file:
   - `cp .env.example .env`
3. Run API migrations (when needed):
   - `pnpm nx run api:migrations-run`

If you need to start the API locally, set `LICENSE_KEY` as described in `README.md`.

## Pre-commit / CI Notes
- Husky runs `pnpm nx run-many --nxBail -t lint,typecheck,build,test,e2e`.
- Ensure dependencies are installed and required env vars are set before running
  full checks.
- Firmware build is separate from Nx and requires PlatformIO (see below).

## Commit signing (Cursor Cloud Agents)
This repo configures Cursor Cloud Agents to auto-sign commits using a GPG key
stored in Cursor secrets. The install step sources
`scripts/cloud-agent/setup-gpg-signing.sh`, which imports your key, preloads the
passphrase, and sets global git config for signing.

### Required Cursor secrets
- `IS_RUNNING_CURSOR_CLOUD_AGENT`: Set to `1`.
- `GPG_PRIVATE_KEY_BASE64`: Base64-encoded ASCII-armored private key.
- `GPG_PRIVATE_KEY_PASSPHRASE`: Passphrase for the private key.
- `MY_GIT_EMAIL`: Email associated with the GPG key and Git commits.
- `MY_FULL_NAME`: Full name for Git commits.

### Export helper
Use this on your local machine to generate `GPG_PRIVATE_KEY_BASE64`:

```bash
gpg --list-secret-keys --keyid-format=long
gpg --armor --export-secret-keys YOUR_KEY_ID | base64 | tr -d '\n'; echo
```

Make sure the public key is added to your Git provider (e.g., GitHub) so signed
commits verify.

## Common Commands
- Show available targets for a project:
  - `pnpm nx show project <project> --json`
- Build:
  - `pnpm nx build <project>`
- Lint:
  - `pnpm nx lint <project>`
- Test:
  - `pnpm nx test <project>`
  - `pnpm nx e2e api`
- Serve (manual, long-running):
  - `pnpm nx run-many -t serve --projects=api,frontend`
  - API: `http://localhost:3000`
  - Frontend: `http://localhost:4200`

## Repo Notes
- Firmware lives in `apps/attractap-firmware` and uses PlatformIO.
- React Query client regeneration:
  - `pnpm nx build react-query-client --skipNxCache`

## Firmware Toolchain (Attractap)
Location: `apps/attractap-firmware` (ESP32-C3 firmware).

### Requirements
- Python 3 and `pip`
- PlatformIO Core
- `esptool` (for manual flashing)

### Install (recommended)
- `python3 -m pip install --user -U platformio esptool`
- Ensure `~/.local/bin` is in `PATH` (Linux)

### Verify
- `pio --version`
- `esptool.py --help`

### Build
- `cd apps/attractap-firmware`
- `pio run -e attractap`

### Upload (device connected)
- `pio run -e attractap -t upload`

### Manual flash
- `esptool.py --chip esp32c3 --port /dev/ttyUSB0 --baud 921600 write_flash 0x0 merged-firmware.bin`
  - Linux: `/dev/ttyUSB0` or `/dev/ttyACM0`
  - macOS: `/dev/tty.usbserial-*`
  - Windows: `COM3`, `COM4`, etc.
