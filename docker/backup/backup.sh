#!/bin/sh
# One backup run: pg_dump -> restic init (first run) -> restic backup (dump + volumes) -> restic forget --prune.
# The plaintext dump only exists during the run: it is deleted when the run ends, successful or not.
set -eu
# shellcheck source=lib.sh
. "$(dirname "$0")/lib.sh"

configure_restic || fail "BACKUP_REPOSITORY is not set"
connect_database

mkdir -p "$STATE_DIR"
exec 9>"$STATE_DIR/backup.lock"
flock -n 9 || fail "another backup or restore is already running"

started=$(date +%s)
log "backup started"
remove_dump() { rm -f "$DUMP_FILE" "$DUMP_FILE.partial"; }
trap 'remove_dump; log "BACKUP FAILED (see the messages above)" >&2' EXIT

wait_for_postgres
log "dumping the database"
remove_dump
pg_dump --format=custom --no-owner --dbname="$PG_URL" --file="$DUMP_FILE.partial"
mv "$DUMP_FILE.partial" "$DUMP_FILE"

# A repository that cannot be opened is initialised (first run, also creates a missing bucket) - except when the
# password is wrong (restic exit code 12): `restic init` would only report "config file already exists" there.
probe=0
log "checking the restic repository"
restic cat config >/dev/null 2>"$STATE_DIR/restic-probe.err" || probe=$?
if [ "$probe" -eq 12 ]; then
  cat "$STATE_DIR/restic-probe.err" >&2
  fail "cannot open the restic repository: wrong BACKUP_PASSWORD for the existing repository"
elif [ "$probe" -ne 0 ]; then
  log "initialising the restic repository (opening it failed with restic exit code $probe)"
  restic init
fi

paths="$DUMP_DIR"
[ -d "$DATA_DIR" ] && paths="$paths $DATA_DIR"
log "uploading: $paths"
# shellcheck disable=SC2086 # the paths are fixed directories without spaces
restic backup --host "$RESTIC_HOST" --tag attraccess $paths
remove_dump

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
# No secret in it, and a textfile collector (node-exporter runs as nobody) must be able to read it.
chmod 0644 "$METRIC_FILE.tmp"
mv "$METRIC_FILE.tmp" "$METRIC_FILE"

trap - EXIT
log "backup SUCCEEDED in $((finished - started))s"
