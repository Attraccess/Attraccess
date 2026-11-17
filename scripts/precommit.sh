#!/bin/sh
# Fast checks for the change set being committed. Lint, tests, CRAP score and the full
# typecheck and build run in CI (.github/workflows/pull-requests.yml); `pnpm precommit:all`
# runs everything locally.
set -e

# These read the Git index, so they check exactly what is being committed.
node scripts/check-file-size.mjs --staged
# Parsing every source takes a while; only staged app or library TypeScript can add a cycle.
if git diff --cached --name-only --diff-filter=ACMR | grep -qE '^(apps|libs)/.*\.([cm]?ts|tsx)$'; then
    node scripts/check-import-cycles.mjs --staged
fi
# Incremental tsc for the projects that own staged TypeScript files (reads the worktree).
node scripts/typecheck-staged.mjs
