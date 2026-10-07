#!/bin/bash
# Setup script for Attraccess development environment
# Installs: Docker, Node.js, pnpm, and project dependencies.
# Set INSTALL_ESP_IDF=true to also install the Attractap firmware toolchain.
# Run from repo root: ./scripts/setup-dev-dependencies.sh

set -e

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

echo "=== Attraccess Development Environment Setup ==="
echo ""

. "$REPO_ROOT/scripts/setup-host-dependencies.sh"
. "$REPO_ROOT/scripts/setup-firmware-dependencies.sh"

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
    storage_root=$(node --env-file="$REPO_ROOT/.env" -e 'process.stdout.write(process.env.STORAGE_ROOT || "storage")')
    mkdir -p "$storage_root"
    pnpm nx run api:migrations-run
}

# --- Main ---
main() {
    # Docker
    if ! check_docker; then
        install_docker || true
        echo "⚠ Install Docker manually (see above). Continuing with other dependencies..."
    fi
    if ! check_docker_compose; then
        echo "⚠ Docker Compose not found. Docker Compose v2 (plugin) is included with Docker CE. Ensure 'docker compose' works."
    fi
    echo ""

    # Node.js
    if ! check_node; then
        install_node
    fi
    # Re-source nvm if we're in same shell
    if [[ -s "$HOME/.nvm/nvm.sh" ]]; then
        # shellcheck source=/dev/null
        . "$HOME/.nvm/nvm.sh"
        nvm use "$NODE_VERSION" 2>/dev/null || true
    fi
    echo ""

    # pnpm
    if ! check_pnpm; then
        install_pnpm
    fi
    echo ""

    # Python is also required by node-gyp when native module prebuilds are unavailable.
    if ! check_python; then
        install_python
    fi
    echo ""

    # ESP-IDF is only needed for Attractap firmware work. Keeping it opt-in
    # avoids a large toolchain install for routine API/frontend worktrees.
    if [[ "$INSTALL_ESP_IDF" == "true" ]]; then
        if ! check_esp_idf; then
            install_esp_idf
        fi
    else
        echo "Skipping ESP-IDF. Install it when needed with: INSTALL_ESP_IDF=true ./scripts/setup-dev-dependencies.sh"
    fi
    echo ""

    # Submodules
    init_submodules
    echo ""

    # Project
    setup_project

    echo ""
    echo "=== Setup complete ==="
    echo ""
    echo "Next steps:"
    echo "  1. For Attractap firmware work: INSTALL_ESP_IDF=true ./scripts/setup-dev-dependencies.sh"
    echo "  2. If Docker was just installed: log out and back in, or run: newgrp docker"
    echo "  3. Start dev services (optional): pnpm services"
    echo "  4. Run full precommit: pnpm precommit:all"
    echo "     (To skip firmware build like CI: pnpm nx run-many -t lint,typecheck,test,e2e,build --exclude=attractap-firmware,attractap-touch-firmware)"
    echo "  5. Start API + frontend: pnpm serve"
    echo ""
}

main "$@"
