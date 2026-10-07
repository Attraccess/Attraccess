import { type Cc100HardwareProfile } from '../shared/hardware-profile';
import { preamble } from "./wago-runtime-update-shell.preamble";

/** Cleanup is separate from acceptance/restoration and follows a durable server
 * acknowledgement. Never prune Docker images, unrelated containers or host files.
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
    phase accepted-cleaning
    previous=$(docker container ls -a --no-trunc --filter 'name=^/attraccess-wago.previous$' --format '{{.ID}}')
    if test -n "$previous"; then
      test "$previous" = "$(cat "$tx/previous-id")" || fail 'Foreign previous runtime'
      docker rm "$previous" >/dev/null
    fi ;;
  restored) ;;
  *) fail 'Update has not been accepted or restored' ;;
esac
mv "$tx" "$cleanup"
sync
rm -rf "$cleanup"
sync
`;
}
