#!/bin/sh
# restore [--force] [snapshot-id|latest]: restores the volumes and the database dump from the restic repository.
# The database must be empty (a fresh PostgreSQL after the migrations are NOT run yet) unless --force is given.
# Stop the other services first: balena stop ... / docker compose stop (everything except postgres and backup).
set -eu
# shellcheck source=lib.sh
. "$(dirname "$0")/lib.sh"

force=false
snapshot=latest
for arg in "$@"; do
  case "$arg" in
    --force) force=true ;;
    -*) fail "unknown option $arg (usage: restore [--force] [snapshot-id|latest])" ;;
    *) snapshot="$arg" ;;
  esac
done
[ "${BACKUP_FORCE:-}" = true ] && force=true

configure_restic || fail "BACKUP_REPOSITORY is not set"
mkdir -p "$STATE_DIR"
exec 9>"$STATE_DIR/backup.lock"
flock -n 9 || fail "another backup or restore is already running"

wait_for_postgres
url="$(database_url)"

tables=$(psql -X -A -t -d "$url" -c "SELECT count(*) FROM information_schema.tables WHERE table_schema NOT IN ('pg_catalog', 'information_schema')")
if [ "$tables" -gt 0 ] && [ "$force" != true ]; then
  fail "the database is not empty ($tables tables). Restore into an empty database, or add --force to replace its contents"
fi

log "restoring snapshot $snapshot"
scratch="$STATE_DIR/restore"
rm -rf "$scratch"
mkdir -p "$scratch"
restic restore "$snapshot" --host "$RESTIC_HOST" --target "$scratch" --include "$DUMP_FILE"
dump="$scratch$DUMP_FILE"
[ -s "$dump" ] || fail "the snapshot contains no database dump"

if [ -d "$DATA_DIR" ]; then
  log "restoring the volumes into $DATA_DIR"
  restic restore "$snapshot" --host "$RESTIC_HOST" --target / --include "$DATA_DIR"
fi

log "restoring the database"
if [ "$force" = true ]; then
  # pg_restore --clean only drops what the dump contains. Tables, types and functions that a newer Attraccess version
  # added after the snapshot would survive, and their migrations would then fail on the next start ("already exists").
  # Drop every schema first (and recreate an empty public one), so --force really replaces the contents.
  if [ "$tables" -gt 0 ]; then
    log "removing the current contents of the database"
    psql -X -q -v ON_ERROR_STOP=1 -d "$url" <<'SQL'
DO $$
DECLARE schema_name text;
BEGIN
  FOR schema_name IN SELECT nspname FROM pg_namespace WHERE nspname NOT LIKE 'pg\_%' AND nspname <> 'information_schema' LOOP
    EXECUTE format('DROP SCHEMA %I CASCADE', schema_name);
  END LOOP;
  EXECUTE 'CREATE SCHEMA public';
END
$$;
SQL
  fi
  pg_restore --clean --if-exists --no-owner --no-privileges --exit-on-error --dbname="$url" "$dump"
else
  pg_restore --no-owner --no-privileges --exit-on-error --dbname="$url" "$dump"
fi
rm -rf "$scratch"
log "restore SUCCEEDED - start the other services again"
