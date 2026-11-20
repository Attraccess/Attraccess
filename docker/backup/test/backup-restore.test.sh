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
db_bad="attraccess_backup_bad_$suffix"
# The sidecar connects as a role whose password needs percent-encoding in the URL.
role="attraccess_backup_role_$suffix"
role_password='p@ss:w/rd%x'
role_password_encoded='p%40ss%3Aw%2Frd%25x'
admin_psql() { psql -X -q -v ON_ERROR_STOP=1 -d "$TEST_DATABASE_URL" "$@"; }
admin_url_for() { printf '%s' "$TEST_DATABASE_URL" | sed "s|/[^/]*\$|/$1|"; }
url_for() { admin_url_for "$1" | sed "s|://[^@]*@|://$role:$role_password_encoded@|"; }

cleanup() {
  for db in "$db_src" "$db_dst" "$db_bad"; do
    admin_psql -c "DROP DATABASE IF EXISTS \"$db\" WITH (FORCE)" >/dev/null 2>&1 || true
  done
  admin_psql -c "DROP ROLE IF EXISTS \"$role\"" >/dev/null 2>&1 || true
  rm -rf "$work"
}
trap cleanup EXIT

pass() { printf 'ok - %s\n' "$1"; }
die() { printf 'not ok - %s\n' "$1" >&2; exit 1; }

# Every PostgreSQL tool call goes through a shim that records its command line (what `ps` shows).
mkdir -p "$work/bin"
for tool in pg_isready pg_dump pg_restore psql; do
  real="$(command -v "$tool")"
  printf '#!/bin/sh\nprintf "%%s\\n" "$*" >>"%s"\nexec "%s" "$@"\n' "$work/argv.log" "$real" >"$work/bin/$tool"
  chmod 0755 "$work/bin/$tool"
done
PATH="$work/bin:$PATH"

# Through stdin: the shims below record command lines, and only the sidecar's are checked for the password.
printf 'CREATE ROLE "%s" LOGIN SUPERUSER PASSWORD %s;\n' "$role" "'$role_password'" | admin_psql
admin_psql -c "CREATE DATABASE \"$db_src\"" -c "CREATE DATABASE \"$db_dst\"" -c "CREATE DATABASE \"$db_bad\""
psql -X -q -v ON_ERROR_STOP=1 -d "$(admin_url_for "$db_src")" \
  -c 'CREATE TABLE item (id serial PRIMARY KEY, name text)' -c "INSERT INTO item (name) VALUES ('alpha'), ('beta')"

mkdir -p "$work/data/storage" "$work/state"
echo "plugin-bytes" >"$work/data/storage/plugin.txt"

export BACKUP_REPOSITORY="$work/repo" BACKUP_PASSWORD="test-password"
export BACKUP_DATA_DIR="$work/data" BACKUP_STATE_DIR="$work/state"
export BACKUP_KEEP_DAILY=2 BACKUP_PG_WAIT_SECONDS=10
export DATABASE_URL
DATABASE_URL="$(url_for "$db_src")"

# 1. First run initialises the repository and uploads dump + volumes; the success metric is written; the plaintext
#    dump is not left behind and the state directory is private.
sh "$lib/backup.sh" >"$work/backup.log" 2>&1 || { cat "$work/backup.log"; die "backup failed"; }
grep -q 'backup SUCCEEDED' "$work/backup.log" || die "no success line"
grep -q '^backup_last_success_timestamp_seconds [0-9]' "$work/state/backup_last_success_timestamp_seconds.prom" || die "no metric"
[ ! -e "$work/state/dump/attraccess.dump" ] || die "the plaintext dump was left in the state directory"
[ "$(stat -c %a "$work/state/cache")" = 700 ] || die "the restic cache is readable by others"
[ "$(stat -c %a "$work/state/backup_last_success_timestamp_seconds.prom")" = 644 ] || die "the metric must stay readable for a textfile collector"
pass "backup initialises the repository, uploads, writes the metric and removes the dump"

# 2. A second run adds a snapshot and applies the retention policy; `snapshots` lists them.
sh "$lib/backup.sh" >/dev/null 2>&1 || die "second backup failed"
"$lib/entrypoint.sh" snapshots >"$work/snapshots.log" 2>&1 || { cat "$work/snapshots.log"; die "snapshots failed"; }
grep -q '/dump' "$work/snapshots.log" || die "snapshots does not list the backups: $(cat "$work/snapshots.log")"
snapshot_id="$("$lib/entrypoint.sh" snapshots --json | grep -o '"short_id":"[^"]*"' | tail -n 1 | cut -d'"' -f4)"
[ -n "$snapshot_id" ] || die "no snapshot id"
pass "second backup succeeds and snapshots lists it"

# 3. A failing database restore leaves the volumes untouched (the database is restored first).
rm -rf "$work/data/storage"
psql -X -q -v ON_ERROR_STOP=1 -d "$(admin_url_for "$db_bad")" -c 'CREATE SEQUENCE item_id_seq'
if DATABASE_URL="$(url_for "$db_bad")" sh "$lib/restore.sh" >"$work/bad.log" 2>&1; then die "restore over a conflicting object must fail"; fi
grep -q 'volumes were NOT restored' "$work/bad.log" || { cat "$work/bad.log"; die "missing pg_restore failure message"; }
[ ! -e "$work/data/storage/plugin.txt" ] || die "volumes were restored although the database restore failed"
[ ! -e "$work/state/restore" ] || die "the restore scratch directory (plaintext dump) was left behind"
pass "a failing database restore does not touch the volumes"

# 4. Restore into an empty database and compare the data; the volume files come back.
DATABASE_URL="$(url_for "$db_dst")"
sh "$lib/restore.sh" >"$work/restore.log" 2>&1 || { cat "$work/restore.log"; die "restore failed"; }
[ "$(psql -X -A -t -d "$(admin_url_for "$db_dst")" -c 'SELECT string_agg(name, $$,$$ ORDER BY id) FROM item')" = "alpha,beta" ] || die "database content differs"
[ "$(cat "$work/data/storage/plugin.txt")" = "plugin-bytes" ] || die "volume file was not restored"
[ ! -e "$work/state/restore" ] || die "the restore scratch directory (plaintext dump) was left behind"
pass "restore recreates the database and the volumes"

# 5. A non-empty database is refused unless forced; an explicit snapshot id is restored.
if sh "$lib/restore.sh" >"$work/refuse.log" 2>&1; then die "restore into a non-empty database must fail"; fi
grep -q 'not empty' "$work/refuse.log" || die "missing non-empty message"
psql -X -q -d "$(admin_url_for "$db_dst")" -c "INSERT INTO item (name) VALUES ('gamma')" -c 'CREATE TABLE added_after_snapshot (id int)'
sh "$lib/restore.sh" --force "$snapshot_id" >"$work/force.log" 2>&1 || { cat "$work/force.log"; die "forced restore failed"; }
grep -q "restoring snapshot $snapshot_id" "$work/force.log" || die "the named snapshot was not restored"
[ "$(psql -X -A -t -d "$(admin_url_for "$db_dst")" -c 'SELECT count(*) FROM item')" = "2" ] || die "forced restore did not replace the data"
[ "$(psql -X -A -t -d "$(admin_url_for "$db_dst")" -c "SELECT to_regclass('added_after_snapshot') IS NULL")" = "t" ] || die "forced restore left a table that is not in the snapshot"
pass "restore refuses a non-empty database and replaces it with --force from a named snapshot"

# 6. A password given as a `password=` query parameter also goes through the environment; other parameters stay. A
#    second installation with its own BACKUP_HOST in the same repository neither sees nor prunes the first one's
#    snapshots.
count_snapshots() { "$lib/entrypoint.sh" snapshots --json | grep -o '"short_id"' | wc -l | tr -d ' '; }
first_host_snapshots="$(count_snapshots)"
query_url="$(admin_url_for "$db_src" | sed "s|://[^@]*@|://$role@|")?application_name=attraccess-backup-test&password=$role_password_encoded"
DATABASE_URL="$query_url" BACKUP_HOST=second-installation sh "$lib/backup.sh" >"$work/query.log" 2>&1 ||
  { cat "$work/query.log"; die "backup with a password query parameter failed"; }
grep -q 'application_name=attraccess-backup-test' "$work/argv.log" || die "the other query parameters were dropped"
[ "$(export BACKUP_HOST=second-installation; count_snapshots)" = 1 ] || die "the second installation must see only its own snapshot"
[ "$(count_snapshots)" = "$first_host_snapshots" ] || die "the second installation changed the first one's snapshots"
pass "a password query parameter is supported and BACKUP_HOST separates installations in one repository"

# 7. The database password never appears on a command line (ps), neither plain nor percent-encoded.
[ -s "$work/argv.log" ] || die "the tool shims recorded nothing"
if grep -qF -e "$role_password" -e "$role_password_encoded" "$work/argv.log"; then cat "$work/argv.log" >&2; die "the database password was on a command line"; fi
pass "the database password is passed through the environment, not the command line"

# 8. Without BACKUP_REPOSITORY the scheduler logs one warning and idles; backup and snapshots fail loudly.
out="$(env -u BACKUP_REPOSITORY timeout 3 "$lib/entrypoint.sh" run 2>&1 || true)"
[ "$(printf '%s\n' "$out" | grep -c 'WARNING')" = "1" ] || die "expected exactly one warning, got: $out"
if env -u BACKUP_REPOSITORY sh "$lib/backup.sh" >/dev/null 2>&1; then die "backup without a repository must fail"; fi
if env -u BACKUP_REPOSITORY "$lib/entrypoint.sh" snapshots >/dev/null 2>&1; then die "snapshots without a repository must fail"; fi
pass "no repository: one warning, idle, backup refuses"

# 9. A wrong password fails loudly and reports failure.
if BACKUP_PASSWORD=wrong sh "$lib/backup.sh" >"$work/wrong.log" 2>&1; then die "wrong password must fail"; fi
grep -q 'BACKUP FAILED' "$work/wrong.log" || die "missing failure line"
grep -q 'wrong BACKUP_PASSWORD' "$work/wrong.log" || die "a wrong password must be named as the cause"
if grep -q 'initialising the restic repository' "$work/wrong.log"; then die "a wrong password must not attempt restic init"; fi
[ ! -e "$work/state/dump/attraccess.dump" ] || die "a failed backup left the plaintext dump behind"
pass "a failing backup logs BACKUP FAILED, names the wrong password and removes the dump"

# 10. An invalid BACKUP_SCHEDULE is reported and disables the scheduler (crond would skip such a line silently).
for bad in 'bad' '* * * *' '61 25 * * *' '0 24 * * *' '0 3 32 * *' '0 3 * 13 *' '0 3 * * 8'; do
  out="$(BACKUP_SCHEDULE="$bad" timeout 3 "$lib/entrypoint.sh" run 2>&1 || true)"
  printf '%s\n' "$out" | grep -q 'BACKUP_SCHEDULE must be' || die "schedule '$bad' must be rejected, got: $out"
done
for good in '0 3 * * *' '*/5 * * * *' '0,30 6-18 * * 1-5' '15 2 1 jan mon'; do
  out="$(BACKUP_SCHEDULE="$good" timeout 3 "$lib/entrypoint.sh" run 2>&1 || true)"
  if printf '%s\n' "$out" | grep -q 'BACKUP_SCHEDULE must be'; then die "schedule '$good' must be accepted, got: $out"; fi
done
pass "an invalid BACKUP_SCHEDULE is rejected, valid ones are accepted"
