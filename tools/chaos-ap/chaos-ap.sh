#!/bin/sh
# chaos-ap.sh — controllable network fault injection for the reader<->server bench.
#
# Part B (network) of ATT-471. Runs ON the AP/gateway between an Attractap reader
# and the Attraccess server (OpenWRT router, or any Linux box with iptables + tc).
# Each preset deterministically reproduces one real-world failure class so it can
# be used as ground truth to validate the reader-side fixes:
#
#   blackhole   silent black-hole (DROP, no RST)            -> ATT-464 half-open sockets
#   netem       latency + packet loss (tc netem)            -> ATT-469 stalls / slow paths
#   flap        kill SSID and flap on an interval           -> ATT-465 / ATT-467 churn
#   dhcp-wedge  disable DHCP while keeping the SSID up       -> ATT-468 DHCP wedge
#
# Usage:
#   ./chaos-ap.sh <preset> on|off       enable / disable a single preset
#   ./chaos-ap.sh status                 show what is currently active
#   ./chaos-ap.sh clear                  disable everything, restore clean state
#
# Config is read from the environment (or the defaults below). Override per call:
#   READER_IP=192.168.8.123 ./chaos-ap.sh blackhole on
#   IFACE=br-lan DELAY=2000ms LOSS=30% ./chaos-ap.sh netem on
#   RADIO=radio0 FLAP_MIN=15 FLAP_MAX=30 ./chaos-ap.sh flap on
#
# POSIX sh / BusyBox ash compatible. Must run as root.

set -eu

# ----------------------------------------------------------------------------
# Config (override via environment)
# ----------------------------------------------------------------------------

# IP of the reader to black-hole (blackhole preset). Empty == all FORWARD traffic.
READER_IP="${READER_IP:-}"

# Interface that carries reader<->server traffic, where netem is attached.
# On a typical OpenWRT AP the LAN bridge faces the readers; override for WAN.
IFACE="${IFACE:-br-lan}"

# netem parameters (netem preset).
DELAY="${DELAY:-2000ms}"
LOSS="${LOSS:-30%}"

# Radio / DHCP section for the wifi + dhcp presets (OpenWRT uci names).
RADIO="${RADIO:-radio0}"
DHCP_SECTION="${DHCP_SECTION:-lan}"

# Flap timing in seconds (flap preset). Down for FLAP_DOWN, up for a random
# interval in [FLAP_MIN, FLAP_MAX].
FLAP_DOWN="${FLAP_DOWN:-5}"
FLAP_MIN="${FLAP_MIN:-15}"
FLAP_MAX="${FLAP_MAX:-30}"

# Where the flap background loop records its PID.
FLAP_PIDFILE="${FLAP_PIDFILE:-/tmp/chaos-ap-flap.pid}"

# ----------------------------------------------------------------------------
# Helpers
# ----------------------------------------------------------------------------

log() { printf 'chaos-ap: %s\n' "$*" >&2; }
die() { log "ERROR: $*"; exit 1; }

have() { command -v "$1" >/dev/null 2>&1; }

require_root() {
  [ "$(id -u)" = "0" ] || die "must run as root"
}

require_cmd() {
  have "$1" || die "required command not found: $1"
}

rand_between() {
  # Random integer in [$1, $2] using BusyBox awk (srand from time).
  awk -v a="$1" -v b="$2" 'BEGIN { srand(); print a + int(rand() * (b - a + 1)) }'
}

# ----------------------------------------------------------------------------
# blackhole — silent DROP, no RST. Reader keeps a half-open socket. (ATT-464)
# ----------------------------------------------------------------------------

blackhole_on() {
  require_cmd iptables
  if [ -n "$READER_IP" ]; then
    iptables -C FORWARD -s "$READER_IP" -j DROP 2>/dev/null \
      || iptables -A FORWARD -s "$READER_IP" -j DROP
    iptables -C FORWARD -d "$READER_IP" -j DROP 2>/dev/null \
      || iptables -A FORWARD -d "$READER_IP" -j DROP
    log "blackhole ON: dropping FORWARD to/from $READER_IP (no RST)"
  else
    iptables -C FORWARD -j DROP 2>/dev/null || iptables -A FORWARD -j DROP
    log "blackhole ON: dropping ALL FORWARD traffic (no RST)"
  fi
}

blackhole_off() {
  require_cmd iptables
  if [ -n "$READER_IP" ]; then
    while iptables -C FORWARD -s "$READER_IP" -j DROP 2>/dev/null; do
      iptables -D FORWARD -s "$READER_IP" -j DROP
    done
    while iptables -C FORWARD -d "$READER_IP" -j DROP 2>/dev/null; do
      iptables -D FORWARD -d "$READER_IP" -j DROP
    done
  else
    while iptables -C FORWARD -j DROP 2>/dev/null; do
      iptables -D FORWARD -j DROP
    done
  fi
  log "blackhole OFF"
}

# ----------------------------------------------------------------------------
# netem — latency + loss on $IFACE egress. (ATT-469)
# ----------------------------------------------------------------------------

netem_on() {
  require_cmd tc
  tc qdisc del dev "$IFACE" root 2>/dev/null || true
  tc qdisc add dev "$IFACE" root netem delay "$DELAY" loss "$LOSS"
  log "netem ON: dev $IFACE delay $DELAY loss $LOSS"
}

netem_off() {
  require_cmd tc
  tc qdisc del dev "$IFACE" root 2>/dev/null || true
  log "netem OFF: dev $IFACE"
}

# ----------------------------------------------------------------------------
# flap — kill the SSID and bring it back on a randomized interval. (ATT-465/467)
# ----------------------------------------------------------------------------

flap_loop() {
  while :; do
    wifi down "$RADIO" 2>/dev/null || ifconfig "$RADIO" down 2>/dev/null || true
    sleep "$FLAP_DOWN"
    wifi up "$RADIO" 2>/dev/null || ifconfig "$RADIO" up 2>/dev/null || true
    sleep "$(rand_between "$FLAP_MIN" "$FLAP_MAX")"
  done
}

flap_on() {
  have wifi || have ifconfig || die "neither 'wifi' (OpenWRT) nor 'ifconfig' available"
  if [ -f "$FLAP_PIDFILE" ] && kill -0 "$(cat "$FLAP_PIDFILE")" 2>/dev/null; then
    die "flap already running (pid $(cat "$FLAP_PIDFILE"))"
  fi
  flap_loop &
  echo $! > "$FLAP_PIDFILE"
  log "flap ON: $RADIO down ${FLAP_DOWN}s / up ${FLAP_MIN}-${FLAP_MAX}s (pid $(cat "$FLAP_PIDFILE"))"
}

flap_off() {
  if [ -f "$FLAP_PIDFILE" ]; then
    kill "$(cat "$FLAP_PIDFILE")" 2>/dev/null || true
    rm -f "$FLAP_PIDFILE"
  fi
  wifi up "$RADIO" 2>/dev/null || ifconfig "$RADIO" up 2>/dev/null || true
  log "flap OFF: $RADIO restored"
}

# ----------------------------------------------------------------------------
# dhcp-wedge — stop handing out leases, keep the SSID + DNS up. (ATT-468)
# ----------------------------------------------------------------------------

dhcp_wedge_on() {
  have uci || die "dhcp-wedge requires OpenWRT uci"
  uci set "dhcp.${DHCP_SECTION}.ignore=1"
  uci commit dhcp
  /etc/init.d/dnsmasq restart >/dev/null 2>&1 || true
  log "dhcp-wedge ON: dhcp.${DHCP_SECTION}.ignore=1 (SSID + DNS stay up, no leases)"
}

dhcp_wedge_off() {
  have uci || die "dhcp-wedge requires OpenWRT uci"
  uci set "dhcp.${DHCP_SECTION}.ignore=0"
  uci commit dhcp
  /etc/init.d/dnsmasq restart >/dev/null 2>&1 || true
  log "dhcp-wedge OFF: dhcp.${DHCP_SECTION}.ignore=0"
}

# ----------------------------------------------------------------------------
# status / clear
# ----------------------------------------------------------------------------

status() {
  echo "== chaos-ap status =="
  if have iptables; then
    echo "-- iptables FORWARD DROP rules --"
    iptables -S FORWARD 2>/dev/null | grep -- '-j DROP' || echo "(none)"
  fi
  if have tc; then
    echo "-- tc qdisc on $IFACE --"
    tc qdisc show dev "$IFACE" 2>/dev/null || echo "(none)"
  fi
  echo "-- flap --"
  if [ -f "$FLAP_PIDFILE" ] && kill -0 "$(cat "$FLAP_PIDFILE")" 2>/dev/null; then
    echo "running (pid $(cat "$FLAP_PIDFILE"), radio $RADIO)"
  else
    echo "stopped"
  fi
  if have uci; then
    echo "-- dhcp.${DHCP_SECTION}.ignore --"
    uci -q get "dhcp.${DHCP_SECTION}.ignore" || echo "0"
  fi
}

clear_all() {
  blackhole_off || true
  netem_off || true
  flap_off || true
  if have uci; then dhcp_wedge_off || true; fi
  log "all presets cleared"
}

# ----------------------------------------------------------------------------
# Dispatch
# ----------------------------------------------------------------------------

usage() {
  cat >&2 <<'EOF'
chaos-ap.sh — network fault injection for the reader<->server bench (ATT-471 part B)

Presets:
  blackhole   silent DROP, no RST            -> ATT-464 half-open sockets
  netem       latency + packet loss          -> ATT-469 stalls
  flap        kill SSID, flap on interval    -> ATT-465 / ATT-467 churn
  dhcp-wedge  no DHCP leases, SSID stays up  -> ATT-468 DHCP wedge

Usage:
  chaos-ap.sh <preset> on|off
  chaos-ap.sh status
  chaos-ap.sh clear

Config via env (defaults in script): READER_IP IFACE DELAY LOSS RADIO
  DHCP_SECTION FLAP_DOWN FLAP_MIN FLAP_MAX

Examples:
  READER_IP=192.168.8.123 chaos-ap.sh blackhole on
  IFACE=br-lan DELAY=2000ms LOSS=30% chaos-ap.sh netem on
  RADIO=radio0 FLAP_MIN=15 FLAP_MAX=30 chaos-ap.sh flap on
EOF
  exit "${1:-0}"
}

PRESET="${1:-}"
ACTION="${2:-}"

# Run on_fn for "on", off_fn for "off", else print usage and exit 1.
toggle() {
  case "$ACTION" in
    on)  "$1" ;;
    off) "$2" ;;
    *)   log "preset '$PRESET' needs an action: on|off"; usage 1 ;;
  esac
}

case "$PRESET" in
  -h|--help|help|"") usage 0 ;;
esac

require_root

case "$PRESET" in
  blackhole)  toggle blackhole_on  blackhole_off ;;
  netem)      toggle netem_on      netem_off ;;
  flap)       toggle flap_on       flap_off ;;
  dhcp-wedge) toggle dhcp_wedge_on dhcp_wedge_off ;;
  status)     status ;;
  clear)      clear_all ;;
  *) log "unknown preset: $PRESET"; usage 1 ;;
esac
