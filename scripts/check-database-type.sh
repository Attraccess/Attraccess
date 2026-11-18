#!/bin/sh
# Stops a bootstrap, worktree creation or migration run before anything is created or changed when DATABASE_TYPE is
# not a supported database. It uses the same provider list as the operational scripts (apps/api/scripts/lib) and
# reads DATABASE_TYPE from the environment, then from the repository's .env (the environment wins, like typeorm's CLI).
set -eu

repo_root=$(cd "$(dirname "$0")/.." && pwd)
env_file=
if [ -f "$repo_root/.env" ]; then env_file="--env-file=$repo_root/.env"; fi
# shellcheck disable=SC2086 # an empty $env_file must expand to nothing
database_type=$(node $env_file "$repo_root/apps/api/scripts/lib/database-provider.mjs") || exit 1
printf '%s\n' "Database backend: $database_type"
