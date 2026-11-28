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
export BACKUP_DATA_DIR="$work/data" BACKUP_STATE_DIR="$work/state" BACKUP_STATUS_DIR="$work/status"
export BACKUP_KEEP_DAILY=2 BACKUP_PG_WAIT_SECONDS=10
export DATABASE_URL
DATABASE_URL="$(url_for "$db_src")"

# 1. First run initialises the repository and uploads dump + volumes; the success metric is written; the plaintext
#    dump is not left behind and the state directory is private.
sh "$lib/backup.sh" >"$work/backup.log" 2>&1 || { cat "$work/backup.log"; die "backup failed"; }
grep -q 'backup SUCCEEDED' "$work/backup.log" || die "no success line"
grep -q '^backup_last_success_timestamp_seconds [0-9]' "$work/status/backup.prom" || die "no metric"
grep -q '^backup_last_run_success 1$' "$work/status/backup.prom" || die "the run must be recorded as a success"
[ ! -e "$work/state/dump/attraccess.dump" ] || die "the plaintext dump was left in the state directory"
[ "$(stat -c %a "$work/state/cache")" = 700 ] || die "the restic cache is readable by others"
[ "$(stat -c %a "$work/status/backup.prom")" = 644 ] || die "the metric must stay readable for a textfile collector"
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

# 8. Without a working configuration the scheduler exits with an error and leaves no status (the attraccess service
#    waits for it), also when a stale status from an earlier container is there. backup and snapshots fail loudly.
expect_refused() {
  name="$1"
  shift
  mkdir -p "$work/status" && echo enabled >"$work/status/status"
  rc=0
  out="$("$@" timeout 20 "$lib/entrypoint.sh" run 2>&1)" || rc=$?
  [ "$rc" -eq 1 ] || die "$name: run must exit with an error, got exit code $rc: $out"
  printf '%s\n' "$out" | grep -q 'backups are NOT set up' || die "$name: missing the not-set-up message, got: $out"
  [ ! -e "$work/status/status" ] || die "$name: a refused start must remove the status"
  grep -q '^backup_configured 0$' "$work/status/backup.prom" || die "$name: a refused start must report backup_configured 0"
}
expect_refused "no repository" env -u BACKUP_REPOSITORY
expect_refused "no password" env -u BACKUP_PASSWORD
expect_refused "no database" env -u DATABASE_URL
expect_refused "bad max age" env BACKUP_MAX_AGE_HOURS=soon
for bad in 0 00 -1 1.5; do
  expect_refused "max age $bad" env BACKUP_MAX_AGE_HOURS="$bad"
  printf '%s\n' "$out" | grep -q 'BACKUP_MAX_AGE_HOURS must be' || die "max age '$bad' must be named, got: $out"
done
expect_refused "mysql database" env DATABASE_URL="mysql://user:url-secret@db/attraccess"
grep -q 'DATABASE_URL must be a postgres' <<OUT || die "the refused database URL must be named, got: $out"
$out
OUT
# BACKUP_DATABASE_URL wins over a valid DATABASE_URL, so it is the one that is checked.
expect_refused "bad database override" env BACKUP_DATABASE_URL="postgres:/user:url-secret@db/attraccess"
grep -q 'BACKUP_DATABASE_URL must be a postgres' <<OUT || die "the refused override must be named, got: $out"
$out
OUT
if printf '%s\n' "$out" | grep -q 'url-secret'; then die "a refused database URL must not be logged"; fi
for bad in soon 0 00 -5 1.5; do
  expect_refused "connect timeout $bad" env BACKUP_CONNECT_TIMEOUT_SECONDS="$bad"
  printf '%s\n' "$out" | grep -q 'BACKUP_CONNECT_TIMEOUT_SECONDS must be' || die "connect timeout '$bad' must be named, got: $out"
done
if env -u BACKUP_REPOSITORY sh "$lib/backup.sh" >/dev/null 2>&1; then die "backup without a repository must fail"; fi
if env -u BACKUP_REPOSITORY "$lib/entrypoint.sh" snapshots >/dev/null 2>&1; then die "snapshots without a repository must fail"; fi
pass "not configured: run exits with an error and removes the status, backup refuses"

# 8b. Only the settings are checked at start, not the repository or the database: a target that cannot be opened
#     (wrong password, internet down) still starts the scheduler, so Attraccess starts. The runs report the error.
BACKUP_REPOSITORY="rest:http://127.0.0.1:1/" BACKUP_DATABASE_URL="postgresql://user:secret@127.0.0.1:1/none" \
  BACKUP_CONNECT_TIMEOUT_SECONDS=5 "$lib/entrypoint.sh" run >"$work/unreachable.log" 2>&1 &
unreachable_pid=$!
for _ in $(seq 1 20); do [ -s "$work/status/status" ] && break; sleep 0.5; done
[ "$(cat "$work/status/status" 2>/dev/null)" = "enabled" ] || { cat "$work/unreachable.log"; die "the start must not depend on the repository"; }
if grep -q 'checking the restic repository' "$work/unreachable.log"; then die "the start must not open the repository"; fi
kill -TERM "$unreachable_pid"; wait "$unreachable_pid" || true
pass "the start checks only the settings, not the repository or the database"

# 8c. BACKUP_DISABLED=true: one warning, status `disabled`, keeps running; removed again on SIGTERM. A failed last run
#     from before is not reported: no run is scheduled that could clear BackupFailed again.
echo 0 >"$work/state/last_run_success"
BACKUP_DISABLED=true "$lib/entrypoint.sh" run >"$work/disabled.log" 2>&1 &
disabled_pid=$!
for _ in 1 2 3 4 5 6 7 8 9 10; do [ -s "$work/status/status" ] && break; sleep 0.5; done
[ "$(cat "$work/status/status" 2>/dev/null)" = "disabled" ] || { cat "$work/disabled.log"; die "BACKUP_DISABLED=true must report disabled"; }
kill -0 "$disabled_pid" || die "BACKUP_DISABLED=true must keep running"
grep -q '^backup_disabled 1$' "$work/status/backup.prom" || die "BACKUP_DISABLED=true must report backup_disabled 1"
if grep -q '^backup_configured' "$work/status/backup.prom"; then die "disabled backups must not report backup_configured"; fi
if grep -q '^backup_last_run_success' "$work/status/backup.prom"; then die "disabled backups must not report an earlier failed run"; fi
[ "$(grep -c 'DISABLED on purpose' "$work/disabled.log")" = "1" ] || die "expected exactly one disabled warning"
kill -TERM "$disabled_pid"; wait "$disabled_pid" || true
[ ! -e "$work/status/status" ] || die "stopping must remove the status"
pass "BACKUP_DISABLED=true: one warning, status disabled, removed on stop"

# 8d. A working configuration reports `enabled` (crond runs) and removes it on SIGTERM. The last success of an earlier
#     version (a metric file in the state directory) is carried over.
rm -f "$work/state/last_success"
printf 'backup_last_success_timestamp_seconds 1700000000\n' >"$work/state/backup_last_success_timestamp_seconds.prom"
"$lib/entrypoint.sh" run >"$work/enabled.log" 2>&1 &
enabled_pid=$!
for _ in $(seq 1 40); do [ -s "$work/status/status" ] && break; sleep 0.5; done
[ "$(cat "$work/status/status" 2>/dev/null)" = "enabled" ] || { cat "$work/enabled.log"; die "a working configuration must report enabled"; }
grep -q 'backups enabled' "$work/enabled.log" || die "missing the enabled line"
grep -q '^backup_configured 1$' "$work/status/backup.prom" || die "a working configuration must report backup_configured 1"
grep -q '^backup_max_age_seconds 108000$' "$work/status/backup.prom" || die "the default max age must be 30 hours"
grep -q '^backup_scheduler_start_timestamp_seconds [0-9]' "$work/status/backup.prom" || die "missing the scheduler start"
grep -q '^backup_last_success_timestamp_seconds 1700000000$' "$work/status/backup.prom" || die "the earlier last success must be carried over"
[ ! -e "$work/state/backup_last_success_timestamp_seconds.prom" ] || die "the earlier metric file must be removed"
kill -TERM "$enabled_pid"; wait "$enabled_pid" || true
[ ! -e "$work/status/status" ] || die "stopping must remove the status"
pass "working configuration: status enabled while running, removed on stop"

# 8e. Leading zeros in BACKUP_MAX_AGE_HOURS are decimal. Shell arithmetic would read them as octal: `010` as 8 hours,
#     and `08` would end the start before it wrote its metrics, leaving the earlier backup_configured 1 in place.
for case in 08:28800 010:36000 0009:32400; do
  hours="${case%:*}"
  rm -f "$work/status/backup.prom"
  BACKUP_MAX_AGE_HOURS="$hours" "$lib/entrypoint.sh" run >"$work/zeros.log" 2>&1 &
  zeros_pid=$!
  for _ in $(seq 1 40); do [ -s "$work/status/status" ] && break; sleep 0.5; done
  [ "$(cat "$work/status/status" 2>/dev/null)" = "enabled" ] || { cat "$work/zeros.log"; die "max age '$hours' must be accepted"; }
  grep -q "^backup_max_age_seconds ${case#*:}\$" "$work/status/backup.prom" ||
    die "max age '$hours' must be read as decimal: $(grep '^backup_max_age_seconds' "$work/status/backup.prom")"
  kill -TERM "$zeros_pid"; wait "$zeros_pid" || true
done
pass "leading zeros in BACKUP_MAX_AGE_HOURS are read as decimal"

# 9. A wrong password fails loudly and reports failure.
if BACKUP_PASSWORD=wrong sh "$lib/backup.sh" >"$work/wrong.log" 2>&1; then die "wrong password must fail"; fi
grep -q 'BACKUP FAILED' "$work/wrong.log" || die "missing failure line"
grep -q 'wrong BACKUP_PASSWORD' "$work/wrong.log" || die "a wrong password must be named as the cause"
if grep -q 'initialising the restic repository' "$work/wrong.log"; then die "a wrong password must not attempt restic init"; fi
[ ! -e "$work/state/dump/attraccess.dump" ] || die "a failed backup left the plaintext dump behind"
grep -q '^backup_last_run_success 0$' "$work/status/backup.prom" || die "a failed run must report backup_last_run_success 0"
grep -q '^backup_last_success_timestamp_seconds [0-9]' "$work/status/backup.prom" || die "a failed run must keep the last success"
pass "a failing backup logs BACKUP FAILED, names the wrong password and removes the dump"

# 9b. An unreachable target (internet down) fails after BACKUP_CONNECT_TIMEOUT_SECONDS, not after restic's ~15
#     minutes of retries, and counts as a failed run.
started_at=$(date +%s)
if BACKUP_REPOSITORY="rest:http://127.0.0.1:1/" BACKUP_CONNECT_TIMEOUT_SECONDS=3 timeout 60 sh "$lib/backup.sh" >"$work/unreachable-run.log" 2>&1; then
  die "a backup to an unreachable target must fail"
fi
[ $(($(date +%s) - started_at)) -lt 30 ] || die "an unreachable target must fail fast"
grep -q 'cannot reach the restic repository within 3s' "$work/unreachable-run.log" || { cat "$work/unreachable-run.log"; die "missing the unreachable message"; }
grep -q '^backup_last_run_success 0$' "$work/status/backup.prom" || die "an unreachable target must be recorded as a failed run"
pass "an unreachable target fails fast and is recorded as a failed run"

# 9c. restic exit code 3 (snapshot saved, some files vanished while being read, as journals of running services do)
#     counts as a success with a warning, not as a failed run.
mkdir -p "$work/bin3"
real_restic="$(command -v restic)"
# shellcheck disable=SC2016 # the $ belong to the generated script
printf '#!/bin/sh\n"%s" "$@" || exit $?\n[ "$1" = backup ] && exit 3\nexit 0\n' "$real_restic" >"$work/bin3/restic"
chmod 0755 "$work/bin3/restic"
PATH="$work/bin3:$PATH" sh "$lib/backup.sh" >"$work/exit3.log" 2>&1 || { cat "$work/exit3.log"; die "exit code 3 must not fail the backup"; }
grep -q 'some files could not be read' "$work/exit3.log" || die "exit code 3 must be logged as a warning"
grep -q '^backup_last_run_success 1$' "$work/status/backup.prom" || die "exit code 3 must count as a success"
pass "restic exit code 3 (unreadable files) counts as a success with a warning"

# 9d. A run skipped because another backup or restore holds the lock is not a failed run, even with settings that would
#     fail it, and leaves the dump of the running one alone.
cp "$work/status/backup.prom" "$work/before-busy.prom"
mkdir -p "$work/state/dump" && echo running >"$work/state/dump/attraccess.dump"
exec 8>"$work/state/backup.lock"
flock -n 8 || die "the test could not take the run lock"
for url in "$DATABASE_URL" "mysql://db/attraccess"; do
  if BACKUP_DATABASE_URL="$url" sh "$lib/backup.sh" >"$work/busy.log" 2>&1; then die "a run must not start while the lock is busy"; fi
  grep -q 'another backup or restore is already running' "$work/busy.log" || { cat "$work/busy.log"; die "missing the busy message"; }
  cmp -s "$work/before-busy.prom" "$work/status/backup.prom" || die "a skipped run must not change the metrics"
  [ "$(cat "$work/state/last_run_success")" = 1 ] || die "a skipped run must not count as a failed run"
done
[ -s "$work/state/dump/attraccess.dump" ] || die "a skipped run removed the dump of the running one"
exec 8>&-
rm -f "$work/state/dump/attraccess.dump"
pass "a run skipped because the lock is busy records nothing"

# 9e. A run that fails before the dump (restic settings, database URL) is recorded as a failed run too, so BackupFailed
#     fires right away.
expect_failed_run() {
  name="$1"
  message="$2"
  shift 2
  sh "$lib/backup.sh" >/dev/null 2>&1 || die "$name: the backup before it failed"
  grep -q '^backup_last_run_success 1$' "$work/status/backup.prom" || die "$name: expected a successful run before it"
  if "$@" sh "$lib/backup.sh" >"$work/failed-run.log" 2>&1; then die "$name: the backup must fail"; fi
  grep -q "$message" "$work/failed-run.log" || { cat "$work/failed-run.log"; die "$name: missing '$message'"; }
  grep -q 'BACKUP FAILED' "$work/failed-run.log" || die "$name: missing the failure line"
  grep -q '^backup_last_run_success 0$' "$work/status/backup.prom" || die "$name: the run must be recorded as failed"
}
expect_failed_run "mysql database" 'BACKUP_DATABASE_URL must be a postgres' env BACKUP_DATABASE_URL="mysql://db/attraccess"
expect_failed_run "no database" 'DATABASE_URL (or BACKUP_DATABASE_URL) is not set' env -u DATABASE_URL
expect_failed_run "no password" 'BACKUP_PASSWORD is required' env -u BACKUP_PASSWORD
expect_failed_run "no repository" 'BACKUP_REPOSITORY is not set' env -u BACKUP_REPOSITORY
pass "a run that fails on its settings is recorded as a failed run"

# 9f. An interrupted run (kill, Ctrl-C, a closed terminal) is a failed run too and removes the plaintext dump. busybox
#     sh does not run the EXIT trap on a signal by itself. (INT cannot be sent here: background jobs ignore it.)
for signal in TERM HUP; do
  sh "$lib/backup.sh" >/dev/null 2>&1 || die "interrupted ($signal): the backup before it failed"
  BACKUP_REPOSITORY="rest:http://127.0.0.1:1/" BACKUP_CONNECT_TIMEOUT_SECONDS=5 sh "$lib/backup.sh" >"$work/signal.log" 2>&1 &
  run_pid=$!
  for _ in $(seq 1 40); do grep -q 'checking the restic repository' "$work/signal.log" && break; sleep 0.5; done
  [ -s "$work/state/dump/attraccess.dump" ] || die "interrupted ($signal): the run did not reach the point with a dump"
  kill -"$signal" "$run_pid"
  rc=0
  wait "$run_pid" || rc=$?
  [ "$rc" -ne 0 ] || die "interrupted ($signal): the run must exit with an error"
  grep -q 'the run was interrupted' "$work/signal.log" || { cat "$work/signal.log"; die "interrupted ($signal): missing the message"; }
  grep -q '^backup_last_run_success 0$' "$work/status/backup.prom" || die "interrupted ($signal): the run must be recorded as failed"
  [ ! -e "$work/state/dump/attraccess.dump" ] || die "interrupted ($signal): the plaintext dump was left behind"
done
pass "an interrupted run is recorded as failed and removes the dump"

# 9g. An interrupted restore removes its copy of the plaintext dump.
mkdir -p "$work/bin4"
real_pg_restore="$(command -v pg_restore)"
printf '#!/bin/sh\ntouch "%s"\nsleep 3\nexec "%s" "$@"\n' "$work/pg_restore-started" "$real_pg_restore" >"$work/bin4/pg_restore"
chmod 0755 "$work/bin4/pg_restore"
PATH="$work/bin4:$PATH" DATABASE_URL="$(url_for "$db_dst")" sh "$lib/restore.sh" --force >"$work/restore-signal.log" 2>&1 &
restore_pid=$!
for _ in $(seq 1 60); do [ -e "$work/pg_restore-started" ] && break; sleep 0.5; done
[ -s "$work/state/restore$work/state/dump/attraccess.dump" ] || { cat "$work/restore-signal.log"; die "the restore did not reach the point with a dump"; }
kill -TERM "$restore_pid"
rc=0
wait "$restore_pid" || rc=$?
[ "$rc" -ne 0 ] || die "an interrupted restore must exit with an error"
[ ! -e "$work/state/restore" ] || die "an interrupted restore left the plaintext dump behind"
pass "an interrupted restore removes its copy of the dump"

# 10. An invalid BACKUP_SCHEDULE refuses the start (crond would skip such a line silently).
for bad in 'bad' '* * * *' '61 25 * * *' '0 24 * * *' '0 3 32 * *' '0 3 * 13 *' '0 3 * * 8'; do
  out="$(BACKUP_SCHEDULE="$bad" timeout 3 "$lib/entrypoint.sh" run 2>&1 || true)"
  printf '%s\n' "$out" | grep -q 'BACKUP_SCHEDULE must be' || die "schedule '$bad' must be rejected, got: $out"
done
for good in '0 3 * * *' '*/5 * * * *' '0,30 6-18 * * 1-5' '15 2 1 jan mon'; do
  out="$(BACKUP_SCHEDULE="$good" timeout 5 "$lib/entrypoint.sh" run 2>&1 || true)"
  if printf '%s\n' "$out" | grep -q 'BACKUP_SCHEDULE must be'; then die "schedule '$good' must be accepted, got: $out"; fi
done
pass "an invalid BACKUP_SCHEDULE is rejected, valid ones are accepted"
