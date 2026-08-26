#!/bin/sh

set -eu

if [ "$#" -lt 2 ] || [ "$#" -gt 3 ]; then
    printf '%s\n' "Usage: $0 <worktree-path> <branch> [start-point]" >&2
    exit 1
fi

repo_root=$(git rev-parse --show-toplevel)
worktree_path=$1
shift

git -C "$repo_root" worktree add "$worktree_path" "$@"
worktree_root=$(cd "$worktree_path" && pwd)

"$worktree_root/scripts/setup-dev-dependencies.sh"
touch "$worktree_root/.worktree-bootstrap-complete"
