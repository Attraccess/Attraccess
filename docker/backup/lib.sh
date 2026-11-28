#!/bin/sh
# Shared helpers of the backup sidecar (POSIX sh, busybox ash compatible). Sourced, never executed.
# shellcheck disable=SC2034 # the variables are used by the scripts that source this file

# Dumps, the restic cache and restored files are readable by root only, also for manual runs (docker exec).
umask 077

STATE_DIR="${BACKUP_STATE_DIR:-/var/lib/backup}"
DATA_DIR="${BACKUP_DATA_DIR:-/external-storage}"
DUMP_DIR="$STATE_DIR/dump"
DUMP_FILE="$DUMP_DIR/attraccess.dump"
# Status of the scheduler, shared read-only with the attraccess service: it only starts while this file exists.
# `enabled` (settings present and valid) or `disabled` (BACKUP_DISABLED=true).
STATUS_DIR="${BACKUP_STATUS_DIR:-/var/lib/backup-status}"
STATUS_FILE="$STATUS_DIR/status"
# Prometheus textfile metrics next to it (node-exporter reads *.prom from that volume). Their values are kept in
# STATE_DIR (mode, started, last_run, last_run_success, last_success), so they survive restarts of the container.
METRICS_FILE="$STATUS_DIR/backup.prom"
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

# For scripts with an EXIT trap (it removes the plaintext dump): busybox sh does not run that trap when a signal ends
# the script (Ctrl-C on a manual run, kill, a closed terminal), so exit on those signals. The trap waits for the command
# that is running. SIGKILL (the container stops or restarts) cannot be caught.
exit_on_signals() {
  for signal in HUP:129 INT:130 TERM:143; do
    # shellcheck disable=SC2064 # the exit code is set now, per signal
    trap "log 'ERROR: the run was interrupted' >&2; exit ${signal#*:}" "${signal%:*}"
  done
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

# Opens the restic repository. Exit codes of `restic cat config`: 0 opened, 10 the repository does not exist yet (first
# run: it is initialised, which also creates a missing bucket), 12 wrong password. The probe gets
# BACKUP_CONNECT_TIMEOUT_SECONDS (default 120): restic itself retries an unreachable target for about 15 minutes, which
# would delay the failure (and its alert) for that long. Call configure_restic first.
open_repository() {
  probe=0
  limit="${BACKUP_CONNECT_TIMEOUT_SECONDS:-120}"
  probe_started=$(date +%s)
  # 9>&-: busybox timeout leaves a watcher process behind, which must not inherit the run lock (fd 9 in backup.sh).
  timeout "$limit" restic cat config >/dev/null 2>"$STATE_DIR/restic-probe.err" 9>&- || probe=$?
  # restic handles the SIGTERM of timeout itself and exits with 1, so a timeout shows only in the elapsed time.
  if [ "$probe" -ne 0 ] && [ $(($(date +%s) - probe_started)) -ge "$limit" ]; then
    tail -n 3 "$STATE_DIR/restic-probe.err" >&2
    fail "cannot reach the restic repository within ${limit}s (network down, wrong address?)"
  fi
  case "$probe" in
    0) ;;
    10)
      log "initialising the restic repository (it does not exist yet)"
      restic init
      ;;
    12)
      cat "$STATE_DIR/restic-probe.err" >&2
      fail "cannot open the restic repository: wrong BACKUP_PASSWORD for the existing repository"
      ;;
    *)
      cat "$STATE_DIR/restic-probe.err" >&2
      fail "cannot open the restic repository (restic exit code $probe; check the address, the credentials of the target and the network)"
      ;;
  esac
}

# Writes the scheduler status (see STATUS_FILE); readable by the attraccess container.
write_status() {
  mkdir -p "$STATUS_DIR"
  chmod 0755 "$STATUS_DIR"
  printf '%s\n' "$1" >"$STATUS_FILE.tmp"
  chmod 0644 "$STATUS_FILE.tmp"
  mv "$STATUS_FILE.tmp" "$STATUS_FILE"
}

clear_status() {
  rm -f "$STATUS_FILE" "$STATUS_FILE.tmp"
}

# Remembers one metric value (see METRICS_FILE).
set_state() {
  mkdir -p "$STATE_DIR"
  printf '%s\n' "$2" >"$STATE_DIR/$1"
}

get_state() {
  cat "$STATE_DIR/$1" 2>/dev/null || true
}

# True for a whole number above 0 (leading zeros allowed).
positive_whole_number() {
  case "$1" in
    *[!0-9]*) return 1 ;;
    *[1-9]*) return 0 ;;
    *) return 1 ;; # empty or only zeros
  esac
}

# The longest time without a successful backup before the BackupTooOld alert fires (BACKUP_MAX_AGE_HOURS, default 30:
# one daily run plus slack).
max_age_valid() {
  positive_whole_number "${BACKUP_MAX_AGE_HOURS:-30}"
}

# That time in seconds; call max_age_valid first. Leading zeros are removed because shell arithmetic reads them as
# octal: `010` would mean 8 hours, and `08` would end the script before it reports anything.
max_age_seconds() {
  hours="${BACKUP_MAX_AGE_HOURS:-30}"
  echo "$((${hours#"${hours%%[!0]*}"} * 3600))"
}

# Writes METRICS_FILE from the remembered values. backup_configured is 0 while the service refuses to start for missing
# or invalid settings (and absent while backups are disabled on purpose), so the alerts also see that case.
write_metrics() {
  mode="$(get_state mode)"
  mkdir -p "$STATUS_DIR"
  chmod 0755 "$STATUS_DIR"
  {
    metric() {
      [ -n "$3" ] || return 0
      printf '# HELP %s %s\n# TYPE %s gauge\n%s %s\n' "$1" "$2" "$1" "$1" "$3"
    }
    case "$mode" in
      disabled) metric backup_disabled "1 when backups are switched off on purpose (BACKUP_DISABLED=true)." 1 ;;
      unconfigured) metric backup_configured "1 when the backup is set up and scheduled, 0 when its settings are missing or invalid." 0 ;;
      *)
        metric backup_configured "1 when the backup is set up and scheduled, 0 when its settings are missing or invalid." 1
        metric backup_disabled "1 when backups are switched off on purpose (BACKUP_DISABLED=true)." 0
        if max_age_valid; then
          metric backup_max_age_seconds "Longest time without a successful backup before it counts as too old." \
            "$(max_age_seconds)"
        fi
        metric backup_scheduler_start_timestamp_seconds "Unix time the backup scheduler started." "$(get_state started)"
        ;;
    esac
    metric backup_last_run_timestamp_seconds "Unix time the last backup run ended." "$(get_state last_run)"
    metric backup_last_run_success "1 when the last backup run succeeded, 0 when it failed." "$(get_state last_run_success)"
    metric backup_last_success_timestamp_seconds "Unix time of the last successful backup." "$(get_state last_success)"
  } >"$METRICS_FILE.tmp"
  # No secret in it, and node-exporter (runs as nobody) must be able to read it.
  chmod 0644 "$METRICS_FILE.tmp"
  mv "$METRICS_FILE.tmp" "$METRICS_FILE"
}

# Records the end of a backup run (1 = success, 0 = failure) and updates the metrics.
record_run() {
  now="$(date +%s)"
  set_state last_run "$now"
  set_state last_run_success "$1"
  [ "$1" != 1 ] || set_state last_success "$now"
  write_metrics
}

# True for BACKUP_DISABLED=true (also 1/yes, any case): backups are switched off on purpose.
backups_disabled() {
  case "$(printf '%s' "${BACKUP_DISABLED:-}" | tr '[:upper:]' '[:lower:]')" in
    true | 1 | yes) return 0 ;;
    *) return 1 ;;
  esac
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

# The longest time restic gets to open the repository (see open_repository): unset, or a whole number of seconds above 0.
# `timeout 0` would wait forever, so zero is refused; `timeout` reads leading zeros as decimal.
connect_timeout_valid() {
  positive_whole_number "${BACKUP_CONNECT_TIMEOUT_SECONDS:-120}"
}

# Prints why the database URL (BACKUP_DATABASE_URL, else DATABASE_URL) cannot be used, and nothing when it can. Only
# looks at the setting, never at the database. The message must not contain the URL (it holds the password).
database_url_problem() {
  setting=DATABASE_URL
  [ -z "${BACKUP_DATABASE_URL:-}" ] || setting=BACKUP_DATABASE_URL
  case "${BACKUP_DATABASE_URL:-${DATABASE_URL:-}}" in
    postgres://* | postgresql://*) ;;
    '') echo "DATABASE_URL (or BACKUP_DATABASE_URL) is not set" ;;
    *) echo "$setting must be a postgres:// or postgresql:// URL" ;;
  esac
}

# Reads DATABASE_URL (or BACKUP_DATABASE_URL) and sets PG_URL to the same URL WITHOUT the password, and exports the
# (percent-decoded) password as PGPASSWORD. The PostgreSQL tools get PG_URL on their command line, which every process
# on the host can read (ps); libpq takes the password from the environment. The password may be in the user info
# (user:password@host) or in a `password=` query parameter; both are removed from PG_URL (the query parameter wins,
# like in libpq). Call it in the main shell, not in $(...).
connect_database() {
  problem="$(database_url_problem)"
  [ -z "$problem" ] || fail "$problem"
  url="${BACKUP_DATABASE_URL:-${DATABASE_URL:-}}"
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
