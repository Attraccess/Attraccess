#!/usr/bin/env bash
# Idempotent workspace setup: dependencies, .env, submodules and database migrations.
set -e
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"
. "$REPO_ROOT/scripts/setup-host-dependencies.sh"
check_node || { echo "Run scripts/setup-host-dependencies.sh to install Node.js $NODE_VERSION." >&2; exit 1; }
resolve_pnpm_version
check_pnpm || { echo "Run scripts/setup-host-dependencies.sh to install pnpm $PNPM_VERSION." >&2; exit 1; }

# --- Git submodules ---
init_submodules() {
    if [[ -f "$REPO_ROOT/.gitmodules" ]] && [[ -s "$REPO_ROOT/.gitmodules" ]]; then
        echo "Initializing git submodules..."
        git submodule update --init --recursive
        echo "✓ Git submodules initialized"
    fi
}

# --- Project setup ---
setup_project() {
    echo ""
    echo "Setting up project..."
    if [[ ! -f "$REPO_ROOT/.env" ]]; then
        cp "$REPO_ROOT/.env.example" "$REPO_ROOT/.env"
        echo "✓ Created .env from .env.example"
    else
        echo "✓ .env already exists"
    fi

    echo "Installing pnpm dependencies..."
    pnpm install
    echo "✓ pnpm install complete"

    echo "Running database migrations..."
    storage_root=$(node --env-file="$REPO_ROOT/.env" --input-type=module -e \
        'import { resolveStorageRoot } from "./apps/api/src/config/storage-path.ts"; process.stdout.write(resolveStorageRoot())')
    mkdir -p "$storage_root"
    pnpm nx run api:migrations-run
}

init_submodules
setup_project
