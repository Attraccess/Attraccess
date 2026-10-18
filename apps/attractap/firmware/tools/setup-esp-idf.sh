#!/usr/bin/env bash
# Shared local/CI installer. Always rerun install.sh to repair partial toolchain restores.
set -eo pipefail
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../.." && pwd)"
ESP_IDF_VERSION="$(tr -d ' \n' < "$REPO_ROOT/apps/attractap/firmware/esp-idf-version.txt")"
ESP_IDF_PATH="${1:-$REPO_ROOT/.tools/esp-idf}"
if [[ "$#" -gt 1 ]]; then echo "Usage: $0 [esp-idf-path]" >&2; exit 1; fi

if [[ ! -e "$ESP_IDF_PATH" ]]; then
    mkdir -p "$(dirname "$ESP_IDF_PATH")"
    git clone --depth 1 --shallow-submodules --recursive -b "$ESP_IDF_VERSION" \
        https://github.com/espressif/esp-idf.git "$ESP_IDF_PATH"
elif [[ ! -d "$ESP_IDF_PATH/.git" ]]; then
    echo "Error: $ESP_IDF_PATH is not an ESP-IDF Git checkout." >&2
    exit 1
fi
if [[ "$(git -C "$ESP_IDF_PATH" describe --tags --exact-match HEAD 2>/dev/null || true)" != "$ESP_IDF_VERSION" ]]; then
    git -C "$ESP_IDF_PATH" fetch --depth 1 origin tag "$ESP_IDF_VERSION"
    git -C "$ESP_IDF_PATH" checkout --detach "$ESP_IDF_VERSION"
fi
git -C "$ESP_IDF_PATH" submodule sync --recursive
git -C "$ESP_IDF_PATH" submodule update --init --recursive --depth 1

# Cached venvs can point at a Python patch version no longer installed on the host.
idf_series="${ESP_IDF_VERSION#v}"
idf_series="${idf_series%.*}"
shopt -s nullglob
for idf_env in "${IDF_TOOLS_PATH:-$HOME/.espressif}"/python_env/idf"$idf_series"_py*_env/; do
    if [[ ! -e "$idf_env/bin/python3" ]]; then
        echo "Discarding stale ESP-IDF virtualenv: $idf_env"
        rm -rf "$idf_env"
    fi
done

"$ESP_IDF_PATH/install.sh" esp32s3
if ! command -v cmake &>/dev/null || ! command -v ninja &>/dev/null; then
    python3 "$ESP_IDF_PATH/tools/idf_tools.py" install cmake ninja
fi
# Successful checkout alone does not mean the Python environment or toolchains are usable.
( . "$ESP_IDF_PATH/export.sh" >/dev/null; idf.py --version )

# Keep host-only DS preparation outside IDF's managed Python environment.
# Do not leave a success marker after an interrupted or failed repair.
provisioning_env="$REPO_ROOT/.tools/reader-provisioning"
provisioning_lock="$REPO_ROOT/apps/attractap/firmware/tools/requirements-provisioning.txt"
rm -f "$provisioning_env/.ready"
if [[ ! -x "$provisioning_env/bin/python" ]]; then
    python3 -m venv --clear "$provisioning_env"
fi
"$provisioning_env/bin/python" -m pip install --require-hashes --force-reinstall -r "$provisioning_lock"
"$provisioning_env/bin/python" -m pip check
"$provisioning_env/bin/python" - <<'PY'
from importlib.metadata import version
assert version('esp-secure-cert-tool') == '2.6.1', 'Unsupported DS preparation tool'
from esp_secure_cert.configure_ds import calculate_rsa_ds_params
assert callable(calculate_rsa_ds_params)
PY
"$provisioning_env/bin/python" --version > "$provisioning_env/.ready"
printf 'ESP-IDF ready. To activate: . %q\n' "$ESP_IDF_PATH/export.sh"
