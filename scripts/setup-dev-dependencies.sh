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

# --- Docker ---
check_docker() {
    if command -v docker &>/dev/null && docker info &>/dev/null 2>&1; then
        echo "✓ Docker is installed and running"
        docker --version
        return 0
    fi
    return 1
}

install_docker() {
    echo "Docker is required for 'pnpm services' (mailpit, authentik, etc.)."
    echo ""
    echo "Install Docker manually:"
    echo "  Ubuntu/Debian: https://docs.docker.com/engine/install/ubuntu/"
    echo "  Or run: curl -fsSL https://get.docker.com | sh"
    echo ""
    echo "Then add your user to the docker group: sudo usermod -aG docker \$USER"
    echo "Log out and back in, or run: newgrp docker"
    echo ""
    return 1
}

# --- Docker Compose ---
check_docker_compose() {
    if docker compose version &>/dev/null 2>&1; then
        echo "✓ Docker Compose (plugin) is available"
        docker compose version
        return 0
    fi
    if command -v docker-compose &>/dev/null; then
        echo "✓ Docker Compose (standalone) is available"
        docker-compose --version
        return 0
    fi
    return 1
}

# --- Node.js ---
NODE_VERSION="${NODE_VERSION:-24.13.0}"
if [[ -f "$REPO_ROOT/.nvmrc" ]]; then
    NODE_VERSION=$(cat "$REPO_ROOT/.nvmrc" | tr -d 'v \n')
fi

check_node() {
    if command -v node &>/dev/null; then
        local v
        v=$(node -v 2>/dev/null | tr -d 'v')
        if [[ -n "$v" ]]; then
            echo "✓ Node.js $(node -v) is installed"
            return 0
        fi
    fi
    return 1
}

install_node() {
    echo "Installing Node.js v${NODE_VERSION}..."
    if command -v nvm &>/dev/null; then
        nvm install "$NODE_VERSION"
        nvm use "$NODE_VERSION"
    elif command -v fnm &>/dev/null; then
        fnm install "$NODE_VERSION"
        fnm use "$NODE_VERSION"
    else
        echo "  Installing nvm..."
        export NVM_DIR="$HOME/.nvm"
        curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
        # shellcheck source=/dev/null
        [[ -s "$NVM_DIR/nvm.sh" ]] && . "$NVM_DIR/nvm.sh"
        nvm install "$NODE_VERSION"
        nvm use "$NODE_VERSION"
        echo "  nvm installed. Add to your shell profile: [ -s \"\$NVM_DIR/nvm.sh\" ] && . \"\$NVM_DIR/nvm.sh\""
    fi
}

# --- pnpm ---
check_pnpm() {
    if command -v pnpm &>/dev/null; then
        echo "✓ pnpm $(pnpm -v) is installed"
        return 0
    fi
    return 1
}

install_pnpm() {
    echo "Installing pnpm..."

    # Prefer corepack if available
    if command -v corepack &>/dev/null; then
        echo "Using corepack to enable pnpm..."
        if corepack enable pnpm; then
            if command -v pnpm &>/dev/null; then
                echo "✓ pnpm $(pnpm -v) is installed via corepack"
                return 0
            else
                echo "Warning: 'corepack enable pnpm' completed but pnpm is not on PATH." >&2
            fi
        else
            echo "Warning: Failed to enable pnpm via corepack, will try npm if available." >&2
        fi
    fi

    # Fallback to npm global install if npm is available
    if command -v npm &>/dev/null; then
        echo "Falling back to npm to install pnpm globally..."
        if npm install -g pnpm; then
            echo "✓ pnpm $(pnpm -v) is installed via npm"
            return 0
        else
            echo "Error: npm failed to install pnpm globally." >&2
            return 1
        fi
    fi

    # Neither corepack nor npm is available
    echo "Error: Neither 'corepack' nor 'npm' is available on PATH; cannot install pnpm." >&2
    echo "Please install npm or enable corepack for your Node.js installation and re-run this script." >&2
    return 1
}

# --- Python ---
check_python() {
    if command -v python3 &>/dev/null; then
        echo "✓ Python $(python3 --version) is installed"
        return 0
    fi
    return 1
}

install_python() {
    echo "Installing Python 3..."
    if [[ -f /etc/os-release ]]; then
        . /etc/os-release
        if [[ "$ID" == "ubuntu" || "$ID" == "debian" ]]; then
            sudo apt-get update
            sudo apt-get install -y python3 python3-pip python3-venv
        else
            echo "  Please install Python 3 manually for your distribution ($ID)"
            return 1
        fi
    else
        echo "Could not detect OS (missing /etc/os-release)."
        echo "  Please install Python 3 manually and ensure 'python3' is on your PATH."
        return 1
    fi
}

# --- ESP-IDF & esptool (Attractap firmware toolchain) ---
ESP_IDF_VERSION="v6.0.2"
ESP_IDF_PATH="$REPO_ROOT/.tools/esp-idf"
INSTALL_ESP_IDF="${INSTALL_ESP_IDF:-false}"

check_esp_idf() {
    if [[ -f "$ESP_IDF_PATH/export.sh" ]] && \
        [[ "$(git -C "$ESP_IDF_PATH" describe --tags --exact-match HEAD 2>/dev/null || true)" == "$ESP_IDF_VERSION" ]]; then
        echo "✓ ESP-IDF $ESP_IDF_VERSION is installed at $ESP_IDF_PATH"
        return 0
    fi
    return 1
}

install_esp_idf() {
    echo "Installing ESP-IDF $ESP_IDF_VERSION at $ESP_IDF_PATH (Attractap firmware toolchain)..."
    # Optional convenience: an esptool on PATH. Skipped when the system Python
    # has no pip (e.g. NixOS) — ESP-IDF's install.sh below always bundles
    # esptool inside its own Python environment, which build_firmwares.py
    # falls back to automatically.
    if python3 -m pip --version &>/dev/null; then
        python3 -m pip install --user --upgrade esptool || true
        # Ensure ~/.local/bin is in PATH
        if [[ ":$PATH:" != *":$HOME/.local/bin:"* ]]; then
            echo "  Add to your shell profile: export PATH=\"\$HOME/.local/bin:\$PATH\""
            export PATH="$HOME/.local/bin:$PATH"
        fi
    else
        echo "  System Python has no pip — skipping user-level esptool install"
        echo "  (ESP-IDF provides esptool in its own Python environment)"
    fi
    if [[ ! -e "$ESP_IDF_PATH" ]]; then
        mkdir -p "$(dirname "$ESP_IDF_PATH")"
        git clone --depth 1 --shallow-submodules --recursive -b "$ESP_IDF_VERSION" \
            https://github.com/espressif/esp-idf.git "$ESP_IDF_PATH"
    elif [[ -d "$ESP_IDF_PATH/.git" ]]; then
        git -C "$ESP_IDF_PATH" fetch --depth 1 origin tag "$ESP_IDF_VERSION"
        git -C "$ESP_IDF_PATH" checkout --detach "$ESP_IDF_VERSION"
        git -C "$ESP_IDF_PATH" submodule sync --recursive
        git -C "$ESP_IDF_PATH" submodule update --init --recursive --depth 1
    else
        echo "Error: $ESP_IDF_PATH exists but is not an ESP-IDF Git checkout." >&2
        return 1
    fi
    "$ESP_IDF_PATH/install.sh" esp32s3
    # ESP-IDF's Linux installer marks cmake/ninja "on request" and skips them,
    # assuming the system provides them (NixOS et al. don't) — install them
    # into the IDF tool set explicitly when absent.
    if ! command -v cmake &>/dev/null || ! command -v ninja &>/dev/null; then
        python3 "$ESP_IDF_PATH/tools/idf_tools.py" install cmake ninja
    fi
    printf '  To use idf.py directly in a shell: . %q\n' "$ESP_IDF_PATH/export.sh"
}

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

    # ESP-IDF is only needed for Attractap firmware work. Keeping it opt-in
    # avoids a large toolchain install for routine API/frontend worktrees.
    if [[ "$INSTALL_ESP_IDF" == "true" ]]; then
        if ! check_python; then
            install_python
        fi
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
