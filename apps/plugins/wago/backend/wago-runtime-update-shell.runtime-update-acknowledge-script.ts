import { type Cc100HardwareProfile } from '../shared/hardware-profile';
import { preamble } from './wago-runtime-update-shell.preamble';

/** Cleanup follows durable server acknowledgement. Reclaim only the image
 * retired by this transaction, never images referenced by any container.
 */
export function runtimeUpdateAcknowledgeScript(
  token: string,
  profile: Cc100HardwareProfile,
  testRoot = '',
  helperParameters = false,
) {
  return `${preamble(token, profile, testRoot, helperParameters)}
if test -e "$cleanup" || test -L "$cleanup"; then
  test ! -e "$tx" && test ! -L "$tx" || fail 'Conflicting cleanup journal'
  test -d "$cleanup" && test ! -L "$cleanup" && test "$(stat -c '%u:%g:%a' "$cleanup")" = 0:0:700 || fail 'Unsafe update cleanup journal'
  rm -rf "$cleanup"
  sync
  exit 0
fi
if test ! -e "$tx" && test ! -L "$tx"; then exit 0; fi
require_transaction
case "$(cat "$tx/phase")" in
  accepted|accepted-cleaning)
    owned_new_container || fail 'Foreign runtime container'
    test "$(docker inspect --format '{{.Image}}' attraccess-wago)" = "$(cat "$tx/image-id")" || fail 'Accepted runtime image changed'
    phase accepted-cleaning
    previous=$(docker container ls -a --no-trunc --filter 'name=^/attraccess-wago.previous$' --format '{{.ID}}')
    if test -n "$previous"; then
      test "$previous" = "$(cat "$tx/previous-id")" || fail 'Foreign previous runtime'
      docker rm "$previous" >/dev/null
    fi
    retired_image=$(cat "$tx/previous-image-id") ;;
  restored)
    test "$(docker inspect --format '{{.Image}}' attraccess-wago)" = "$(cat "$tx/previous-image-id")" || fail 'Restored runtime image changed'
    retired_image=$(cat "$tx/image-id") ;;
  *) fail 'Update has not been accepted or restored' ;;
esac
# Keep the receipt until image cleanup succeeds. A crash after image removal is
# harmless: a successful inventory distinguishes an absent image from a failed
# Docker query. Never force removal or prune images outside this transaction.
retired_digest=\${retired_image#sha256:}
test "$retired_image" != "$retired_digest" && test "\${#retired_digest}" = 64 || fail 'Invalid retired image identity'
case "$retired_digest" in *[!a-f0-9]*) fail 'Invalid retired image identity' ;; esac
images=$(docker image ls --no-trunc --quiet) || fail 'Cannot inventory runtime images'
printf '%s\\n' "$images" | awk 'NF && ($0 !~ /^sha256:[a-f0-9]+$/ || length($0)!=71) {bad=1} END {exit bad}' || fail 'Invalid runtime image inventory'
if printf '%s\\n' "$images" | grep -Fxq "$retired_image"; then
  containers=$(docker container ls -a --no-trunc --format '{{.ID}}') || fail 'Cannot inventory runtime containers'
  referenced=0
  for container in $containers; do
    container_image=$(docker inspect --format '{{.Image}}' "$container") || fail 'Cannot inspect runtime image references'
    if test "$container_image" = "$retired_image"; then referenced=1; fi
  done
  # Stopped containers also retain their images. Docker enforces this again if
  # an unrelated workload appears after the reference inventory.
  if test "$referenced" = 0; then
    docker image rm "$retired_image" >/dev/null || fail 'Retired runtime image cleanup failed'
  fi
fi
mv "$tx" "$cleanup"
sync
rm -rf "$cleanup"
sync
`;
}
