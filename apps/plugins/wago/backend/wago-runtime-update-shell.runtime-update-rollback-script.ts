import { wagoHardwareDeploymentPreflightScript } from './wago-hardware-deployment';
import { wagoRuntimeSupervisorLaunchShell } from './wago-runtime-supervisor';
import { type Cc100HardwareProfile } from '../shared/hardware-profile';
import { imageIdPattern } from './wago-runtime-update-shell.image-id-pattern';
import { quote } from './wago-runtime-update-shell.quote';
import { preamble } from './wago-runtime-update-shell.preamble';

export function runtimeUpdateRollbackScript(
  token: string,
  profile: Cc100HardwareProfile,
  previousImageId: string,
  testRoot = '',
  helperParameters = false,
) {
  if (!imageIdPattern.test(previousImageId)) throw new Error('Invalid prior runtime image identity');
  const tokenValue = helperParameters ? '${token}' : token;
  const previousWord = helperParameters ? '"${previous}"' : quote(previousImageId);
  return `${preamble(token, profile, testRoot, helperParameters)}
if test ! -e "$tx" && test ! -L "$tx"; then
  # Admission may fail before a journal exists. Absence alone proves nothing:
  # require the expected unchanged predecessor and the full host safety gate.
  for pending in "$root/var/lib"/attraccess-wago-update-cleanup-*; do test ! -e "$pending" && test ! -L "$pending" || fail 'Update cleanup acknowledgement required'; done
   test "$(docker inspect --format '{{.Image}}' attraccess-wago)" = ${previousWord} || fail 'No journal and prior image is not current'
  test "$(docker inspect --format '{{.State.Running}}' attraccess-wago)" = true || fail 'No journal and prior runtime is not running'
  ${wagoHardwareDeploymentPreflightScript(testRoot, true, profile)}
  echo 'Prior runtime unchanged; no update journal'
  exit 0
fi
require_transaction
test "$(cat "$tx/previous-image-id")" = ${previousWord} || fail 'Prior image does not match recovery intent'
require_atomic_state_paths
case "$(cat "$tx/phase")" in
  receiving|staged|stopping) phase restored; touch "$config/runtime-enabled" ;;
  restored) ;;
  checkpointed|starting|verifying|accepted|recovering)
    phase recovering
    rm -f "$config/runtime-enabled"
    new_id=$(docker container ls -a --no-trunc --filter 'name=^/attraccess-wago$' --format '{{.ID}}')
    if test -n "$new_id"; then
      if test "$new_id" = "$(cat "$tx/previous-id")"; then :;
      else owned_new_container || fail 'Foreign runtime blocks recovery'; docker rm -f "$new_id" >/dev/null; fi
    fi
    # Move the checkpoint, never recursively copy back into potentially hostile
    # runtime-written paths. A retained moved checkpoint makes restart idempotent.
    if test -d "$tx/state.previous" && test ! -L "$tx/state.previous"; then
      if test -e "$data" || test -L "$data"; then
        test ! -e "$tx/state.failed" && test ! -L "$tx/state.failed" || fail 'State restoration already in progress'
        mv "$data" "$tx/state.failed"
      fi
      mv "$tx/state.previous" "$data"
    fi
    test -f "$tx/hook.previous" && test ! -L "$tx/hook.previous" && test "$(stat -c '%u:%g:%a:%h' "$tx/hook.previous")" = 0:0:700:1 || fail 'Prior runtime hook unavailable'
    wago_require_root_directory "$root/etc/rc.d" || fail 'Unsafe runtime hook parent'
    hook_stage="$root/etc/rc.d/.attraccess-wago-hook-${tokenValue}"
    if test -e "$hook_stage" || test -L "$hook_stage"; then
      test -f "$hook_stage" && test ! -L "$hook_stage" && test "$(stat -c '%u:%g:%a:%h' "$hook_stage")" = 0:0:700:1 || fail 'Unsafe staged runtime hook'
      rm -f "$hook_stage"
    fi
    cp "$tx/hook.previous" "$hook_stage"
    chmod 0700 "$hook_stage"
    sync
    mv "$hook_stage" "$hook"
    sync
    test "$(docker inspect --format '{{.Id}}' "$(cat "$tx/previous-id")")" = "$(cat "$tx/previous-id")" || fail 'Prior runtime unavailable'
    prior_name=$(docker inspect --format '{{.Name}}' "$(cat "$tx/previous-id")")
    case "$prior_name" in /attraccess-wago.previous) docker rename "$(cat "$tx/previous-id")" attraccess-wago ;; /attraccess-wago) ;; *) fail 'Prior runtime ownership changed' ;; esac
    phase restored ;;
  *) fail 'Invalid update recovery phase' ;;
esac
${wagoHardwareDeploymentPreflightScript(testRoot, true, profile)}
docker() { timeout -k 5 45 docker --host unix:///var/run/docker.sock "$@"; }
test "$(docker inspect --format '{{.Id}}' attraccess-wago)" = "$(cat "$tx/previous-id")" || fail 'Restored runtime identity mismatch'
docker start "$(cat "$tx/previous-id")" >/dev/null
touch "$config/runtime-enabled"
${wagoRuntimeSupervisorLaunchShell()}
echo 'Prior runtime restored; update receipt retained'
`;
}
