import { wagoShellStat } from './wago-shell-stat';
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
