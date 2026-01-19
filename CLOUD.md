# Cursor Cloud Agent Guide

## Quick Facts
- NX monorepo managed with `pnpm`.
- Node version: `22.17.1` (from `.nvmrc`).
- Run commands from the repo root.
- Prefer `pnpm nx` targets; avoid long-running dev servers unless asked.

## Setup
1. Install dependencies:
   - `pnpm install`
2. Create environment file:
   - `cp .env.example .env`
3. Run API migrations (when needed):
   - `pnpm nx run api:migrations-run`

If you need to start the API locally, set `LICENSE_KEY` as described in `README.md`.

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
