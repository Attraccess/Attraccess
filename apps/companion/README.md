# Attraccess Companion

Desktop companion app for Attraccess. Runs on Windows, macOS, and Linux.

Built with [Electron](https://www.electronjs.org/).

## Dev setup

```bash
# Install dependencies (from repo root)
pnpm install

# Typecheck
pnpm nx run companion:typecheck

# Lint
pnpm nx run companion:lint

# Build (produces packaged binary in apps/companion/dist/)
pnpm nx run companion:build
```

## Architecture

- `src/main.ts` — Electron main process (Node.js)
- `src/preload.ts` — Preload script (context bridge)
- `src/index.html` — Renderer entry point
