#!/bin/sh
# Backup + restore round trip against a local restic repository directory and a real PostgreSQL.
# Needs restic, pg_dump/pg_restore/psql and TEST_DATABASE_URL (admin connection, e.g.
# postgres://attraccess:attraccess@127.0.0.1:55432/postgres). Run it in the sidecar image (same tools as production):
#   docker build -t attraccess-backup docker/backup
#   docker run --rm --network host -e TEST_DATABASE_URL="$TEST_DATABASE_URL" \
#     -v "$PWD/docker/backup/test:/test:ro" --entrypoint sh attraccess-backup /test/backup-restore.test.sh
set -eu

here="$(cd "$(dirname "$0")" && pwd)"
lib="${BACKUP_LIB:-$here/..}"
[ -f "$lib/backup.sh" ] || lib=/usr/local/lib/attraccess-backup
: "${TEST_DATABASE_URL:?set TEST_DATABASE_URL to an admin connection URL}"

work="$(mktemp -d)"
suffix="$(date +%s)_$$"
db_src="attraccess_backup_src_$suffix"
db_dst="attraccess_backup_dst_$suffix"
admin_psql() { psql -X -q -v ON_ERROR_STOP=1 -d "$TEST_DATABASE_URL" "$@"; }
url_for() { printf '%s' "$TEST_DATABASE_URL" | sed "s|/[^/]*\$|/$1|"; }

cleanup() {
  admin_psql -c "DROP DATABASE IF EXISTS \"$db_src\" WITH (FORCE)" -c "DROP DATABASE IF EXISTS \"$db_dst\" WITH (FORCE)" >/dev/null 2>&1 || true
  rm -rf "$work"
}
trap cleanup EXIT

pass() { printf 'ok - %s\n' "$1"; }
die() { printf 'not ok - %s\n' "$1" >&2; exit 1; }

admin_psql -c "CREATE DATABASE \"$db_src\"" -c "CREATE DATABASE \"$db_dst\""
psql -X -q -v ON_ERROR_STOP=1 -d "$(url_for "$db_src")" \
  -c 'CREATE TABLE item (id serial PRIMARY KEY, name text)' -c "INSERT INTO item (name) VALUES ('alpha'), ('beta')"

mkdir -p "$work/data/storage" "$work/state"
echo "plugin-bytes" >"$work/data/storage/plugin.txt"

export BACKUP_REPOSITORY="$work/repo" BACKUP_PASSWORD="test-password"
export BACKUP_DATA_DIR="$work/data" BACKUP_STATE_DIR="$work/state"
export BACKUP_KEEP_DAILY=2 BACKUP_PG_WAIT_SECONDS=10
export DATABASE_URL
DATABASE_URL="$(url_for "$db_src")"

# 1. First run initialises the repository and uploads dump + volumes; the success metric is written.
sh "$lib/backup.sh" >"$work/backup.log" 2>&1 || { cat "$work/backup.log"; die "backup failed"; }
grep -q 'backup SUCCEEDED' "$work/backup.log" || die "no success line"
grep -q '^backup_last_success_timestamp_seconds [0-9]' "$work/state/backup_last_success_timestamp_seconds.prom" || die "no metric"
pass "backup initialises the repository, uploads and writes the metric"

# 2. A second run adds a snapshot and applies the retention policy.
sh "$lib/backup.sh" >/dev/null 2>&1 || die "second backup failed"
[ "$(RESTIC_REPOSITORY="$BACKUP_REPOSITORY" RESTIC_PASSWORD="$BACKUP_PASSWORD" restic snapshots --json | grep -o '"short_id"' | wc -l)" -ge 1 ] || die "no snapshots"
pass "second backup succeeds"

# 3. Restore into an empty database and compare the data; the volume files come back.
rm -rf "$work/data/storage"
export DATABASE_URL
DATABASE_URL="$(url_for "$db_dst")"
sh "$lib/restore.sh" >"$work/restore.log" 2>&1 || { cat "$work/restore.log"; die "restore failed"; }
[ "$(psql -X -A -t -d "$DATABASE_URL" -c 'SELECT string_agg(name, $$,$$ ORDER BY id) FROM item')" = "alpha,beta" ] || die "database content differs"
[ "$(cat "$work/data/storage/plugin.txt")" = "plugin-bytes" ] || die "volume file was not restored"
pass "restore recreates the database and the volumes"

# 4. A non-empty database is refused unless forced.
if sh "$lib/restore.sh" >"$work/refuse.log" 2>&1; then die "restore into a non-empty database must fail"; fi
grep -q 'not empty' "$work/refuse.log" || die "missing non-empty message"
psql -X -q -d "$DATABASE_URL" -c "INSERT INTO item (name) VALUES ('gamma')"
sh "$lib/restore.sh" --force >/dev/null 2>&1 || die "forced restore failed"
[ "$(psql -X -A -t -d "$DATABASE_URL" -c 'SELECT count(*) FROM item')" = "2" ] || die "forced restore did not replace the data"
pass "restore refuses a non-empty database and replaces it with --force"

# 5. Without BACKUP_REPOSITORY the scheduler logs one warning and idles; backup fails loudly.
out="$(env -u BACKUP_REPOSITORY timeout 3 "$lib/entrypoint.sh" run 2>&1 || true)"
[ "$(printf '%s\n' "$out" | grep -c 'WARNING')" = "1" ] || die "expected exactly one warning, got: $out"
if env -u BACKUP_REPOSITORY sh "$lib/backup.sh" >/dev/null 2>&1; then die "backup without a repository must fail"; fi
pass "no repository: one warning, idle, backup refuses"

# 6. A wrong password fails loudly and reports failure.
if BACKUP_PASSWORD=wrong sh "$lib/backup.sh" >"$work/wrong.log" 2>&1; then die "wrong password must fail"; fi
grep -q 'BACKUP FAILED' "$work/wrong.log" || die "missing failure line"
pass "a failing backup logs BACKUP FAILED"
