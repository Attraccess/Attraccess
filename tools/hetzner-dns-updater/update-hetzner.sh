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
  NAME="$1"
  curl -s -H "Auth-API-Token: ${HETZNER_API_TOKEN}" \
    "${BASE_URL}/records?zone_id=${HETZNER_ZONE_ID}&name=${NAME}&type=A"
}

create_record() {
  NAME="$1"; VALUE="$2"
  curl -s -X POST -H "Auth-API-Token: ${HETZNER_API_TOKEN}" -H "Content-Type: application/json" \
    "${BASE_URL}/records" \
    -d "{\"value\":\"${VALUE}\",\"ttl\":${TTL},\"type\":\"A\",\"name\":\"${NAME}\",\"zone_id\":\"${HETZNER_ZONE_ID}\"}"
}

update_record() {
  RECORD_ID="$1"; NAME="$2"; VALUE="$3"
  curl -s -X PUT -H "Auth-API-Token: ${HETZNER_API_TOKEN}" -H "Content-Type: application/json" \
    "${BASE_URL}/records/${RECORD_ID}" \
    -d "{\"value\":\"${VALUE}\",\"ttl\":${TTL},\"type\":\"A\",\"name\":\"${NAME}\",\"zone_id\":\"${HETZNER_ZONE_ID}\"}"
}

# Fetch the zone name (e.g., example.com) for the given zone ID
get_zone_name() {
  curl -s -H "Auth-API-Token: ${HETZNER_API_TOKEN}" \
    "${BASE_URL}/zones/${HETZNER_ZONE_ID}" | jq -r '.zone.name // ""'
}

# Normalize a provided name to be relative to the zone
# Examples:
#  normalize_name "@" "example.com" -> @
#  normalize_name "example.com" "example.com" -> @
#  normalize_name "host.example.com" "example.com" -> host
#  normalize_name "*.host.example.com" "example.com" -> *.host
normalize_name() {
  RAW_NAME="$1"; ZONE_NAME="$2"
  if [ "${RAW_NAME}" = "@" ] || [ "${RAW_NAME}" = "" ]; then
    echo "@"; return 0
  fi
  if [ "${RAW_NAME}" = "${ZONE_NAME}" ]; then
    echo "@"; return 0
  fi
  CASE_SUFFIX=".${ZONE_NAME}"
  case "${RAW_NAME}" in
    *"${CASE_SUFFIX}") echo "${RAW_NAME%${CASE_SUFFIX}}" ;;
    *) echo "${RAW_NAME}" ;;
  esac
}

# Upsert (create or update) A record for a given name -> value
upsert_a_record() {
  NAME="$1"; VALUE="$2"
  RESP=$(get_record "${NAME}")
  RECORD_ID=$(echo "${RESP}" | jq -r '.records[0].id // ""')
  CURRENT_VALUE=$(echo "${RESP}" | jq -r '.records[0].value // ""')
  if [ "${RECORD_ID}" = "" ] || [ "${RECORD_ID}" = "null" ]; then
    log "creating A record ${NAME} -> ${VALUE}"
    create_record "${NAME}" "${VALUE}" >/dev/null || log "create failed for ${NAME}"
  else
    if [ "${CURRENT_VALUE}" != "${VALUE}" ]; then
      log "updating A record ${NAME}: ${CURRENT_VALUE} -> ${VALUE}"
      update_record "${RECORD_ID}" "${NAME}" "${VALUE}" >/dev/null || log "update failed for ${NAME}"
    else
      log "no change (${NAME} is ${VALUE})"
    fi
  fi
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

# Determine zone name and derive record names to manage
ZONE_NAME=$(get_zone_name)
if [ "${ZONE_NAME}" = "" ] || [ "${ZONE_NAME}" = "null" ]; then
  log "failed to determine zone name for id ${HETZNER_ZONE_ID}"
  exit 1
fi

# Derive the base name (relative to zone) and its wildcard counterpart
BASE_NAME=$(normalize_name "${RECORD_NAME}" "${ZONE_NAME}")
# If the provided base is already a wildcard (e.g., *.host), strip the prefix to get the plain label
PLAIN_LABEL="${BASE_NAME}"
case "${BASE_NAME}" in
  \*.*) PLAIN_LABEL="${BASE_NAME#*.}" ;;
esac
if [ "${PLAIN_LABEL}" = "@" ]; then
  WILDCARD_NAME="*"
else
  WILDCARD_NAME="*.${PLAIN_LABEL}"
fi

while true; do
  IP=$(get_lan_ip)
  if [ "${IP}" = "" ]; then
    log "could not determine LAN IP; retrying in 60s"
    sleep 60
    continue
  fi

  # Upsert for the base label and its wildcard variant
  upsert_a_record "${PLAIN_LABEL}" "${IP}"
  upsert_a_record "${WILDCARD_NAME}" "${IP}"

  sleep "${INTERVAL}"
done


