import { wagoShellFilesystemGuard } from './wago-shell-filesystem';
import { runtimeBundleAcceptScript } from './wago-runtime-install';
import { wagoDockerProvisionFinishScript } from './wago-hardware-deployment';

export type CommissioningManagementRefresh = { token: string; helper: string; watchdog: string };

/** Confirm only this enrolment's journals, under one bounded installation lock. */
export function commissioningAcceptanceScript(
  token: string, testRoot = '', helperParameters = false, management?: CommissioningManagementRefresh,
): string {
  if (!/^[a-f0-9]{32}$/.test(token)) throw new Error('Invalid commissioning token');
  if (management && !/^[a-f0-9]{32}$/.test(management.token)) throw new Error('Invalid management token');
  if (testRoot && (!testRoot.startsWith('/') || testRoot === '/' || /[\n']/.test(testRoot)))
    throw new Error('Invalid isolated root');
  return `set -eu
umask 077
root='${testRoot}'
config="$root/etc/attraccess-wago"
token=${helperParameters ? '"${token}"' : `'${token}'`}
fail() { echo "$*" >&2; exit 1; }
${wagoShellFilesystemGuard({ waitForLock: true })}
${management ? `# Refresh only already-owned bootstrap scripts, before any SSH change.
base="$root/etc/attraccess-wago-management"
test -d "$base" && test ! -L "$base" && test "$(stat -c '%u:%g:%a' "$base")" = 0:0:700 || fail 'Unsafe management configuration'
test -f "$base/token" && test ! -L "$base/token" && test "$(stat -c '%u:%g:%a:%h' "$base/token")" = 0:0:600:1 || fail 'Unsafe management ownership record'
test "$(cat "$base/token")" = '${management.token}' || fail 'Management belongs to another enrolment'
test ! -e "$base/cutover" && test ! -L "$base/cutover" && test ! -e "$base/committed" && test ! -L "$base/committed" || fail 'SSH cutover is already active'
wago_require_root_directory_or_alias "$root/usr/sbin" || fail 'Unsafe management helper parent'
for executable in "$root/usr/sbin/attraccess-wago-management" "$base/watchdog"; do
  test -f "$executable" && test ! -L "$executable" && test "$(stat -c '%u:%g:%a:%h' "$executable")" = 0:0:700:1 || fail 'Unsafe management executable'
done` : ''}
# Repeated acceptance is safe only when no installation journal remains.
for journal in "$root/var/lib/attraccess-wago-install-transaction" "$root/var/lib/attraccess-wago-install-transaction.accepted-cleanup"; do
  if test -e "$journal" || test -L "$journal"; then
    test -d "$journal" && test ! -L "$journal" || fail 'Unsafe installation journal'
    test -f "$journal/token" && test ! -L "$journal/token" || fail 'Installation ownership unavailable'
    test "$(cat "$journal/token")" = "$token" || fail 'Installation belongs to another enrolment'
  fi
done
if test -e "$root/var/lib/attraccess-wago-install-transaction" || test -e "$root/var/lib/attraccess-wago-install-transaction.accepted-cleanup"; then
  (${runtimeBundleAcceptScript(testRoot, true)})
fi
# Retire runtime and preparation receipts in dependency order, with the lock held.
(${wagoDockerProvisionFinishScript(token, 'accepted', testRoot, helperParameters, true)})
${management ? `# Source is compiled by the server; no API accepts executable uploads.
stage=$(mktemp -d "$base/.bootstrap-refresh.XXXXXX")
trap 'rm -rf "$stage"' EXIT
printf '%s' '${Buffer.from(management.helper).toString('base64')}' | base64 -d > "$stage/helper"
printf '%s' '${Buffer.from(management.watchdog).toString('base64')}' | base64 -d > "$stage/watchdog"
sh -n "$stage/helper" && sh -n "$stage/watchdog" || fail 'Invalid management executable'
chmod 0700 "$stage/helper" "$stage/watchdog"
sync; mv "$stage/helper" "$root/usr/sbin/attraccess-wago-management"; sync
mv "$stage/watchdog" "$base/watchdog"; sync
rm -rf "$stage"; trap - EXIT` : ''}
printf 'OK\\n'
`;
}
