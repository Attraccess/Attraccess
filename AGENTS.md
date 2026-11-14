# AGENTS.md

RULES:

- do not commit auto-generated code (e.g. react-query api client)
- do not manually modify the CHANGELOG.md, it is auto generated
- do not commit specs/plan files, repo is code/docs only.
- every page linked from a docs sidebar needs `<!-- llms-description: <one sentence> -->` directly below its H1, written in the page's language. After any sidebar or description change run `node scripts/generate-llms-txt.mjs` and commit `docs/llms.txt` (it is a published file, not generated code); CI fails otherwise.

## Worktree Bootstrap

Create worktrees with `scripts/create-worktree.sh <worktree-path> <branch>
[start-point]`. It runs `scripts/setup-dev-dependencies.sh` after `git worktree
add` succeeds, installing dependencies, creating `.env`, and running database
migrations. For Attractap firmware work, run `INSTALL_ESP_IDF=true
./scripts/setup-dev-dependencies.sh` in the new worktree to install the
project-local ESP-IDF v6.0.2 toolchain at `.tools/esp-idf`. The completion
marker is created only after setup succeeds. If bootstrap fails, rerun that
script from the new worktree before reporting a missing dependency.

`apps/cesentry` is a private, optional submodule (`update = none`), so new
worktrees and public clones leave it empty. With access to the private
repository, fill it with `git submodule update --init --checkout apps/cesentry`.
Public code never references it (see `CONTRIBUTING.md`, "Private submodule").

## Committing

The Husky pre-commit hook runs `pnpm precommit` (lint, typecheck, test and CRAP
score for affected projects). On a busy machine it takes many minutes. PR and
merge-queue CI also typecheck and build every project, so a change can fail
there in a project it does not touch; `scripts/ci-nx-exclude.mjs` shows the
commands.

- Git runs the hooks only after `pnpm install` has created `.husky/_`. In a
  checkout without `node_modules`, commits skip every check.
- Stage every related change first. The CRAP check refuses unstaged or
  untracked JS/TS files and analysis configuration (see
  `scripts/crap-score/README.md`). Set unrelated work aside with
  `git stash push --keep-index --include-untracked` and pop it after the commit.
- `husky - pre-commit script failed (code 130)` does not mean the run was
  interrupted: `--nxBail` stops the other tasks after the first failure. The
  cause is listed under `Failed tasks:`.
- Run one commit at a time per worktree. Parallel runs share `coverage/` and
  break each other.
- `--no-verify` is for emergencies only (see `CONTRIBUTING.md`). Fix the
  failure instead.

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

Use `StatusDialog` for notices and confirmations (info, success, warning, error); only `error` gets a danger
action button. Use `StandardModal` only for richer dialog content. Shared UI comes from
`@attraccess/plugins-frontend-ui`; do not add copies of these components in core or in plugins.

Use HeroUI React documentation from @Docs https://heroui.com/react/llms.txt
For component-specific documentation @Docs https://heroui.com/react/llms-components.txt
For patterns and best practices @Docs https://heroui.com/react/llms-patterns.txt
