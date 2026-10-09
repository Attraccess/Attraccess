import { wagoShellFilesystemGuard } from './filesystem';

/** Administrator-installed WBM recovery for old helpers that cannot roll back. */
export function sshLockRecoveryScript(hardwareId: string, testRoot = ''): string {
  if (!/^cc100-[a-f0-9]{16}$/.test(hardwareId)) throw new Error('Invalid recovery controller identity');
  if (testRoot && (!testRoot.startsWith('/') || testRoot === '/' || /[\n']/.test(testRoot)))
    throw new Error('Invalid isolated recovery root');
  return `#!/bin/sh
set -eu
umask 077
PATH=${testRoot ? `'${testRoot}/bin'` : '/usr/sbin:/usr/bin:/sbin:/bin'}
export PATH
unset ENV BASH_ENV CDPATH
test "$(id -u)" = 0 || exit 1
root='${testRoot}'
config="$root/etc/attraccess-wago"
fail() { echo "SSH recovery: $*" >&2; exit 1; }
test -d "$config" && test ! -L "$config" || fail 'Attraccess configuration not found'
${wagoShellFilesystemGuard({ acquireLock: false })}
base="$root/etc/attraccess-wago-management"
test -d "$base" && test ! -L "$base" && test "$(stat -c '%u:%g:%a' "$base")" = 0:0:700 || fail 'Unsafe management directory'
environment="$config/runtime.env"
test -f "$environment" && test ! -L "$environment" && test "$(stat -c '%u:%g:%a:%h' "$environment")" = 0:0:600:1 || fail 'Unsafe controller identity file'
test "$(grep -c '^WAGO_HARDWARE_ID=' "$environment")" = 1 || fail 'Ambiguous controller identity'
grep -Fx 'WAGO_HARDWARE_ID=${hardwareId}' "$environment" >/dev/null || fail 'Package belongs to a different CC100'
test ! -e "$base/committed" && test ! -L "$base/committed" || fail 'SSH access was already confirmed; recovery refused'
if test ! -e "$base/cutover" && test ! -L "$base/cutover" && test -f "$base/flock-repair-completed"; then
  printf 'SSH recovery already completed\\n'; exit 0
fi
test -f "$base/cutover" && test ! -L "$base/cutover" || fail 'No unconfirmed SSH change to restore'
${wagoShellFilesystemGuard({ waitForLock: true })}
test ! -L "$base/access.lock" || fail 'SSH transition lock is a symbolic link; administrator repair is required'
test -f "$base/access.lock" || fail 'SSH transition lock is missing or is not a regular file; administrator repair is required'
lock_metadata=$(stat -c '%u:%g:%a:%h' "$base/access.lock") || fail 'Cannot read SSH transition lock permissions'
# Old watchdogs inherit umask 022 and create a root-owned 0644 lock inside
# this private directory. Accept that legacy mode, retaining the locked inode.
case "$lock_metadata" in
  0:0:600:1|0:0:644:1) ;;
  *) fail "SSH transition lock has unexpected owner, permissions or links (uid:gid:mode:links=$lock_metadata; expected 0:0:600:1 or 0:0:644:1); administrator repair is required" ;;
esac
exec 7<>"$base/access.lock"
timeout -k 5 30 flock 7 || fail 'SSH transition is busy; retry recovery'
test ! -e "$base/committed" && test ! -L "$base/committed" && test -f "$base/cutover" && test ! -L "$base/cutover" || fail 'SSH transition changed during recovery'
wago_require_root_directory_or_alias "$root/usr/sbin" || fail 'Unsafe helper parent'
for file in "$root/usr/sbin/attraccess-wago-management" "$base/watchdog" "$base/dropbear.previous"; do
  test -f "$file" && test ! -L "$file" && test "$(stat -c '%u:%g:%a:%h' "$file")" = 0:0:700:1 || fail 'Unsafe management executable'
done
chmod 0600 "$base/access.lock"
stage=$(mktemp -d "$base/.flock-repair.XXXXXX")
trap 'rm -rf "$stage"' EXIT
patch_script() {
  original="$1"; destination="$2"
  # A retry after interrupted publication may already have patched one file.
  grep -F 'flock -w 30 7' "$original" >/dev/null || grep -F 'timeout -k 5 30 flock 7' "$original" >/dev/null || fail 'Unexpected management script'
  # Set a private creation mask even when patching a legacy watchdog.
  test "$(head -n 1 "$original")" = '#!/bin/sh' || fail 'Unexpected management script interpreter'
  { printf '#!/bin/sh\\numask 077\\n'; sed '1d; s/flock -w 30 7/timeout -k 5 30 flock 7/g' "$original"; } > "$destination"
  sh -n "$destination" || fail 'Invalid patched management script'
  chmod 0700 "$destination"
}
patch_script "$root/usr/sbin/attraccess-wago-management" "$stage/helper"
patch_script "$base/watchdog" "$stage/watchdog"
sync; mv "$stage/helper" "$root/usr/sbin/attraccess-wago-management"; sync
mv "$stage/watchdog" "$base/watchdog"; sync
rm -rf "$stage"; trap - EXIT
# The rollback script acquires its own SSH lock and restarts the daemon.
# Neither its process nor the restarted daemon may inherit our install lock.
exec 7>&- 9>&-
"$base/watchdog" restore
test ! -e "$base/cutover" && test ! -L "$base/cutover" || fail 'SSH rollback did not finish'
touch "$base/flock-repair-completed"; sync
printf 'SSH lock scripts repaired and previous SSH access restored\\n'
`;
}
