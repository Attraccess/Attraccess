#!/usr/bin/env bash
# Every operation on the Touch P4 board, as the Nx targets of this project run them.
# Usage: tools/pcb.sh <command>      (see the case statement below, or the README)
set -eo pipefail

# Full-wave model of the Wi-Fi module's PCB antenna on the board at 2.4 and 5 GHz (sim/wifi_antenna.py). It
# needs a Python with openEMS,
# which OPENEMS_PYTHON names (Debian and Ubuntu: the package python3-openems), and no KiCad: so it runs
# before KiCad is looked for.
if [[ "${1:-}" == simulate-antenna ]]; then
    shift
    root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
    py="${OPENEMS_PYTHON:-python3}"
    "$py" -c 'import openEMS, CSXCAD' 2>/dev/null || {
        echo "pcb.sh: '$py' has no openEMS. Set OPENEMS_PYTHON to a Python that can import openEMS and CSXCAD." >&2; exit 1; }
    mkdir -p "$root/fab/reports"
    cd "$root/sim"
    "$py" -u wifi_antenna.py "$@" | grep --line-buffered -E '^(case|reference|board|display|in_case|metal_wall|faceplate|p3_[a-z_]+) ' | tee "$root/fab/reports/wifi-antenna.txt"
    exit "${PIPESTATUS[0]}"
fi

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
    # wider supply tracks, larger via pads, ground vias beside the fast signals' vias, stitching vias;
    # then KiCad's design rule check decides what of that stays
    bootstrap post_route.py
    bootstrap build_pcb.py finish
    bootstrap post_route.py --fix
    bootstrap build_pcb.py finish
    drc
    stamp board
}

export_fab() { (cd "$PCB_ROOT/scripts" && "${KICAD_PYTHON:-python3}" export_fab.py); }

# The generator is the master (docs/release.md): each generator step records what it wrote, and
# check-source fails when a KiCad file differs from that or the generator changed since.
stamp() { (cd "$PCB_ROOT/scripts" && "${KICAD_PYTHON:-python3}" check_source.py --stamp "$1"); }
check_source() { (cd "$PCB_ROOT/scripts" && "${KICAD_PYTHON:-python3}" check_source.py); }

# ngspice for the circuit simulations: NGSPICE, the PATH, or nixpkgs.
ngspice_bin() {
    if [[ -n "${NGSPICE:-}" ]]; then echo "$NGSPICE"
    elif command -v ngspice >/dev/null 2>&1; then command -v ngspice
    elif command -v nix >/dev/null 2>&1; then echo "$(nix build --no-link --print-out-paths nixpkgs#ngspice)/bin/ngspice"
    else echo "pcb.sh: ngspice is missing. Install it or set NGSPICE." >&2; return 1
    fi
}

# Field and circuit simulations on the routed board (sim/README.md). The board is read with KiCad's
# Python; the simulations need numpy only, so they run with it as well (SIM_PYTHON names another one).
simulate() {
    mkdir -p "$REPORTS"
    local spice; spice="$(ngspice_bin)"
    (cd "$PCB_ROOT/sim" && kicad_python dump_board.py "$PCB" "$REPORTS/board.json" >/dev/null)
    (cd "$PCB_ROOT/sim" && NGSPICE="$spice" "${SIM_PYTHON:-$KICAD_PYTHON}" -u run.py "$REPORTS/board.json" | tee "$REPORTS/simulation.txt"
     exit "${PIPESTATUS[0]}")
}

# Every footprint against JLCPCB's library footprint of its part number. Needs the internet.
check_footprints() { (cd "$PCB_ROOT/scripts" && kicad_python check_jlc_footprints.py); }

# The JLCPCB package in git must be the one this board gives. The export leaves out dates, so an
# unchanged board gives byte-identical files.
check_package() {
    export_fab >/dev/null
    local stale
    stale="$(git -C "$PCB_ROOT" diff --name-only -- fab/jlcpcb
             git -C "$PCB_ROOT" ls-files --others --exclude-standard -- fab/jlcpcb)"
    if [[ -n "$stale" ]]; then
        echo "$stale" >&2
        echo "pcb.sh: fab/jlcpcb did not match the board. Add and commit the files the export just wrote." >&2
        return 1
    fi
    echo "fab/jlcpcb matches the board"
}

case "${1:-}" in
    erc) erc ;;
    drc) drc ;;
    check-netlist) check_netlist ;;
    export) export_fab ;;
    check-package) check_package ;;
    check-footprints) check_footprints ;;
    simulate) simulate ;;
    render) render ;;
    # The three generator steps overwrite the KiCad files. See scripts/bootstrap/README.md.
    generate-library) shift; bootstrap make_lib.py "$@" ;;
    check-source) check_source ;;
    generate-schematic) bootstrap build_sch.py && erc && check_netlist && stamp schematic ;;
    place) bootstrap build_pcb.py place && bootstrap check_overlap.py ;;
    route) autoroute && finish_routing ;;
    route-finish) finish_routing ;;
    *) echo "Usage: $0 erc|drc|check-netlist|check-package|check-source|check-footprints|simulate|simulate-antenna|export|render|generate-library <dir>|generate-schematic|place|route|route-finish" >&2
       exit 1 ;;
esac
