#!/bin/sh
set -eu

# Environment variables:
# - HETZNER_API_TOKEN (required)
# - HETZNER_ZONE_ID (required)
# - HETZNER_RECORD_NAME (default: @)
# - HETZNER_TTL (default: 300)
# - HETZNER_FORCE_IP (optional)
# - HETZNER_INTERVAL_SECONDS (default: 900)
# - HETZNER_DNS_UPDATER_ENABLED (must be "true" or "1" to run)

BASE_URL="https://dns.hetzner.com/api/v1"
RECORD_NAME="${HETZNER_RECORD_NAME:-@}"
TTL="${HETZNER_TTL:-300}"
INTERVAL="${HETZNER_INTERVAL_SECONDS:-900}"

log() {
  printf '%s %s\n' "[hetzner]" "$*"
}

get_lan_ip() {
  if [ "${HETZNER_FORCE_IP:-}" != "" ]; then
    echo "${HETZNER_FORCE_IP}"
    return 0
  fi

  # Prefer the source IP of an outbound route
  IP=$(ip -4 route get 1.1.1.1 2>/dev/null | awk '/src/ {for(i=1;i<=NF;i++){if($i=="src"){print $(i+1); exit}}}') || IP=""
  if [ "${IP}" = "" ]; then
    # Fallback: first IPv4 from hostname -I
    IP=$(hostname -I 2>/dev/null | awk '{for(i=1;i<=NF;i++){if($i ~ /\./){print $i; exit}}}') || IP=""
  fi
  if [ "${IP}" = "" ]; then
    # Fallback: first IPv4 from ip addr
    IP=$(ip -4 addr show 2>/dev/null | awk '/inet /{print $2}' | cut -d/ -f1 | head -n1) || IP=""
  fi
  echo "${IP}"
}

get_record() {
  curl -s -H "Auth-API-Token: ${HETZNER_API_TOKEN}" \
    "${BASE_URL}/records?zone_id=${HETZNER_ZONE_ID}&name=${RECORD_NAME}&type=A"
}

create_record() {
  VALUE="$1"
  curl -s -X POST -H "Auth-API-Token: ${HETZNER_API_TOKEN}" -H "Content-Type: application/json" \
    "${BASE_URL}/records" \
    -d "{\"value\":\"${VALUE}\",\"ttl\":${TTL},\"type\":\"A\",\"name\":\"${RECORD_NAME}\",\"zone_id\":\"${HETZNER_ZONE_ID}\"}"
}

update_record() {
  RECORD_ID="$1"; VALUE="$2"
  curl -s -X PUT -H "Auth-API-Token: ${HETZNER_API_TOKEN}" -H "Content-Type: application/json" \
    "${BASE_URL}/records/${RECORD_ID}" \
    -d "{\"value\":\"${VALUE}\",\"ttl\":${TTL},\"type\":\"A\",\"name\":\"${RECORD_NAME}\",\"zone_id\":\"${HETZNER_ZONE_ID}\"}"
}

require_env() {
  VAR_NAME="$1"
  if [ "${!VAR_NAME:-}" = "" ]; then
    log "missing required env var: ${VAR_NAME}"
    exit 1
  fi
}

# Gate: require explicit enable to proceed
if [ "${HETZNER_DNS_UPDATER_ENABLED:-}" != "true" ] && [ "${HETZNER_DNS_UPDATER_ENABLED:-}" != "1" ]; then
  log "disabled; set HETZNER_DNS_UPDATER_ENABLED=true to enable"
  # Idle instead of exiting to avoid restart loops with restart: unless-stopped
  tail -f /dev/null
fi

require_env HETZNER_API_TOKEN
require_env HETZNER_ZONE_ID

while true; do
  IP=$(get_lan_ip)
  if [ "${IP}" = "" ]; then
    log "could not determine LAN IP; retrying in 60s"
    sleep 60
    continue
  fi

  RESP=$(get_record)
  RECORD_ID=$(echo "${RESP}" | jq -r '.records[0].id // ""')
  CURRENT_VALUE=$(echo "${RESP}" | jq -r '.records[0].value // ""')

  if [ "${RECORD_ID}" = "" ] || [ "${RECORD_ID}" = "null" ]; then
    log "creating A record ${RECORD_NAME} -> ${IP}"
    create_record "${IP}" >/dev/null || log "create failed"
  else
    if [ "${CURRENT_VALUE}" != "${IP}" ]; then
      log "updating A record ${RECORD_NAME}: ${CURRENT_VALUE} -> ${IP}"
      update_record "${RECORD_ID}" "${IP}" >/dev/null || log "update failed"
    else
      log "no change (${RECORD_NAME} is ${IP})"
    fi
  fi

  sleep "${INTERVAL}"
done


