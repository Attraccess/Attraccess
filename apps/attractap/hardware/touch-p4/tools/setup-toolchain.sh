#!/usr/bin/env bash
# Checks the tools the board scripts need and downloads the autorouter into .tools/kicad.
set -eo pipefail
. "$(dirname "${BASH_SOURCE[0]}")/kicad-env.sh"

FREEROUTING_VERSION="2.5.0"
FREEROUTING_SHA256="f6f51bb02245e8e717f9359bd260cc9c5c0b1bc0acc8b7cb2cd5b8ffeb5de3c7"
jar="$PCB_TOOLS/freerouting-$FREEROUTING_VERSION.jar"

sha256() { if command -v sha256sum >/dev/null 2>&1; then sha256sum "$1"; else shasum -a 256 "$1"; fi | cut -d' ' -f1; }

echo "KiCad: $("$KICAD_CLI" version | tail -n 1) ($KICAD_CLI)"
kicad_python -c 'import numpy, PIL, pcbnew; print("KiCad Python: pcbnew", pcbnew.Version(), "with numpy and Pillow")'

mkdir -p "$PCB_TOOLS"
if [[ ! -f "$jar" || "$(sha256 "$jar")" != "$FREEROUTING_SHA256" ]]; then
    echo "Downloading Freerouting $FREEROUTING_VERSION ..."
    curl -fL --retry 3 -o "$jar.part" \
        "https://github.com/freerouting/freerouting/releases/download/v$FREEROUTING_VERSION/freerouting-$FREEROUTING_VERSION.jar"
    [[ "$(sha256 "$jar.part")" == "$FREEROUTING_SHA256" ]] || { echo "Freerouting download has the wrong checksum." >&2; exit 1; }
    mv "$jar.part" "$jar"
fi
echo "Freerouting: $jar"
if command -v java >/dev/null 2>&1; then
    echo "Java: $(java -version 2>&1 | head -n 1) (the autorouter needs version 25 or newer)"
elif command -v nix >/dev/null 2>&1; then
    echo "Java: taken from nixpkgs (jdk25_headless) when the route target runs"
else
    echo "Java 25 or newer is missing; it is only needed for the route target." >&2
fi
if command -v ngspice >/dev/null 2>&1; then
    echo "ngspice: $(command -v ngspice)"
elif command -v nix >/dev/null 2>&1; then
    echo "ngspice: taken from nixpkgs when the simulate target runs"
else
    echo "ngspice is missing; the simulate target (part of check) needs it." >&2
fi
echo "Board tools ready."
