#!/bin/sh
# Shared helpers of the backup sidecar (POSIX sh, busybox ash compatible). Sourced, never executed.
# shellcheck disable=SC2034 # the variables are used by the scripts that source this file

STATE_DIR="${BACKUP_STATE_DIR:-/var/lib/backup}"
DATA_DIR="${BACKUP_DATA_DIR:-/external-storage}"
DUMP_DIR="$STATE_DIR/dump"
DUMP_FILE="$DUMP_DIR/attraccess.dump"
METRIC_FILE="$STATE_DIR/backup_last_success_timestamp_seconds.prom"
RESTIC_HOST="attraccess"

log() {
  printf '%s backup: %s\n' "$(date -u '+%Y-%m-%dT%H:%M:%SZ')" "$*"
}

fail() {
  log "ERROR: $*" >&2
  exit 1
}

# Maps the BACKUP_* settings to restic's environment. Credentials of the target (AWS_ACCESS_KEY_ID, B2_*, ...) pass through.
configure_restic() {
  [ -n "${BACKUP_REPOSITORY:-}" ] || return 1
  [ -n "${BACKUP_PASSWORD:-}" ] || fail "BACKUP_PASSWORD is required with BACKUP_REPOSITORY (it encrypts the repository)"
  export RESTIC_REPOSITORY="$BACKUP_REPOSITORY"
  export RESTIC_PASSWORD="$BACKUP_PASSWORD"
  export RESTIC_CACHE_DIR="$STATE_DIR/cache"
  mkdir -p "$RESTIC_CACHE_DIR" "$DUMP_DIR"
}

database_url() {
  url="${BACKUP_DATABASE_URL:-${DATABASE_URL:-}}"
  [ -n "$url" ] || fail "DATABASE_URL (or BACKUP_DATABASE_URL) is required"
  printf '%s' "$url"
}

# Waits until PostgreSQL accepts connections; fails loudly after BACKUP_PG_WAIT_SECONDS (default 120).
wait_for_postgres() {
  url="$(database_url)"
  limit="${BACKUP_PG_WAIT_SECONDS:-120}"
  waited=0
  while ! pg_isready -q -d "$url"; do
    [ "$waited" -lt "$limit" ] || fail "PostgreSQL did not become ready within ${limit}s"
    [ "$waited" -ne 0 ] || log "waiting for PostgreSQL"
    sleep 2
    waited=$((waited + 2))
  done
}

# True for a 5-field cron expression whose numbers are in range (minute 0-59, hour 0-23, day 1-31, month 1-12,
# weekday 0-7). crond silently skips a line it cannot parse, which would turn into backups that never run.
schedule_valid() {
  printf '%s\n' "$1" | awk '{
    if (NF != 5) exit 1
    split("0 0 1 1 0", low, " "); split("59 23 31 12 7", high, " ")
    for (i = 1; i <= 5; i++) {
      if ($i !~ /^[0-9A-Za-z*,\/-]+$/) exit 1
      n = split($i, parts, /[*,\/-]/)
      for (j = 1; j <= n; j++)
        if (parts[j] ~ /^[0-9]+$/ && (parts[j] + 0 < low[i] || parts[j] + 0 > high[i])) exit 1
    }
  }'
}
