#!/usr/bin/env bash
# Every operation on the Touch P4 board, as the Nx targets of this project run them.
# Usage: tools/pcb.sh <command>      (see the case statement below, or the README)
set -eo pipefail
. "$(dirname "${BASH_SOURCE[0]}")/kicad-env.sh"

KICAD_DIR="$PCB_ROOT/kicad"
SCH="$KICAD_DIR/$PCB_NAME.kicad_sch"
PCB="$KICAD_DIR/$PCB_NAME.kicad_pcb"
BOOTSTRAP="$PCB_ROOT/scripts/bootstrap"
REPORTS="$PCB_ROOT/fab/reports"
FREEROUTING_VERSION="2.5.0"
FREEROUTING_JAR="${FREEROUTING_JAR:-$PCB_TOOLS/freerouting-$FREEROUTING_VERSION.jar}"

cli() { "$KICAD_CLI" "$@"; }
# A fixed hash seed: the routing scripts walk over sets of net names, and with Python's random seed
# two runs on the same input could pick different, equally short paths.
bootstrap() { (cd "$BOOTSTRAP" && PYTHONHASHSEED=0 kicad_python "$@"); }

erc() {
    mkdir -p "$REPORTS"
    cli sch erc --severity-all --exit-code-violations -o "$REPORTS/erc.rpt" "$SCH"
}

drc() {
    mkdir -p "$REPORTS"
    cli pcb drc --severity-all --schematic-parity --exit-code-violations -o "$REPORTS/drc.rpt" "$PCB"
}

check_netlist() {
    mkdir -p "$REPORTS"
    cli sch export netlist --format kicadsexpr -o "$REPORTS/schematic.net" "$SCH" >/dev/null
    bootstrap check_netlist.py "$REPORTS/schematic.net"
}

render() {
    mkdir -p "$PCB_ROOT/fab"
    for side in top bottom; do
        cli pcb render --side "$side" --width 1500 --height 2300 --quality basic \
            -o "$PCB_ROOT/fab/render-$side.png" "$PCB"
    done
}

# Freerouting 2.5.0 is built for Java 25.
java_bin() {
    local java="${JAVA:-}"
    if [[ -z "$java" ]]; then
        if command -v java >/dev/null 2>&1; then java="$(command -v java)"
        elif command -v nix >/dev/null 2>&1; then java="$(nix build --no-link --print-out-paths nixpkgs#jdk25_headless)/bin/java"
        fi
    fi
    local major
    major="$("${java:-false}" -version 2>&1 | sed -n 's/.*version "\([0-9]*\).*/\1/p' | head -n 1)"
    if [[ -z "$major" || "$major" -lt 25 ]]; then
        echo "pcb.sh: the autorouter needs Java 25 or newer (found: ${major:-none}). Set JAVA to a newer java." >&2
        return 1
    fi
    echo "$java"
}

# Routing takes 15 to 40 minutes: the autorouter, then the grid router for what it leaves open.
# The autorouter writes its result only at the end of a run, hence the time limit around it.
autoroute() {
    [[ -f "$FREEROUTING_JAR" ]] || { echo "pcb.sh: $FREEROUTING_JAR is missing; run the setup-toolchain target." >&2; return 1; }
    local java; java="$(java_bin)"
    mkdir -p "$REPORTS"
    bootstrap build_pcb.py dsn
    rm -f "$KICAD_DIR/$PCB_NAME.ses"
    timeout 30m "$java" -jar "$FREEROUTING_JAR" -de "$KICAD_DIR/$PCB_NAME.dsn" -do "$KICAD_DIR/$PCB_NAME.ses" \
        --router.autorouter.max_passes=4 --router.fanout.enabled=false --router.optimizer.enabled=false \
        --router.automatic_neckdown=true --gui.enabled=false >"$REPORTS/freerouting.log" 2>&1 || true
    [[ -f "$KICAD_DIR/$PCB_NAME.ses" ]] || { echo "pcb.sh: the autorouter wrote no result, see $REPORTS/freerouting.log" >&2; return 1; }
}

# Imports the autorouter's result and finishes the board. Can be repeated: the import replaces
# everything except the fixed routes.
finish_routing() {
    [[ -f "$KICAD_DIR/$PCB_NAME.ses" ]] || { echo "pcb.sh: no autorouter result ($PCB_NAME.ses); run route first." >&2; return 1; }
    bootstrap build_pcb.py ses
    bootstrap finish_route.py
    bootstrap build_pcb.py finish
    bootstrap finish_route.py --pours
    bootstrap build_pcb.py finish
    drc
}

case "${1:-}" in
    erc) erc ;;
    drc) drc ;;
    check-netlist) check_netlist ;;
    export) (cd "$PCB_ROOT/scripts" && "${KICAD_PYTHON:-python3}" export_fab.py) ;;
    render) render ;;
    # The three generator steps overwrite the KiCad files. See scripts/bootstrap/README.md.
    generate-library) shift; bootstrap make_lib.py "$@" ;;
    generate-schematic) bootstrap build_sch.py && erc && check_netlist ;;
    place) bootstrap build_pcb.py place && bootstrap check_overlap.py ;;
    route) autoroute && finish_routing ;;
    route-finish) finish_routing ;;
    *) echo "Usage: $0 erc|drc|check-netlist|export|render|generate-library <dir>|generate-schematic|place|route|route-finish" >&2
       exit 1 ;;
esac
