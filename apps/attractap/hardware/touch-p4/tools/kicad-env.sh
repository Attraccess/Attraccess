#!/usr/bin/env bash
# Finds KiCad 10 and sets up its command-line and Python environment. Source this file.
#
# After sourcing:
#   KICAD_CLI      path of kicad-cli
#   KICAD_PYTHON   Python interpreter that can `import pcbnew`
#   KICAD10_SYMBOL_DIR, KICAD10_FOOTPRINT_DIR   KiCad's standard libraries
#   KICAD_CONFIG_HOME   private configuration with KiCad's default library tables, under .tools/
#
# Each can be set beforehand to override the search. On NixOS without KiCad on the PATH the script
# takes it from nixpkgs.

PCB_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REPO_ROOT="$(cd "$PCB_ROOT/../../../.." && pwd)"
PCB_TOOLS="$REPO_ROOT/.tools/kicad"
PCB_NAME="attractap-touch-p4"
MAC_APP="/Applications/KiCad/KiCad.app/Contents"

kicad_env_fail() { echo "kicad-env: $*" >&2; return 1; }

if [[ -z "${KICAD_CLI:-}" ]]; then
    if command -v kicad-cli >/dev/null 2>&1; then
        KICAD_CLI="$(command -v kicad-cli)"
    elif [[ -n "${KICAD:-}" && -x "$KICAD/bin/kicad-cli" ]]; then
        KICAD_CLI="$KICAD/bin/kicad-cli"
    elif [[ -x "$MAC_APP/MacOS/kicad-cli" ]]; then
        KICAD_CLI="$MAC_APP/MacOS/kicad-cli"
    elif command -v nix >/dev/null 2>&1; then
        KICAD_CLI="$(nix build --no-link --print-out-paths nixpkgs#kicad)/bin/kicad-cli"
    fi
fi
[[ -x "${KICAD_CLI:-}" ]] || kicad_env_fail "kicad-cli not found. Install KiCad 10 or set KICAD_CLI." || return 1
export KICAD_CLI

# The Nix package is a wrapper script that exports the library folders and the Python path.
# Take them from it instead of guessing store paths.
if head -c 2 "$KICAD_CLI" | grep -q '#!'; then
    while IFS= read -r line; do
        case "$line" in
            "export KICAD10_"*|"export PYTHONPATH="*) eval "$line" ;;
        esac
    done < "$KICAD_CLI"
fi

kicad_version="$("$KICAD_CLI" version 2>/dev/null | tail -n 1)"
[[ "$kicad_version" == 10.* ]] || kicad_env_fail "KiCad 10 is required, $KICAD_CLI is version '${kicad_version:-unknown}'." || return 1

if [[ -z "${KICAD_PYTHON:-}" ]]; then
    if [[ -x "$MAC_APP/Frameworks/Python.framework/Versions/Current/bin/python3" ]]; then
        KICAD_PYTHON="$MAC_APP/Frameworks/Python.framework/Versions/Current/bin/python3"
    else
        KICAD_PYTHON="$(command -v python3 || true)"
    fi
fi
export KICAD_PYTHON

share=""
for dir in "$MAC_APP/SharedSupport" /usr/share/kicad /usr/local/share/kicad; do
    [[ -d "$dir/symbols" ]] && share="$dir" && break
done
export KICAD10_SYMBOL_DIR="${KICAD10_SYMBOL_DIR:-${share:+$share/symbols}}"
export KICAD10_FOOTPRINT_DIR="${KICAD10_FOOTPRINT_DIR:-${share:+$share/footprints}}"
export KICAD10_TEMPLATE_DIR="${KICAD10_TEMPLATE_DIR:-${share:+$share/template}}"

# A private configuration, so the checks do not depend on what is set up in the user's KiCad.
# kicad-cli needs the global library tables to find the standard footprints and symbols.
if [[ -z "${KICAD_CONFIG_HOME:-}" ]]; then
    export KICAD_CONFIG_HOME="$PCB_TOOLS/config"
    config="$KICAD_CONFIG_HOME/${kicad_version%.*}"
    mkdir -p "$config"
    for table in sym-lib-table fp-lib-table; do
        if [[ ! -f "$config/$table" && -f "${KICAD10_TEMPLATE_DIR:-}/$table" ]]; then
            cp "$KICAD10_TEMPLATE_DIR/$table" "$config/$table"
            chmod u+w "$config/$table"
        fi
    done
fi

# Runs a script with the Python that has pcbnew.
kicad_python() {
    if ! "$KICAD_PYTHON" -c 'import pcbnew' >/dev/null 2>&1; then
        kicad_env_fail "'$KICAD_PYTHON' cannot import pcbnew. Set KICAD_PYTHON to KiCad's Python."
        return 1
    fi
    "$KICAD_PYTHON" "$@"
}
