# AGENTS.md

RULES:

- do not commit auto-generated code (e.g. react-query api client)
- do not manually modify the CHANGELOG.md, it is auto generated
- do not commit specs/plan files, repo is code/docs only.

## Worktree Bootstrap

Create worktrees with `scripts/create-worktree.sh <worktree-path> <branch>
[start-point]`. It runs `scripts/setup-dev-dependencies.sh` after `git worktree
add` succeeds, installing dependencies, creating `.env`, and running database
migrations. For Attractap firmware work, run `INSTALL_ESP_IDF=true
./scripts/setup-dev-dependencies.sh` in the new worktree to install the
project-local ESP-IDF v6.0.2 toolchain at `.tools/esp-idf`. The completion
marker is created only after setup succeeds. If bootstrap fails, rerun that
script from the new worktree before reporting a missing dependency.

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

Solo `pnpm nx serve api` is **not** wrapped. Prefer `pnpm serve --only=api`.

# For Frontend Work

We use HeroUI, use it. Use as little tailwind/custom css as possible.

Use HeroUI React documentation from @Docs https://heroui.com/react/llms.txt
For component-specific documentation @Docs https://heroui.com/react/llms-components.txt
For patterns and best practices @Docs https://heroui.com/react/llms-patterns.txt
