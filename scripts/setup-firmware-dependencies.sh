#!/bin/bash
# Optional ESP-IDF checks and installation sourced by setup-dev-dependencies.sh.
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
