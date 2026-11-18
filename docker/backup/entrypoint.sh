#!/bin/sh
# Commands: run (default: scheduler), backup (one run now), restore [--force] [snapshot], any other command is executed.
set -eu
LIB="$(dirname "$(readlink -f "$0")")"
# shellcheck source=lib.sh
. "$LIB/lib.sh"

idle() {
  trap 'kill "$sleeper" 2>/dev/null; exit 0' TERM INT
  while :; do
    sleep 3600 >/dev/null 2>&1 &
    sleeper=$!
    wait "$sleeper"
  done
}

case "${1:-run}" in
  backup)
    exec "$LIB/backup.sh"
    ;;
  restore)
    shift
    exec "$LIB/restore.sh" "$@"
    ;;
  run)
    if [ -z "${BACKUP_REPOSITORY:-}" ]; then
      log "WARNING: BACKUP_REPOSITORY is not set - backups are DISABLED. Set BACKUP_REPOSITORY and BACKUP_PASSWORD (docker/backup/README.md)."
      idle
    fi
    if [ -z "${BACKUP_PASSWORD:-}" ]; then
      log "ERROR: BACKUP_PASSWORD is not set - backups are DISABLED until it is."
      idle
    fi
    schedule="${BACKUP_SCHEDULE:-0 3 * * *}"
    if [ "$(printf '%s' "$schedule" | wc -w)" -ne 5 ]; then
      log "ERROR: BACKUP_SCHEDULE must be a 5-field cron expression (minute hour day month weekday), got: $schedule - backups are DISABLED."
      idle
    fi
    mkdir -p "$STATE_DIR" /etc/crontabs
    # cron starts jobs with an empty environment: hand the settings over through a private file.
    umask 077
    export -p >/etc/backup.env
    printf '%s . /etc/backup.env && %s/backup.sh >>/proc/1/fd/1 2>>/proc/1/fd/2\n' "$schedule" "$LIB" >/etc/crontabs/root
    log "backups enabled: schedule '$schedule', repository ${BACKUP_REPOSITORY%%:*}:..."
    exec crond -f -l 8
    ;;
  *)
    exec "$@"
    ;;
esac
