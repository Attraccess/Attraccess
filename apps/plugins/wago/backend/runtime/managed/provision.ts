import { createPublicKey, randomBytes } from 'node:crypto';
import { assertManagementPublicKey } from '../../management/key';
import { wagoShellFilesystemGuard } from '../../host/shell/filesystem';
import { wagoShellStat } from '../../host/shell/stat';

export /** Only handles startup policy; no password, key or arbitrary command execution. */
const dropbearWrapper = `#!/bin/sh
set -eu
PATH=/usr/sbin:/usr/bin:/sbin:/bin
export PATH
case "\${1:-}" in
  start) /usr/sbin/dropbear -G attraccess -w -s -p 22 -P /var/run/dropbear.pid ;;
  stop) /etc/attraccess-wago-management/dropbear.previous stop ;;
  restart|reload) /etc/attraccess-wago-management/dropbear.previous stop; /usr/sbin/dropbear -G attraccess -w -s -p 22 -P /var/run/dropbear.pid ;;
  *) exit 1 ;;
esac
`;

export const MANAGEMENT_HELPER = '/usr/sbin/attraccess-wago-management';

/** A reboot or lost server during cutover restores the known-working SSH policy.
 * The root password stays rotated, and its encrypted recovery copy stays in DB.
 * This watchdog is root-owned, not dependent on a live SSH session or server timer.
 */
export const managedAccessWatchdog = `#!/bin/sh
set -eu
umask 077
PATH=/usr/sbin:/usr/bin:/sbin:/bin
export PATH
root=''
${wagoShellStat()}
base=/etc/attraccess-wago-management
test -d "$base" && test ! -L "$base" && test "$(stat -c '%u:%g:%a' "$base")" = 0:0:700 || exit 1
restore_access() {
  test -f "$base/cutover" && test ! -L "$base/cutover" || return 0
  test ! -f "$base/committed" || return 0
  test -f "$base/dropbear.previous" && test ! -L "$base/dropbear.previous" && test "$(stat -c '%u:%g:%a:%h' "$base/dropbear.previous")" = 0:0:700:1 || exit 1
  cp "$base/dropbear.previous" /etc/init.d/dropbear.next
  chmod 0755 /etc/init.d/dropbear.next
  sync; mv /etc/init.d/dropbear.next /etc/init.d/dropbear; sync
  /etc/init.d/dropbear restart 7>&-
  rm -f "$base/cutover"; sync
}
if test "\${1:-}" = boot; then
  # Give the server a bounded opportunity to prove hardened access after reboot.
  # A lost server still restores the known-working policy without remote input.
  if test -f "$base/cutover" && test ! -f "$base/committed"; then
    nohup "$base/watchdog" </dev/null >/dev/null 2>&1 &
  fi
elif test "\${1:-}" = restore; then
  exec 7>"$base/access.lock"; timeout -k 5 30 flock 7
  restore_access
elif test "\${1:-}" = runtime-boot; then
  tx=/var/lib/attraccess-wago-update-transaction
  if test -d "$tx" && test ! -L "$tx" && test "$(stat -c '%u:%g:%a' "$tx")" = 0:0:700; then
    case "$(cat "$tx/phase")" in accepted|accepted-cleaning|restored) ;; *)
      # This hook runs after the vendor Docker hook and before Attraccess's
      # runtime hook. A failed recovery must not boot an unverified replacement.
      rm -f /etc/attraccess-wago/runtime-enabled
      token=$(cat "$tx/token"); previous=$(cat "$tx/previous-image-id")
      printf 'recover %s %s\\n' "$token" "$previous" | timeout -k 5 600 ${MANAGEMENT_HELPER} ;;
    esac
  fi
else
  sleep 180
  exec 7>"$base/access.lock"; timeout -k 5 30 flock 7
  restore_access
fi
`;

export // CC100 FW31 ships shadow's passwd, but omits chpasswd, getent and visudo.
// Keep passwords on stdin and validate the installed, fixed sudo rule using sudo.
const managedAccountPreflight = String.raw`
wago_management_stage=tools
for tool in groupadd useradd passwd sudo cut flock timeout nohup openssl awk; do command -v "$tool" >/dev/null; done
wago_management_stage=accounts
awk '/^[[:space:]]*(passwd|group):/ { if ($2 != "files" || NF != 2) exit 1; seen[$1]++ }
  END { if (seen["passwd:"] != 1 || seen["group:"] != 1) exit 1 }' /etc/nsswitch.conf
test -r /etc/passwd && test -r /etc/group
wago_management_stage=policy
grep -Eq '^[#@]includedir[[:space:]]+/etc/sudoers.d[[:space:]]*$' /etc/sudoers
test -d /etc/sudoers.d && test ! -L /etc/sudoers.d
wago_management_stage=peer
test "$(/usr/sbin/dropbear -V 2>&1)" = 'Dropbear v2025.88'
`;

export const managedFailureTrap = String.raw`
trap 'result=$?; if test "$result" != 0; then printf "WAGO_MANAGEMENT_FAILURE=%s\n" "$wago_management_stage"; fi' EXIT
`;

export const MANAGEMENT_USERNAME = 'attraccess';

export const quote = (value: string) => `'${value.replaceAll("'", "'\\''")}'`;

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

export function managedProvisionScript(
  token: string,
  publicKey: string,
  password: string,
  helper: string,
  testRoot = '',
  installerAuthority?: string,
): string {
  if (!/^[a-f0-9]{32}$/.test(token) || !/^[A-Za-z0-9_-]{43}$/.test(password))
    throw new Error('Invalid management provisioning');
  assertManagementPublicKey(publicKey);
  if (installerAuthority && createPublicKey(installerAuthority).asymmetricKeyType !== 'rsa')
    throw new Error('Invalid installer authority');
  return isolated(
    `set -eu
umask 077
PATH=/usr/sbin:/usr/bin:/sbin:/bin
export PATH
root=''; config=/etc/attraccess-wago
fail() { exit 1; }
wago_management_stage=filesystem
${managedFailureTrap}
${wagoShellFilesystemGuard({ waitForLock: true })}
test "$(id -u)" = 0
${managedAccountPreflight}
wago_management_stage=filesystem
wago_require_root_directory_or_alias /usr/sbin
wago_require_root_directory /etc/init.d
wago_require_root_directory /etc/rc.d
base=/etc/attraccess-wago-management
if test ! -e "$base"; then mkdir -m 0700 "$base"; fi
test -d "$base" && test ! -L "$base" && test "$(stat -c '%u:%g:%a' "$base")" = 0:0:700 || exit 1
test ! -e "$base/cutover" || test -e "$base/committed" || exit 1
wago_management_stage=account
if id attraccess >/dev/null 2>&1; then
  test -f "$base/owned-account" && test ! -L "$base/owned-account" || exit 1
  test "$(id -u attraccess)" -gt 0
  test "$(id -u attraccess)" != 10001
  test "$(id -g attraccess)" -gt 0
  test "$(awk -F: '$1 == "attraccess" {print $6}' /etc/passwd)" = /home/attraccess
else
  if ! awk -F: '$1 == "attraccess" {found=1} END {exit !found}' /etc/group; then groupadd attraccess; fi
  useradd -m -d /home/attraccess -s /bin/sh -g attraccess attraccess
  : > "$base/owned-account"; sync
fi
managed_gid=$(id -g attraccess)
test "$managed_gid" != 10001
test "$(awk -F: '$1 == "attraccess" {print $4}' /etc/group)" = ''
awk -F: -v gid="$managed_gid" '$4 == gid && $1 != "attraccess" {bad=1} END {exit bad}' /etc/passwd
# Keep the dedicated account usable for key authentication, but its random
# password is never issued and Dropbear password authentication is disabled later.
wago_set_password() {
  printf '%s\\n%s\\n' "$2" "$2" | passwd "$1" >/dev/null 2>&1
}
wago_management_stage=password
wago_set_password attraccess ${quote(randomBytes(32).toString('base64url'))}
wago_management_stage=key
test -d /home/attraccess && test ! -L /home/attraccess || exit 1
mkdir -p /home/attraccess/.ssh
test -d /home/attraccess/.ssh && test ! -L /home/attraccess/.ssh || exit 1
test ! -L /home/attraccess/.ssh/authorized_keys
printf '%s\\n' ${quote(`command="/usr/bin/sudo -n ${MANAGEMENT_HELPER}",no-port-forwarding,no-agent-forwarding,no-X11-forwarding,no-pty ${publicKey}`)} > "$base/key.pending"
chmod 0600 "$base/key.pending"
# Keep the known-working key until the server durably verifies its replacement.
# The account and directory are owned by Attraccess; no unowned key is adopted.
if test -e /home/attraccess/.ssh/authorized_keys; then
  test -f /home/attraccess/.ssh/authorized_keys && test "$(stat -c '%u:%g:%a:%h' /home/attraccess/.ssh/authorized_keys)" = 0:0:644:1 || exit 1
  cat /home/attraccess/.ssh/authorized_keys > "$base/authorized_keys.next"
else
  : > "$base/authorized_keys.next"
fi
if ! grep -Fxq "$(cat "$base/key.pending")" "$base/authorized_keys.next"; then
  cat "$base/key.pending" >> "$base/authorized_keys.next"
fi
chown root:root "$base/authorized_keys.next"
chmod 0644 "$base/authorized_keys.next"
mv "$base/authorized_keys.next" /home/attraccess/.ssh/authorized_keys
chown root:root /home/attraccess /home/attraccess/.ssh
chmod 0755 /home/attraccess /home/attraccess/.ssh
test -d /etc/sudoers.d && test ! -L /etc/sudoers.d || exit 1
test ! -L /etc/sudoers.d/attraccess-wago
wago_management_stage=policy
printf '%s\\n' 'attraccess ALL=(root) NOPASSWD: ${MANAGEMENT_HELPER} ""' > "$base/sudoers.next"
chmod 0440 "$base/sudoers.next"
if command -v visudo >/dev/null; then visudo -c -f "$base/sudoers.next" >/dev/null; fi
mv "$base/sudoers.next" /etc/sudoers.d/attraccess-wago
wago_management_stage=helper
test ! -L ${MANAGEMENT_HELPER}
${installerAuthority ? `test ! -L "$base/installer-public.pem"\nprintf '%s' ${quote(Buffer.from(installerAuthority).toString('base64'))} | base64 -d > "$base/installer-public.next"\nchmod 0600 "$base/installer-public.next"\nsync; mv "$base/installer-public.next" "$base/installer-public.pem"; sync` : ''}
printf '%s' ${quote(Buffer.from(helper).toString('base64'))} | base64 -d > "$base/helper.next"
chmod 0700 "$base/helper.next"
mv "$base/helper.next" ${MANAGEMENT_HELPER}
printf '%s' ${quote(Buffer.from(managedWatchdogScript(testRoot)).toString('base64'))} | base64 -d > "$base/watchdog"
chmod 0700 "$base/watchdog"
printf '%s\\n' '#!/bin/sh' 'set -eu' 'sleep 1800' 'tx=/var/lib/attraccess-wago-update-transaction' 'test -d "$tx" && test ! -L "$tx" || exit 0' 'test "$(cat "$tx/token")" = "$1" || exit 0' 'exec /etc/attraccess-wago-management/watchdog runtime-boot' > "$base/update-watchdog"
chmod 0700 "$base/update-watchdog"
publish_recovery_hook() {
  hook="$root/etc/rc.d/$1"
  if test -e "$hook" || test -L "$hook"; then
    test -f "$hook" && test ! -L "$hook" && test "$(stat -c '%u:%g:%a:%h' "$hook")" = 0:0:700:1 || fail 'Unsafe existing recovery boot hook'
  fi
  stage=$(mktemp "$root/etc/rc.d/.attraccess-recovery.XXXXXX")
  trap 'result=$?; rm -f "$stage"; if test "$result" != 0; then printf "WAGO_MANAGEMENT_FAILURE=%s\\n" "$wago_management_stage"; fi' EXIT
  printf '#!/bin/sh\\nexec /etc/attraccess-wago-management/watchdog %s\\n' "$2" > "$stage"
  chmod 0700 "$stage"
  sync; mv "$stage" "$hook"; sync
  ${managedFailureTrap}
}
publish_recovery_hook S01_attraccess_recovery boot
publish_recovery_hook S99_zy_attraccess_recovery runtime-boot
# sudo parses the actual policy, including the include directory. No helper is executed.
wago_management_stage=policy
sudo -n -l -U attraccess -- ${MANAGEMENT_HELPER} >/dev/null 2>&1
printf '%s\\n' ${quote(token)} > "$base/token"
rm -f "$base/committed"
wago_management_stage=password
wago_set_password root ${quote(password)}
sync
printf 'OK\\n'
`,
    testRoot,
  );
}
