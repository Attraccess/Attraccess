import { assertManagementPublicKey } from './wago-management-key';

export type ManagementShellAction = 'prepare' | 'arm' | 'install' | 'commit' | 'rollback' | 'watchdog';
const quote = (value: string) => `'${value.replace(/'/g, `'"'"'`)}'`;

/** Additive OpenSSH / source-identified Dropbear authorized_keys transaction for a NON-ROOT account.
 * Standard Linux stat/flock/timeout/nohup are checked, never installed. No WAGO-specific service
 * command is inferred. Baseline restriction is deliberately absent. Watchdog survives SSH/server
 * loss but not device reboot; additive enrollment never removes existing login access.
 * All paths are fixed beneath the authenticated HOME; no UI-supplied path or shell accepted.
 * The snapshot is retained after commit for explicit recovery. Rollback refuses concurrent edits.
 * Prepare persists a boot ID + uptime deadline, independent of wall clocks. Remote commands are
 * bounded per phase to 15s and mutations to the remaining deadline. Watchdog contention retries are bounded
 * to 75s; exhaustion retains the journal for explicit recovery while expiry still blocks writes.
 */
export function managementKeyCommand(
  action: ManagementShellAction,
  token: string,
  seconds = 180,
  publicKey?: string,
): string {
  if (!/^[a-f0-9]{32}$/.test(token) || !Number.isInteger(seconds) || seconds < 1 || seconds > 300)
    throw new Error('invalid_transaction');
  const selectedKey = publicKey ?? '';
  if (action === 'install') assertManagementPublicKey(selectedKey);
  // OpenSSH authorized_keys(5) and bundled Dropbear 2025.88 svr-authpubkeyoptions.c.
  // These limit the new key only. Shell access still has the existing account's privileges.
  const entry = `no-agent-forwarding,no-port-forwarding,no-pty,no-X11-forwarding ${selectedKey}`;
  const helpers = String.raw`set -eu
now() {
  IFS='. ' read -r whole fraction idle < /proc/uptime
  case "$whole" in *[!0-9]*|'') exit 1;; esac
  case "$fraction" in [0-9][0-9]) ;; *) exit 1;; esac
  uptime=$((whole * 100 + (100$fraction % 100)))
}
unexpired() {
  test "$(cat /proc/sys/kernel/random/boot_id)" = "$(cat "$tx/boot-id")"
  read -r deadline < "$tx/deadline"
  case "$deadline" in *[!0-9]*|'') exit 1;; esac
  now
  remaining=$((deadline - uptime))
  test "$remaining" -gt 0
  delay=$(printf '%s.%02d' "$((remaining / 100))" "$((remaining % 100))")
  test ! -e "$tx/expired"
}
safe_keys() {
  test ! -L authorized_keys
  if [ -e authorized_keys ]; then
    test -f authorized_keys
    test "$(stat -c '%u:%a:%h' authorized_keys)" = "$uid:600:1"
    test "$(wc -c < authorized_keys)" -le 65536
  fi
}
owned() {
  test -d "$tx" && test "$(stat -c '%u:%a' "$tx")" = "$uid:700"
  test -f "$tx/token" && test ! -L "$tx/token"
  test "$(cat "$tx/token")" = "$token"
}
active() {
  owned
  test ! -e "$tx/committed" && test ! -e "$tx/recovered"
  test -f "$tx/armed"
  unexpired
}
`;
  const script = String.raw`set -eu
umask 077
uid=$(id -u)
test "$uid" -gt 0
test -n "$HOME" && test ! -L "$HOME" && test -d "$HOME"
test "$(stat -c '%u' "$HOME")" = "$uid"
cd -P "$HOME"
test ! -L .ssh
if [ ! -d .ssh ]; then mkdir -m 0700 .ssh; fi
test "$(stat -c '%u:%a' .ssh)" = "$uid:700"
cd .ssh
test ! -L .attraccess-management.lock
if [ -e .attraccess-management.lock ]; then
  test -f .attraccess-management.lock
  test "$(stat -c '%u:%a:%h' .attraccess-management.lock)" = "$uid:600:1"
fi
exec 9>>.attraccess-management.lock
LOCK
tx=.attraccess-management-transaction
token=TOKEN
export tx token uid
test ! -L "$tx"
HELPERS
rollback() {
  # A missing journal means prepare never started (or a completed recovery).
  if [ ! -e "$tx" ]; then return 0; fi
  owned
  if [ -e "$tx/recovered" ]; then return 0; fi
  safe_keys
  # Intent precedes rename, so process death between rename and acknowledgement is recoverable.
  if [ -e "$tx/installing" ]; then
    if [ -f authorized_keys ] && cmp -s authorized_keys "$tx/installed"; then
      if [ -e "$tx/had_keys" ]; then
        cp "$tx/previous" "$tx/restore"
        chmod 0600 "$tx/restore"
        mv "$tx/restore" authorized_keys
      else rm authorized_keys; fi
    elif [ -e "$tx/had_keys" ]; then
      cmp -s authorized_keys "$tx/previous" || return 1
    else test ! -e authorized_keys || return 1; fi
  fi
  touch "$tx/recovered"
}
ACTION
printf 'OK\n'`;
  let body: string;
  switch (action) {
    case 'prepare':
      body = String.raw`safe_keys
for tool in stat flock timeout nohup sleep cmp cp mv mktemp; do command -v "$tool" >/dev/null; done
if [ -d "$tx" ] && [ -f "$tx/recovered" ]; then
  old_token=$(cat "$tx/token")
  # Preserve successful recovery receipts and permit a new enrollment without reusing a journal.
  case "$old_token" in *[!a-f0-9]*|'') exit 1;; esac
  test "$(printf '%s' "$old_token" | wc -c)" -eq 32
  test ! -e ".attraccess-management-recovered-$old_token"
  mv "$tx" ".attraccess-management-recovered-$old_token"
fi
test ! -e "$tx"
# A killed prepare can leave staging debris, never a partially published active journal.
stage=$(mktemp -d .attraccess-management-staging.XXXXXXXXXX)
trap 'rm -rf "$stage"' EXIT
printf '%s\n' "$token" > "$stage/token"
cat /proc/sys/kernel/random/boot_id > "$stage/boot-id"
now
printf '%s\n' "$((uptime + SECONDS * 100))" > "$stage/deadline"
if [ -e authorized_keys ]; then
  cp authorized_keys "$stage/previous"
  touch "$stage/had_keys"
else : > "$stage/previous"; fi
touch "$stage/prepared"
mv "$stage" "$tx"
trap - EXIT`.replace('SECONDS', String(seconds));
      break;
    case 'arm': {
      // The child reacquires the same flock only when rolling back. Closing fd 9 is essential.
      const rollback = managementKeyCommand('watchdog', token, seconds);
      body = `owned
test -f "$tx/prepared"
test ! -e "$tx/armed" && test ! -e "$tx/committed" && test ! -e "$tx/recovered"
unexpired
nohup sh -c ${quote(`sleep "$1"\nexec sh -c ${quote(rollback)}`)} sh "$delay" </dev/null >/dev/null 2>&1 9>&- &
pid=$!
kill -0 "$pid"
printf '%s\\n' "$pid" > "$tx/watchdog-pid"
unexpired
touch "$tx/armed"`;
      break;
    }
    case 'install':
      body = `active
safe_keys
test ! -e "$tx/installing"
if [ -e "$tx/had_keys" ]; then cmp -s authorized_keys "$tx/previous"; else test ! -e authorized_keys; fi
test "$(wc -c < "$tx/previous")" -le ${65536 - Buffer.byteLength(entry) - 2}
cp "$tx/previous" "$tx/installed"
printf '\\n%s\\n' ${quote(entry)} >> "$tx/installed"
cp "$tx/installed" "$tx/next"
chmod 0600 "$tx/next"
touch "$tx/installing"
active
safe_keys
if [ -e "$tx/had_keys" ]; then cmp -s authorized_keys "$tx/previous"; else test ! -e authorized_keys; fi
mv "$tx/next" authorized_keys`;
      break;
    case 'commit':
      body = String.raw`active
safe_keys
test -f "$tx/installing"
cmp -s authorized_keys "$tx/installed"
active
touch "$tx/committed"`;
      break;
    case 'rollback':
      body = 'rollback';
      break;
    case 'watchdog':
      body = String.raw`if [ ! -e "$tx" ]; then exit 0; fi
owned
if [ ! -e "$tx/committed" ] && [ ! -e "$tx/recovered" ]; then
  touch "$tx/expired"
  rollback
fi`;
      break;
    default:
      throw new Error('invalid_action');
  }
  if (action === 'install' || action === 'commit') {
    // A nested timeout has its own process group: cap it independently if the outer command dies.
    body = `active\nif [ "$remaining" -gt 1500 ]; then delay=15; fi\ntimeout -s KILL "$delay" sh -c ${quote(helpers + body)}`;
  }
  const lock =
    action === 'watchdog'
      ? `attempt=0
until flock -w 5 9; do
  attempt=$((attempt + 1))
  test "$attempt" -lt 12 || exit 1
  sleep 1
done`
      : 'flock -w 5 9';
  const command = script
    .replace('LOCK', lock)
    .replace('TOKEN', quote(token))
    .replace('HELPERS', helpers)
    .replace('ACTION', body);
  return `timeout -s KILL ${action === 'watchdog' ? 75 : 15} sh -c ${quote(command)}`;
}
