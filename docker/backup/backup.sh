#!/bin/sh
# One backup run: pg_dump -> restic init (first run) -> restic backup (dump + volumes) -> restic forget --prune.
set -eu
# shellcheck source=lib.sh
. "$(dirname "$0")/lib.sh"

configure_restic || fail "BACKUP_REPOSITORY is not set"

mkdir -p "$STATE_DIR"
exec 9>"$STATE_DIR/backup.lock"
flock -n 9 || fail "another backup or restore is already running"

started=$(date +%s)
log "backup started"
trap 'log "BACKUP FAILED (see the messages above)" >&2' EXIT

wait_for_postgres
log "dumping the database"
rm -f "$DUMP_FILE.partial"
pg_dump --format=custom --no-owner --dbname="$(database_url)" --file="$DUMP_FILE.partial"
mv "$DUMP_FILE.partial" "$DUMP_FILE"

if ! restic cat config >/dev/null 2>&1; then
  log "initialising the restic repository"
  restic init
fi

paths="$DUMP_DIR"
[ -d "$DATA_DIR" ] && paths="$paths $DATA_DIR"
log "uploading: $paths"
# shellcheck disable=SC2086 # the paths are fixed directories without spaces
restic backup --host "$RESTIC_HOST" --tag attraccess $paths

log "applying the retention policy"
restic forget --prune --host "$RESTIC_HOST" --tag attraccess \
  --keep-daily "${BACKUP_KEEP_DAILY:-7}" \
  --keep-weekly "${BACKUP_KEEP_WEEKLY:-4}" \
  --keep-monthly "${BACKUP_KEEP_MONTHLY:-6}"

finished=$(date +%s)
{
  echo '# HELP backup_last_success_timestamp_seconds Unix time of the last successful Attraccess backup.'
  echo '# TYPE backup_last_success_timestamp_seconds gauge'
  echo "backup_last_success_timestamp_seconds $finished"
} >"$METRIC_FILE.tmp"
mv "$METRIC_FILE.tmp" "$METRIC_FILE"

trap - EXIT
log "backup SUCCEEDED in $((finished - started))s"
