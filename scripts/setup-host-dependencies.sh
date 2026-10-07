#!/bin/bash
# Host dependency checks and installers sourced by setup-dev-dependencies.sh.
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
