#!/bin/sh
# WiFi flapping and DHCP-wedge presets sourced by chaos-ap.sh.
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
