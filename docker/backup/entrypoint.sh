#!/bin/sh
# Commands: run (default: scheduler), backup (one run now), restore [--force] [snapshot], snapshots (list them),
# restic <args> (restic with the repository settings), any other command is executed.
set -eu
LIB="$(dirname "$(readlink -f "$0")")"
# shellcheck source=lib.sh
. "$LIB/lib.sh"

# BACKUP_DISABLED=true: no backups, on purpose. Reports `disabled` (the attraccess service starts) and waits.
idle_disabled() {
  trap 'clear_status; kill "$sleeper" 2>/dev/null; exit 0' TERM INT
  log "WARNING: backups are DISABLED on purpose (BACKUP_DISABLED=true): nothing is backed up."
  set_state mode disabled
  write_metrics
  write_status disabled
  while :; do
    sleep 3600 >/dev/null 2>&1 &
    sleeper=$!
    wait "$sleeper"
  done
}

# Refuses to start without the backup settings: the container exits with an error (and is restarted), and the
# attraccess service, which waits for STATUS_FILE, does not start. That way a device without backups cannot go
# unnoticed. BACKUP_DISABLED=true switches backups off on purpose. Only the settings are checked here, not the
# repository: a target that cannot be reached (internet down at boot) must not keep Attraccess from starting. The
# scheduled runs report such errors (log, backup_last_run_success, alerts).
not_configured() {
  set_state mode unconfigured
  write_metrics
  fail "$1 - backups are NOT set up, so Attraccess will not start. Configure the backup (docker/backup/README.md) or set BACKUP_DISABLED=true to run without backups on purpose."
}

case "${1:-run}" in
  backup)
    exec "$LIB/backup.sh"
    ;;
  restore)
    shift
    exec "$LIB/restore.sh" "$@"
    ;;
  snapshots)
    shift
    configure_restic || fail "BACKUP_REPOSITORY is not set"
    exec restic snapshots --host "$RESTIC_HOST" --tag attraccess "$@"
    ;;
  restic)
    shift
    configure_restic || fail "BACKUP_REPOSITORY is not set"
    exec restic "$@"
    ;;
  run)
    # A status left by an earlier container (power loss) must not let the attraccess service start.
    clear_status
    if backups_disabled; then
      idle_disabled
    fi
    [ -n "${BACKUP_REPOSITORY:-}" ] || not_configured "BACKUP_REPOSITORY is not set"
    [ -n "${BACKUP_PASSWORD:-}" ] || not_configured "BACKUP_PASSWORD is not set"
    schedule="${BACKUP_SCHEDULE:-0 3 * * *}"
    schedule_valid "$schedule" ||
      not_configured "BACKUP_SCHEDULE must be a 5-field cron expression (minute hour day month weekday) with values in range, got: $schedule"
    [ -n "${BACKUP_DATABASE_URL:-${DATABASE_URL:-}}" ] || not_configured "DATABASE_URL (or BACKUP_DATABASE_URL) is not set"
    max_age_valid || not_configured "BACKUP_MAX_AGE_HOURS must be a whole number of hours above 0, got: ${BACKUP_MAX_AGE_HOURS:-}"
    set_state mode configured
    set_state started "$(date +%s)"
    # Earlier versions kept only the last success, in a metric file in STATE_DIR: carry it over once.
    legacy="$STATE_DIR/backup_last_success_timestamp_seconds.prom"
    if [ -f "$legacy" ]; then
      [ -n "$(get_state last_success)" ] ||
        set_state last_success "$(awk '/^backup_last_success_timestamp_seconds /{printf "%d", $2}' "$legacy")"
      rm -f "$legacy"
    fi
    write_metrics
    mkdir -p "$STATE_DIR" /etc/crontabs
    # cron starts jobs with an empty environment: hand the settings over through a private file.
    umask 077
    export -p >/etc/backup.env
    printf '%s . /etc/backup.env && %s/backup.sh >>/proc/1/fd/1 2>>/proc/1/fd/2\n' "$schedule" "$LIB" >/etc/crontabs/root
    crond -f -l 8 &
    crond_pid=$!
    trap 'clear_status; kill "$crond_pid" 2>/dev/null; exit 0' TERM INT
    write_status enabled
    log "backups enabled: schedule '$schedule', repository ${BACKUP_REPOSITORY%%:*}:..."
    wait "$crond_pid" || true
    clear_status
    fail "crond stopped - backups are no longer scheduled"
    ;;
  *)
    exec "$@"
    ;;
esac
