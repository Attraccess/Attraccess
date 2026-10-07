#!/bin/sh
# Shared firewall setup for chaos-ap presets.
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
