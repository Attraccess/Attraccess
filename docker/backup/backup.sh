#!/bin/sh
# One backup run: pg_dump -> restic init (first run) -> restic backup (dump + volumes) -> restic forget --prune.
# The plaintext dump only exists during the run: it is deleted when the run ends, successful or not.
set -eu
# shellcheck source=lib.sh
. "$(dirname "$0")/lib.sh"

# The lock comes first: a run skipped because another backup or restore holds it is not a failed run, and it must not
# touch the dump of that run. From here on every way out but success is recorded as a failed run.
mkdir -p "$STATE_DIR"
exec 9>"$STATE_DIR/backup.lock"
flock -n 9 || fail "another backup or restore is already running"

started=$(date +%s)
log "backup started"
remove_dump() { rm -f "$DUMP_FILE" "$DUMP_FILE.partial"; }
trap 'remove_dump; record_run 0; log "BACKUP FAILED (see the messages above)" >&2' EXIT

configure_restic || fail "BACKUP_REPOSITORY is not set"
connect_database
wait_for_postgres
log "dumping the database"
remove_dump
pg_dump --format=custom --no-owner --dbname="$PG_URL" --file="$DUMP_FILE.partial"
mv "$DUMP_FILE.partial" "$DUMP_FILE"

log "checking the restic repository"
open_repository

paths="$DUMP_DIR"
[ -d "$DATA_DIR" ] && paths="$paths $DATA_DIR"
log "uploading: $paths"
# Exit code 3: the snapshot was saved, but some files could not be read - typically files of the running services that
# vanished while they were read (SQLite journals, temporary files). The database dump is always readable, so such a
# run still counts as a success; the skipped files are named above.
backed_up=0
# shellcheck disable=SC2086 # the paths are fixed directories without spaces
restic backup --host "$RESTIC_HOST" --tag attraccess $paths || backed_up=$?
case "$backed_up" in
  0) ;;
  3) log "WARNING: the snapshot was saved, but some files could not be read (see above); they were skipped" ;;
  *) fail "restic backup failed with exit code $backed_up" ;;
esac
remove_dump

log "applying the retention policy"
restic forget --prune --host "$RESTIC_HOST" --tag attraccess \
  --keep-daily "${BACKUP_KEEP_DAILY:-7}" \
  --keep-weekly "${BACKUP_KEEP_WEEKLY:-4}" \
  --keep-monthly "${BACKUP_KEEP_MONTHLY:-6}"

finished=$(date +%s)
trap - EXIT
record_run 1
log "backup SUCCEEDED in $((finished - started))s"
