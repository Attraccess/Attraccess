#!/bin/sh

set -eu

if [ "$#" -lt 2 ] || [ "$#" -gt 3 ]; then
    printf '%s\n' "Usage: $0 <worktree-path> <branch> [start-point]" >&2
    exit 1
fi

repo_root=$(git rev-parse --show-toplevel)
worktree_path=$1
case "$worktree_path" in
    /*) ;;
    *) worktree_path="$repo_root/$worktree_path" ;;
esac
shift

branch=$1
shift
if [ "$#" -eq 1 ]; then
    git -C "$repo_root" worktree add -b "$branch" "$worktree_path" "$1"
else
    git -C "$repo_root" worktree add "$worktree_path" "$branch"
fi
worktree_root=$(cd "$worktree_path" && pwd)

"$worktree_root/scripts/setup-dev-dependencies.sh"
touch "$worktree_root/.worktree-bootstrap-complete"
