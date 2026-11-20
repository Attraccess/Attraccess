#!/bin/sh
# Shared helpers of the backup sidecar (POSIX sh, busybox ash compatible). Sourced, never executed.
# shellcheck disable=SC2034 # the variables are used by the scripts that source this file

# Dumps, the restic cache and restored files are readable by root only, also for manual runs (docker exec).
umask 077

STATE_DIR="${BACKUP_STATE_DIR:-/var/lib/backup}"
DATA_DIR="${BACKUP_DATA_DIR:-/external-storage}"
DUMP_DIR="$STATE_DIR/dump"
DUMP_FILE="$DUMP_DIR/attraccess.dump"
METRIC_FILE="$STATE_DIR/backup_last_success_timestamp_seconds.prom"
# The restic host name groups this installation's snapshots: backup, forget --prune, snapshots and restore only see
# their own host. Keep the default unless several installations share one repository (then give each its own
# BACKUP_HOST). A replacement device restores with the same value (the default works without setting anything).
RESTIC_HOST="${BACKUP_HOST:-attraccess}"

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

# Decodes %XX escapes (the password part of a connection URL). Bytes, not characters: LC_ALL=C.
percent_decode() {
  printf '%s' "$1" | LC_ALL=C awk '
    BEGIN { hex = "0123456789abcdef" }
    {
      s = $0
      while ((i = match(s, /%[0-9A-Fa-f][0-9A-Fa-f]/)) > 0) {
        code = (index(hex, tolower(substr(s, i + 1, 1))) - 1) * 16 + index(hex, tolower(substr(s, i + 2, 1))) - 1
        printf "%s%c", substr(s, 1, i - 1), code
        s = substr(s, i + 3)
      }
      printf "%s", s
    }'
}

# Reads DATABASE_URL (or BACKUP_DATABASE_URL) and sets PG_URL to the same URL WITHOUT the password, and exports the
# (percent-decoded) password as PGPASSWORD. The PostgreSQL tools get PG_URL on their command line, which every process
# on the host can read (ps); libpq takes the password from the environment. The password may be in the user info
# (user:password@host) or in a `password=` query parameter; both are removed from PG_URL (the query parameter wins,
# like in libpq). Call it in the main shell, not in $(...).
connect_database() {
  url="${BACKUP_DATABASE_URL:-${DATABASE_URL:-}}"
  [ -n "$url" ] || fail "DATABASE_URL (or BACKUP_DATABASE_URL) is required"
  case "$url" in
    postgres://* | postgresql://*) ;;
    *) fail "DATABASE_URL must be a postgres:// or postgresql:// URL" ;;
  esac
  scheme="${url%%://*}"
  rest="${url#*://}"
  # The authority (user:password@host:port) ends at the first / or ?, like libpq reads it.
  authority="${rest%%/*}"
  authority="${authority%%\?*}"
  tail="${rest#"$authority"}"
  case "$authority" in
    *@*)
      userinfo="${authority%@*}"
      case "$userinfo" in
        *:*)
          PGPASSWORD="$(percent_decode "${userinfo#*:}")"
          export PGPASSWORD
          userinfo="${userinfo%%:*}"
          ;;
      esac
      authority="$userinfo@${authority##*@}"
      ;;
  esac
  db_path="${tail%%\?*}"
  query=""
  case "$tail" in *\?*) query="${tail#*\?}" ;; esac
  kept=""
  saved_ifs="$IFS"
  IFS='&'
  set -f
  for parameter in $query; do
    case "$parameter" in
      password=*)
        PGPASSWORD="$(percent_decode "${parameter#password=}")"
        export PGPASSWORD
        ;;
      ?*) kept="${kept:+$kept&}$parameter" ;;
    esac
  done
  set +f
  IFS="$saved_ifs"
  PG_URL="$scheme://$authority$db_path${kept:+?$kept}"
}

# Waits until PostgreSQL accepts connections; fails loudly after BACKUP_PG_WAIT_SECONDS (default 120).
wait_for_postgres() {
  limit="${BACKUP_PG_WAIT_SECONDS:-120}"
  waited=0
  while ! pg_isready -q -d "$PG_URL"; do
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
