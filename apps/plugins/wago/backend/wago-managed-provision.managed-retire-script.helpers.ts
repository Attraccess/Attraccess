import { wagoShellFilesystemGuard } from './wago-shell-filesystem';
import { isolated } from './wago-managed-provision.isolated.helpers';
import { quote } from './wago-managed-provision.state';
import { managedAccessWatchdog } from './wago-managed-provision.state';

/** Retirement follows a server-side proof of restored root recovery access.
 * Keep the encrypted recovery envelope and remote receipt after dropping keys.
 */
export function managedRetireScript(token: string, testRoot = '', helperParameters = false): string {
  if (!/^[a-f0-9]{32}$/.test(token)) throw new Error('Invalid management token');
  return isolated(
    `set -eu
umask 077
root=''; config=/etc/attraccess-wago
fail() { exit 1; }
${wagoShellFilesystemGuard({ waitForLock: true })}
base=/etc/attraccess-wago-management
test "$(cat "$base/token")" = ${helperParameters ? '"${token}"' : quote(token)}
test ! -e "$base/cutover" && test ! -e "$base/committed" || exit 1
test -f "$base/owned-account" && test ! -L "$base/owned-account" || exit 1
test -d /home/attraccess/.ssh && test ! -L /home/attraccess/.ssh || exit 1
keys=/home/attraccess/.ssh/authorized_keys
if test -e "$keys" || test -L "$keys"; then
  test -f "$keys" && test ! -L "$keys" && test "$(stat -c '%u:%g:%a:%h' "$keys")" = 0:0:644:1 || exit 1
  rm -f "$keys"
fi
rm -f "$base/key.pending"
sync
printf 'OK\\n'
`,
    testRoot,
  );
}

export function managedWatchdogScript(testRoot = ''): string {
  return isolated(managedAccessWatchdog, testRoot);
}
