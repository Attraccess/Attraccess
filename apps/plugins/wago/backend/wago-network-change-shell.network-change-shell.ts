import { boundedReceiver } from './wago-runtime-update-shell';
import { wagoShellFilesystemGuard } from './wago-shell-filesystem';
import { wagoRuntimeSupervisorLaunchShell } from './wago-runtime-supervisor';
import { quote } from "./wago-network-change-shell.quote";
import { networkChangeDeviceProgram } from "./wago-network-change-shell.network-change-device-program";

/** Parameters come from the helper's fixed header; the stream contains data only. */
export function networkChangeShell(action: 'apply' | 'ack' | 'release', testRoot = ''): string {
  return `(
set -eu
umask 077
root=${quote(testRoot)}
config="$root/etc/attraccess-wago"
data="$root/var/lib/attraccess-wago"
tx="$root/var/lib/attraccess-wago-network-transaction"
receipt="$root/var/lib/attraccess-wago-network-completed"
hook="$root/etc/rc.d/S99_zz_attraccess_wago"
fail() { echo "$*" >&2; exit 1; }
${wagoShellFilesystemGuard({ waitForLock: true, createConfiguration: false })}
wago_require_root_directory_or_alias "$root/var/lib" || fail 'Unsafe network journal parent'
test "$(cat "$root/etc/attraccess-wago-management/token")" = "$token" || fail 'Foreign management token'
case "$digest" in ''|*[!a-f0-9]*) exit 1 ;; esac
test "\${#digest}" = 64 || exit 1
for path in "$root/var/lib/attraccess-wago-update-transaction" "$root/var/lib/attraccess-wago-install-transaction" "$config/delivery" "$config/docker-provision"; do
  test ! -e "$path" && test ! -L "$path" || fail 'Runtime recovery or acceptance required'
done
for path in "$root/var/lib"/attraccess-wago-update-cleanup-*; do test ! -e "$path" && test ! -L "$path" || fail 'Runtime cleanup required'; done
require_journal() {
  test -d "$tx" && test ! -L "$tx" && test "$(stat -c '%u:%g:%a' "$tx")" = 0:0:700 || fail 'Unsafe network journal'
  for field in digest payload container.json ca-source; do
    test -f "$tx/$field" && test ! -L "$tx/$field" && test "$(stat -c '%u:%g:%a:%h' "$tx/$field")" = 0:0:600:1 || fail 'Unsafe network metadata'
  done
  test "$(cat "$tx/digest")" = "$digest" || fail 'Foreign network transaction'
  printf '%s  %s\\n' "$digest" "$tx/payload" | sha256sum -c - >/dev/null || fail 'MQTT payload checksum mismatch'
}
${
  action !== 'apply'
    ? `
${
  action === 'release'
    ? `
# The backend saved the replacement before requesting this release. A retry
# after the new apply began must retain its journal, even if recreation stopped
# between DELETE and CREATE. Unknown journals are never discarded.
case "$bytes" in ''|*[!a-f0-9]*) exit 1 ;; esac
test "\${#bytes}" = 64 && test "$bytes" != "$digest" || exit 1
if test -e "$tx" || test -L "$tx"; then
  test -d "$tx" && test ! -L "$tx" && test "$(stat -c '%u:%g:%a' "$tx")" = 0:0:700 || fail 'Unsafe network journal'
  test -f "$tx/digest" && test ! -L "$tx/digest" && test "$(stat -c '%u:%g:%a:%h' "$tx/digest")" = 0:0:600:1 && test "$(stat -c '%s' "$tx/digest")" -le 65 || fail 'Unsafe network digest'
  if test "$(cat "$tx/digest")" = "$bytes"; then
    digest="$bytes"; require_journal; printf 'OK\\n'; exit 0
  fi
fi
`
    : ''
}
if test ! -e "$tx" && test ! -L "$tx"; then
  test -f "$receipt" && test ! -L "$receipt" && test "$(stat -c '%u:%g:%a:%h' "$receipt")" = 0:0:600:1 && test "$(cat "$receipt")" = "$digest" || fail 'Network acknowledgement unavailable'
else
  require_journal
  next=$(mktemp "$root/var/lib/.attraccess-network-receipt.XXXXXX")
  printf '%s\\n' "$digest" > "$next"; sync; mv -f "$next" "$receipt"; sync
  rm -rf "$tx"; sync
fi
printf 'OK\\n'
`
    : `
case "$bytes" in ''|*[!0-9]*) exit 1 ;; esac
test "\${#bytes}" -le 5 && test "$bytes" -gt 0 && test "$bytes" -le 65536 || exit 1
docker() { timeout -k 5 45 docker --host unix:///var/run/docker.sock "$@"; }
if test ! -e "$tx" && test ! -L "$tx"; then
  stage=$(mktemp -d "$root/var/lib/attraccess-wago-network-stage.XXXXXX")
  trap 'rm -rf "$stage"' EXIT
  timeout -k 5 30 sh -c ${quote(boundedReceiver)} sh "$stage/payload" "$((bytes + 1))" "$wago_stat_mode" || fail 'MQTT payload transfer failed'
  test "$(stat -c '%s' "$stage/payload")" = "$bytes" || fail 'MQTT payload size mismatch'
  printf '%s  %s\\n' "$digest" "$stage/payload" | sha256sum -c - >/dev/null || fail 'MQTT payload checksum mismatch'
  docker inspect attraccess-wago > "$stage/container.json"
  printf '%s\\n' "$config/runtime-ca.pem" > "$stage/ca-source"
  printf '%s\\n' "$digest" > "$stage/digest"
  sync; mv "$stage" "$tx"; sync
  trap - EXIT
else
  # Consume and verify retries, never silently ignore changed credentials.
  stage=$(mktemp "$config/.network-retry.XXXXXX")
  trap 'rm -f "$stage"' EXIT
  timeout -k 5 30 sh -c ${quote(boundedReceiver)} sh "$stage" "$((bytes + 1))" "$wago_stat_mode" || fail 'MQTT payload transfer failed'
  test "$(stat -c '%s' "$stage")" = "$bytes" || fail 'MQTT payload size mismatch'
  printf '%s  %s\\n' "$digest" "$stage" | sha256sum -c - >/dev/null || fail 'MQTT payload checksum mismatch'
  rm -f "$stage"; trap - EXIT
fi
require_journal
test -d "$data" && test ! -L "$data" && test "$(stat -c '%u:%g:%a' "$data")" = 10001:10001:700 || fail 'Unsafe enrolled runtime state'
test -f "$config/runtime.env" && test ! -L "$config/runtime.env" && test "$(stat -c '%u:%g:%a:%h' "$config/runtime.env")" = 0:0:600:1 || fail 'Unsafe runtime environment'
test ! -L "$config/runtime-ca.pem" || fail 'Unsafe MQTT trust path'
# Disable supervisor starts before stopping. On interruption the durable journal
# and disabled runtime prevent a boot with partially changed broker settings.
rm -f "$config/runtime-enabled"
sync
if docker container ls -a --filter 'name=^/attraccess-wago$' --format '{{.ID}}' | grep -q .; then
  docker stop attraccess-wago >/dev/null
  test "$(docker inspect --format '{{.State.Running}}' attraccess-wago)" = false || fail 'Runtime stop unverified'
fi
# The journal captures the immutable image before any removal, including retries
# after an interruption between DELETE and CREATE.
if test ! -f "$tx/image-id"; then
  docker inspect --format '{{.Image}}' attraccess-wago > "$tx/image-id"; sync
fi
image_id=$(cat "$tx/image-id")
case "$image_id" in sha256:*) ;; *) fail 'Invalid runtime image' ;; esac
value=\${image_id#sha256:}; test "\${#value}" = 64 || fail 'Invalid runtime image'
case "$value" in *[!a-f0-9]*) fail 'Invalid runtime image' ;; esac
timeout -k 5 300 docker --host unix:///var/run/docker.sock run --rm -i --pull=never --network none --read-only --cap-drop ALL --cap-add CHOWN --cap-add DAC_OVERRIDE --user 0 --entrypoint node \
  -v "$tx:/transaction" -v "$config:/configuration" -v "$data:/data" -v /var/run/docker.sock:/var/run/docker.sock \
  "$image_id" - <<'ATTRACCESS_NETWORK_PROGRAM'
${networkChangeDeviceProgram}
ATTRACCESS_NETWORK_PROGRAM
sync
touch "$config/runtime-enabled"
sync
${wagoRuntimeSupervisorLaunchShell()}
test "$(docker inspect --format '{{.State.Running}}' attraccess-wago)" = true || fail 'Runtime start unverified'
printf 'OK\\n'
`
}
)`;
}
