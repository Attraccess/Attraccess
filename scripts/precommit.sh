#!/bin/sh
# Checks for the change set being committed. CI runs every check on its own.
set -e

pnpm lint:files
pnpm lint:files --staged
# Nx's --uncommitted reads the worktree; refuse when it differs from the index.
node scripts/crap-score/check-staged.mjs

exclude=tag:scope:hardware,tag:scope:companion
# host:fhs tests run device shell scripts against /bin and /usr/bin tools, which
# hosts such as NixOS do not have.
if [ ! -x /bin/bash ] || [ ! -x /usr/bin/tr ] || [ ! -x /usr/bin/awk ]; then
    echo "Skipping host:fhs projects: this host lacks /bin and /usr/bin tools; CI runs them." >&2
    exclude="$exclude,tag:host:fhs"
fi

pnpm nx affected --uncommitted --nxBail --targets=lint,typecheck,test,crap-score --exclude="$exclude"
