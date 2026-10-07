import { wagoShellFilesystemGuard } from './wago-shell-filesystem';
import { isCc100HardwareProfile, type Cc100HardwareProfile } from '../shared/hardware-profile';
import { quote } from './wago-runtime-update-shell.quote';

/** These server-generated scripts are a separate state-preserving transaction.
 * They are not the destructive commissioning delivery/recovery scripts. A future
 * qualified management helper must expose only these fixed operations, never a
 * management-account arbitrary sudo executor.
 */
export function preamble(token: string, profile: Cc100HardwareProfile, testRoot: string, helperParameters = false) {
  if (!/^[a-f0-9]{32}$/.test(token) || !isCc100HardwareProfile(profile)) throw new Error('Invalid update ownership');
  if (testRoot && (!testRoot.startsWith('/') || testRoot === '/' || /[\n,]/.test(testRoot)))
    throw new Error('Invalid isolated root');
  const tokenValue = helperParameters ? '${token}' : token;
  const tokenWord = helperParameters ? '"${token}"' : quote(token);
  return `set -eu
umask 077
root=${quote(testRoot)}
config="$root/etc/attraccess-wago"
hook="$root/etc/rc.d/S99_zz_attraccess_wago"
data="$root/var/lib/attraccess-wago"
tx="$root/var/lib/attraccess-wago-update-transaction"
cleanup="$root/var/lib/attraccess-wago-update-cleanup-${tokenValue}"
unset DOCKER_HOST DOCKER_CONTEXT DOCKER_TLS_VERIFY DOCKER_CERT_PATH
docker() { timeout -k 5 45 docker --host unix:///var/run/docker.sock "$@"; }
fail() { echo "$*" >&2; exit 1; }
${wagoShellFilesystemGuard({ waitForLock: true })}
wago_require_root_directory_or_alias "$root/var/lib" || fail 'Unsafe state parent'
for path in "$config/delivery" "$config/docker-provision" "$config/runtime.env.next" "$config/runtime-ca.pem.next" "$root/var/lib/attraccess-wago-install-transaction" "$root/var/lib/attraccess-wago-install-transaction.restored" "$root/var/lib/attraccess-wago-install-transaction.cleanup" "$root/var/lib/attraccess-wago-install-transaction.accepted-cleanup"; do
  test ! -e "$path" && test ! -L "$path" || fail 'Commissioning recovery or acceptance required'
done
require_transaction() {
  test -d "$tx" && test ! -L "$tx" && test "$(stat -c '%u:%g:%a' "$tx")" = 0:0:700 || fail 'Unsafe update journal'
  for field in token profile phase image-id previous-id previous-image-id; do
    test -f "$tx/$field" && test ! -L "$tx/$field" && test "$(stat -c '%u:%g:%a:%h' "$tx/$field")" = 0:0:600:1 || fail 'Unsafe update metadata'
  done
   test "$(cat "$tx/token")" = ${tokenWord} && test "$(cat "$tx/profile")" = ${quote(profile)} || fail 'Foreign update transaction'
}
require_atomic_state_paths() {
  # Checkpoints/restoration share the real state parent. Forbid data mountpoints
  # and nested mounts; mv must be an atomic rename, never copy/delete fallback.
  data_canonical=$(readlink -f "$data") || fail 'Cannot resolve enrolled state'
  awk -v path="$data_canonical" 'NF < 10 {bad=1} $5 == path || index($5, path "/") == 1 {mounted=1} END {exit (NR == 0 || bad || mounted)}' "$root/proc/self/mountinfo" || fail 'Mounted runtime state cannot be atomically restored'
  if test -e "$data" || test -L "$data"; then
    test ! -L "$data" || fail 'Unsafe runtime state alias'
    data_identity=$(stat -Lc '%d:%i' "$data") || fail 'Cannot observe state filesystem'
    parent_identity=$(stat -Lc '%d:%i' "$root/var/lib") || fail 'Cannot observe state parent filesystem'
    test "\${data_identity%%:*}" = "\${parent_identity%%:*}" || fail 'State checkpoint filesystem mismatch'
  fi
}
phase() { printf '%s\\n' "$1" > "$tx/phase.next"; chmod 0600 "$tx/phase.next"; sync; mv "$tx/phase.next" "$tx/phase"; sync; }
owned_new_container() {
  test "$(docker inspect --format '{{index .Config.Labels "io.attraccess.wago.update-token"}}' attraccess-wago)" = ${tokenWord}
}
`;
}
