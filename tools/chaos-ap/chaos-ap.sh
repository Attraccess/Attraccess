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

# Optional Attraccess server IP. If READER_IP and SERVER_IP share the interface
# subnet, bridge netfilter is enabled so same-LAN br-lan traffic reaches FORWARD.
SERVER_IP="${SERVER_IP:-}"

# Interface that carries reader<->server traffic, where netem is attached.
# On a typical OpenWRT AP the LAN bridge faces the readers; override for WAN.
IFACE="${IFACE:-br-lan}"

# netem parameters (netem preset).
DELAY="${DELAY:-2000ms}"
LOSS="${LOSS:-30%}"

# Flow offload handling is warning-only by default because GL.iNet firewall
# reload can desync custom chains; set to 1 for temporary, uncommitted uci edits.
CHAOS_AP_DISABLE_FLOW_OFFLOAD="${CHAOS_AP_DISABLE_FLOW_OFFLOAD:-0}"
CHAOS_AP_FIREWALL_RESTART="${CHAOS_AP_FIREWALL_RESTART:-reload}"

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

BLACKHOLE_CHAIN="CHAOS_AP_BLACKHOLE"
LOSS_CHAIN="CHAOS_AP_LOSS"

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

ipt_ensure_chain() {
  chain="$1"
  iptables -N "$chain" 2>/dev/null || true
  iptables -F "$chain"
}

ipt_ensure_forward_jump_top() {
  chain="$1"
  # Insert before OpenWRT zone_* and established ACCEPT rules. If the jump is
  # already present, move it back to the top in case another reload reordered it.
  while iptables -C FORWARD -j "$chain" 2>/dev/null; do
    iptables -D FORWARD -j "$chain"
  done
  iptables -I FORWARD 1 -j "$chain"
}

ipt_remove_chain() {
  chain="$1"
  while iptables -C FORWARD -j "$chain" 2>/dev/null; do
    iptables -D FORWARD -j "$chain"
  done
  iptables -F "$chain" 2>/dev/null || true
  iptables -X "$chain" 2>/dev/null || true
}

loss_probability() {
  printf '%s\n' "$LOSS" | awk '
    /^([0-9]+|[0-9]*\.[0-9]+)%$/ {
      gsub(/%/, ""); p = $0 / 100;
      if (p < 0 || p > 1) exit 1;
      printf "%.6f\n", p; exit 0
    }
    /^0?(\.[0-9]+)?$/ { printf "%.6f\n", $0; exit 0 }
    /^1(\.0+)?$/ { printf "1.000000\n"; exit 0 }
    { exit 1 }
  ' || die "LOSS must be a percentage like 30% or a probability 0..1 (got '$LOSS')"
}

same_ipv4_subnet() {
  # Usage: same_ipv4_subnet 192.168.8.10 192.168.8.20 24
  awk -v a="$1" -v b="$2" -v prefix="$3" '
    function ip2num(ip, parts, n) {
      n = split(ip, parts, ".")
      if (n != 4) return -1
      if (parts[1] < 0 || parts[1] > 255 || parts[2] < 0 || parts[2] > 255 || parts[3] < 0 || parts[3] > 255 || parts[4] < 0 || parts[4] > 255) return -1
      return (parts[1] * 16777216) + (parts[2] * 65536) + (parts[3] * 256) + parts[4]
    }
    function pow2(n, r, i) { r = 1; for (i = 0; i < n; i++) r *= 2; return r }
    BEGIN {
      if (prefix < 0 || prefix > 32) exit 1
      ai = ip2num(a); bi = ip2num(b)
      if (ai < 0 || bi < 0) exit 1
      block = pow2(32 - prefix)
      exit int(ai / block) == int(bi / block) ? 0 : 1
    }
  '
}

iface_prefix() {
  if have ip; then
    ip -o -4 addr show dev "$IFACE" 2>/dev/null \
      | awk '{ for (i = 1; i <= NF; i++) if ($i == "inet") { split($(i + 1), a, "/"); print a[2]; exit } }'
  fi
}

ensure_bridge_netfilter_if_needed() {
  [ -n "$READER_IP" ] || return 0
  [ -n "$SERVER_IP" ] || return 0
  bridge_nf="/proc/sys/net/bridge/bridge-nf-call-iptables"
  [ -w "$bridge_nf" ] || return 0

  prefix="$(iface_prefix)"
  [ -n "$prefix" ] || prefix="24"

  if same_ipv4_subnet "$READER_IP" "$SERVER_IP" "$prefix"; then
    if [ "$(cat "$bridge_nf" 2>/dev/null || echo 0)" != "1" ]; then
      echo 1 > "$bridge_nf"
      log "enabled bridge-nf-call-iptables for bridged $READER_IP <-> $SERVER_IP traffic"
    fi
  fi
}

flow_offload_enabled() {
  have uci || return 1
  flow="$(uci -q get firewall.@defaults[0].flow_offloading 2>/dev/null || echo 0)"
  hw="$(uci -q get firewall.@defaults[0].flow_offloading_hw 2>/dev/null || echo 0)"
  [ "$flow" = "1" ] || [ "$hw" = "1" ]
}

maybe_disable_flow_offload() {
  flow_offload_enabled || return 0

  if [ "$CHAOS_AP_DISABLE_FLOW_OFFLOAD" = "1" ]; then
    uci set firewall.@defaults[0].flow_offloading='0'
    uci set firewall.@defaults[0].flow_offloading_hw='0'
    case "$CHAOS_AP_FIREWALL_RESTART" in
      reload|restart|start)
        "/etc/init.d/firewall" "$CHAOS_AP_FIREWALL_RESTART" >/dev/null 2>&1 || true
        ;;
      none)
        log "flow offload disabled in uncommitted uci state; firewall restart skipped"
        ;;
      *)
        die "CHAOS_AP_FIREWALL_RESTART must be reload, restart, start, or none"
        ;;
    esac
    if have conntrack; then
      conntrack -F >/dev/null 2>&1 || true
    fi
    log "flow offload disabled for this experiment (not committed)"
  else
    log "WARNING: OpenWRT flow offload is enabled; established flows may bypass iptables"
    log "WARNING: set CHAOS_AP_DISABLE_FLOW_OFFLOAD=1 to disable temporarily, or reboot clients/router to clear offloaded flows"
  fi
}

add_reader_scoped_drop() {
  chain="$1"
  if [ -n "$READER_IP" ]; then
    iptables -A "$chain" -s "$READER_IP" -j DROP
    iptables -A "$chain" -d "$READER_IP" -j DROP
  else
    iptables -A "$chain" -j DROP
  fi
}

add_reader_scoped_statistic_drop() {
  chain="$1"
  probability="$2"
  if [ -n "$READER_IP" ]; then
    iptables -A "$chain" -s "$READER_IP" -m statistic --mode random --probability "$probability" -j DROP
    iptables -A "$chain" -d "$READER_IP" -m statistic --mode random --probability "$probability" -j DROP
  else
    iptables -A "$chain" -m statistic --mode random --probability "$probability" -j DROP
  fi
}

# ----------------------------------------------------------------------------
# blackhole — silent DROP, no RST. Reader keeps a half-open socket. (ATT-464)
# ----------------------------------------------------------------------------

blackhole_on() {
  require_cmd iptables
  maybe_disable_flow_offload
  ensure_bridge_netfilter_if_needed
  ipt_ensure_chain "$BLACKHOLE_CHAIN"
  add_reader_scoped_drop "$BLACKHOLE_CHAIN"
  ipt_ensure_forward_jump_top "$BLACKHOLE_CHAIN"
  if [ -n "$READER_IP" ]; then
    log "blackhole ON: dropping FORWARD to/from $READER_IP at top of chain (no RST)"
  else
    log "blackhole ON: dropping ALL FORWARD traffic at top of chain (no RST)"
  fi
}

blackhole_off() {
  require_cmd iptables
  ipt_remove_chain "$BLACKHOLE_CHAIN"
  # Backward compatibility: remove rules created by older versions that appended
  # raw DROP rules directly to FORWARD.
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

statistic_loss_on() {
  require_cmd iptables
  probability="$(loss_probability)"
  maybe_disable_flow_offload
  ensure_bridge_netfilter_if_needed
  ipt_ensure_chain "$LOSS_CHAIN"
  add_reader_scoped_statistic_drop "$LOSS_CHAIN" "$probability"
  ipt_ensure_forward_jump_top "$LOSS_CHAIN"
  if [ -n "$READER_IP" ]; then
    log "statistic loss ON: dropping random $LOSS of FORWARD traffic to/from $READER_IP (netem unavailable)"
  else
    log "statistic loss ON: dropping random $LOSS of ALL FORWARD traffic (netem unavailable)"
  fi
}

statistic_loss_off() {
  require_cmd iptables
  ipt_remove_chain "$LOSS_CHAIN"
  log "statistic loss OFF"
}

netem_on() {
  if ! have tc; then
    log "WARNING: tc not found; falling back to iptables statistic loss only"
    statistic_loss_on
    return 0
  fi

  tc qdisc del dev "$IFACE" root 2>/dev/null || true
  if tc qdisc add dev "$IFACE" root netem delay "$DELAY" loss "$LOSS" 2>/tmp/chaos-ap-netem.err; then
    log "netem ON: dev $IFACE delay $DELAY loss $LOSS"
  else
    err="$(cat /tmp/chaos-ap-netem.err 2>/dev/null || true)"
    rm -f /tmp/chaos-ap-netem.err
    log "WARNING: tc netem unavailable on $IFACE (${err:-tc qdisc add failed}); falling back to iptables statistic loss only"
    statistic_loss_on
  fi
}

netem_off() {
  if have tc; then
    tc qdisc del dev "$IFACE" root 2>/dev/null || true
  fi
  if have iptables; then
    statistic_loss_off || true
  fi
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
    echo "-- iptables FORWARD chaos jumps --"
    iptables -S FORWARD 2>/dev/null | grep -- "-j CHAOS_AP_" || echo "(none)"
    echo "-- $BLACKHOLE_CHAIN --"
    iptables -S "$BLACKHOLE_CHAIN" 2>/dev/null || echo "(none)"
    echo "-- $LOSS_CHAIN --"
    iptables -S "$LOSS_CHAIN" 2>/dev/null || echo "(none)"
  fi
  if have tc; then
    echo "-- tc qdisc on $IFACE --"
    tc qdisc show dev "$IFACE" 2>/dev/null || echo "(none)"
  fi
  if have uci; then
    echo "-- OpenWRT flow offload --"
    printf 'flow_offloading=%s\n' "$(uci -q get firewall.@defaults[0].flow_offloading 2>/dev/null || echo 0)"
    printf 'flow_offloading_hw=%s\n' "$(uci -q get firewall.@defaults[0].flow_offloading_hw 2>/dev/null || echo 0)"
  fi
  if [ -r /proc/sys/net/bridge/bridge-nf-call-iptables ]; then
    echo "-- bridge netfilter --"
    printf 'bridge-nf-call-iptables=%s\n' "$(cat /proc/sys/net/bridge/bridge-nf-call-iptables)"
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
  netem       latency + packet loss          -> ATT-469 stalls (falls back to iptables statistic loss)
  flap        kill SSID, flap on interval    -> ATT-465 / ATT-467 churn
  dhcp-wedge  no DHCP leases, SSID stays up  -> ATT-468 DHCP wedge

Usage:
  chaos-ap.sh <preset> on|off
  chaos-ap.sh status
  chaos-ap.sh clear

Config via env (defaults in script): READER_IP SERVER_IP IFACE DELAY LOSS RADIO
  DHCP_SECTION FLAP_DOWN FLAP_MIN FLAP_MAX CHAOS_AP_DISABLE_FLOW_OFFLOAD

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
