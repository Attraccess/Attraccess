import { assertManagementPublicKey } from './wago-management-key';
import { wagoShellFilesystemGuard } from './wago-shell-filesystem';
import { randomBytes } from 'node:crypto';
import { createPublicKey } from 'node:crypto';
import { isolated } from './wago-managed-provision.isolated.helpers';
import { managedFailureTrap } from './wago-managed-provision.state';
import { managedAccountPreflight } from './wago-managed-provision.state';
import { quote } from './wago-managed-provision.state';
import { MANAGEMENT_HELPER } from './wago-managed-provision.state';
import { managedWatchdogScript } from './wago-managed-provision.managed-retire-script.helpers';

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
