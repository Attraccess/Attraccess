#!/bin/sh
# Blackhole and latency/loss presets sourced by chaos-ap.sh.
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
