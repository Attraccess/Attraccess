# AGENTS.md

Short reference for agents working in this repo.

## Dev servers — always use `pnpm serve`

`pnpm serve` is safe to run in parallel from multiple worktrees. It auto-resolves free ports for API and frontend, printing them in a banner at startup:

```
┌─────────────────────────────────────────────┐
│ Attraccess dev servers                      │
│   API      → http://localhost:3001          │
│   Frontend → http://localhost:4201          │
└─────────────────────────────────────────────┘
```

**Never assume ports 3000/4200 are yours.** Parse the banner (first ~6 lines of stdout) to learn the actual ports.

While the launcher runs it also writes the resolved ports to `.dev-serve-ports.json` at the repo root (gitignored, removed on exit) — read it instead of scraping stdout:

```json
{
  "pid": 12345,
  "api": { "port": 3001, "url": "http://localhost:3001" },
  "frontend": { "port": 4201, "url": "http://localhost:4201" },
  "preview": { "port": 4301, "url": "http://localhost:4301" }
}
```

```bash
cat .dev-serve-ports.json | jq -r '.api.url'
```

Flags:

- `pnpm serve --only=api` — API only
- `pnpm serve --only=frontend` — frontend only
- `pnpm serve` — both (default)

Pin a port (strict — fails on collision):

- `PORT=3010 pnpm serve`
- `VITE_PORT=4250 pnpm serve`

Solo `pnpm nx serve api` is **not** wrapped — it still hard-fails on busy 3000. Prefer `pnpm serve --only=api`.
