import { quote } from './wago-managed-provision.state';
import { wagoShellFilesystemGuard } from './wago-shell-filesystem';
import { dropbearWrapper } from './wago-managed-provision.state';
import { managedFailureTrap } from './wago-managed-provision.state';
import { managedAccountPreflight } from './wago-managed-provision.state';

export function isolated(source: string, testRoot: string): string {
  if (!testRoot) return source;
  if (!testRoot.startsWith('/') || testRoot === '/' || /[\n']/.test(testRoot))
    throw new Error('Invalid isolated management root');
  return source
    .replaceAll('PATH=/usr/sbin:/usr/bin:/sbin:/bin', `PATH=${quote(testRoot + '/bin')}`)
    .replaceAll("root=''", `root=${quote(testRoot)}`)
    .replace(/\/(?:etc|home|usr\/(?:sbin|bin)|var\/run)(?=\/|\b)/g, (path, offset: number, whole: string) =>
      whole.slice(0, offset).endsWith('$root') || whole.slice(offset).startsWith(testRoot) ? path : testRoot + path,
    );
}

export function managedCommitScript(token: string, testRoot = '', helperParameters = false): string {
  if (!/^[a-f0-9]{32}$/.test(token)) throw new Error('Invalid management token');
  return isolated(
    `set -eu
umask 077
base=/etc/attraccess-wago-management
exec 7>"$base/access.lock"; timeout -k 5 30 flock 7
test "$(cat "$base/token")" = ${helperParameters ? '"${token}"' : quote(token)}
test -f "$base/cutover"
printf '%s\\n' ${helperParameters ? '"${token}"' : quote(token)} > "$base/committed.next"
sync; mv "$base/committed.next" "$base/committed"; sync
printf 'OK\\n'
`,
    testRoot,
  );
}

export function managedCutoverScript(token: string, testRoot = '', helperParameters = false): string {
  if (!/^[a-f0-9]{32}$/.test(token)) throw new Error('Invalid management token');
  return isolated(
    `set -eu
umask 077
base=/etc/attraccess-wago-management
root=''; config=/etc/attraccess-wago
fail() { exit 1; }
${wagoShellFilesystemGuard({ waitForLock: true })}
test "$(cat "$base/token")" = ${helperParameters ? '"${token}"' : quote(token)}
test ! -e "$base/cutover" && test ! -e "$base/committed" || exit 1
test -f /etc/init.d/dropbear && test ! -L /etc/init.d/dropbear || exit 1
cp /etc/init.d/dropbear "$base/dropbear.previous"
chmod 0700 "$base/dropbear.previous"
printf '%s' ${quote(Buffer.from(isolated(dropbearWrapper, testRoot)).toString('base64'))} | base64 -d > "$base/dropbear.next"
chmod 0755 "$base/dropbear.next"
touch "$base/cutover"; sync
nohup "$base/watchdog" 9>&- </dev/null >/dev/null 2>&1 &
mv "$base/dropbear.next" /etc/init.d/dropbear; sync
# Run reload detached: it may close this SSH session. Server must reconnect,
# perform fresh positive/negative authentication probes, then explicitly commit.
nohup sh -c 'sleep 2; /etc/init.d/dropbear restart' 9>&- </dev/null >/dev/null 2>&1 &
printf 'OK\\n'
`,
    testRoot,
  );
}

/** Only invoked after an independent connection proves the pending key and
 * durable server storage records that proof. Ambiguous replies are retryable.
 */
export function managedKeyCommitScript(token: string, testRoot = '', helperParameters = false): string {
  if (!/^[a-f0-9]{32}$/.test(token)) throw new Error('Invalid management token');
  return isolated(
    `set -eu
umask 077
root=''; config=/etc/attraccess-wago
fail() { exit 1; }
${wagoShellFilesystemGuard({ waitForLock: true })}
base=/etc/attraccess-wago-management
test "$(cat "$base/token")" = ${helperParameters ? '"${token}"' : quote(token)}
test -f "$base/key.pending" && test ! -L "$base/key.pending" && test "$(stat -c '%u:%g:%a:%h' "$base/key.pending")" = 0:0:600:1 || exit 1
test -d /home/attraccess/.ssh && test ! -L /home/attraccess/.ssh || exit 1
test -f /home/attraccess/.ssh/authorized_keys && test ! -L /home/attraccess/.ssh/authorized_keys || exit 1
test "$(stat -c '%u:%g:%a:%h' /home/attraccess/.ssh/authorized_keys)" = 0:0:644:1
cp "$base/key.pending" "$base/authorized_keys.next"
chmod 0644 "$base/authorized_keys.next"
sync; mv "$base/authorized_keys.next" /home/attraccess/.ssh/authorized_keys; sync
printf 'OK\\n'
`,
    testRoot,
  );
}

/** Read-only check before CODESYS, runtime installation or passwords are changed. */
export function managedProvisionPreflightScript(testRoot = ''): string {
  return isolated(
    `set -eu
PATH=/usr/sbin:/usr/bin:/sbin:/bin
export PATH
wago_management_stage=tools
${managedFailureTrap}
${managedAccountPreflight}
printf 'OK\\n'
`,
    testRoot,
  );
}

export function managedRebootScript(token: string, testRoot = '', helperParameters = false): string {
  if (!/^[a-f0-9]{32}$/.test(token)) throw new Error('Invalid management token');
  return isolated(
    `set -eu
base=/etc/attraccess-wago-management
test "$(cat "$base/token")" = ${helperParameters ? '"${token}"' : quote(token)}
test -f "$base/cutover" && test ! -e "$base/committed" || exit 1
nohup sh -c ${quote(`sleep 2; ${quote(testRoot + '/sbin/reboot')}`)} 9>&- </dev/null >/dev/null 2>&1 &
printf 'OK\\n'
`,
    testRoot,
  );
}

/** Explicit administrator recovery before deleting/re-enrolling a managed device. */
export function managedRestoreScript(token: string, testRoot = '', helperParameters = false): string {
  if (!/^[a-f0-9]{32}$/.test(token)) throw new Error('Invalid management token');
  return isolated(
    `set -eu
umask 077
base=/etc/attraccess-wago-management
exec 7>"$base/access.lock"; timeout -k 5 30 flock 7
test "$(cat "$base/token")" = ${helperParameters ? '"${token}"' : quote(token)}
if test -f "$base/cutover"; then
  test -f "$base/dropbear.previous" && test ! -L "$base/dropbear.previous" || exit 1
  rm -f "$base/committed"
  sync
  nohup sh -c 'sleep 2; exec "$1" restore' sh "$base/watchdog" 7>&- </dev/null >/dev/null 2>&1 &
fi
printf 'OK\\n'
`,
    testRoot,
  );
}
