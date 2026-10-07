import {
  wagoHardwareDeploymentDockerArgs,
  wagoHardwareDeploymentPreflightScript
} from './wago-hardware-deployment';
import { wagoRuntimeSupervisorLaunchShell } from './wago-runtime-supervisor';
import { type Cc100HardwareProfile } from '../shared/hardware-profile';
import { quote } from "./wago-runtime-update-shell.quote";
import { preamble } from "./wago-runtime-update-shell.preamble";

/** Preserve runtime.env, trust and enrolled state. Retain the old container and
 * checkpoint data only while stopped. No update path issues enrollment credentials.
 */
export function runtimeUpdateActivateScript(
  token: string,
  profile: Cc100HardwareProfile,
  testRoot = '',
  helperParameters = false,
) {
  const tokenValue = helperParameters ? '${token}' : token;
  const labelWord = helperParameters
    ? '"io.attraccess.wago.update-token=${token}"'
    : quote(`io.attraccess.wago.update-token=${token}`);
  return `${preamble(token, profile, testRoot, helperParameters)}
require_transaction
test "$(cat "$tx/phase")" = staged || fail 'Update is not staged'
require_atomic_state_paths
test "$(docker inspect --format '{{.Id}}' attraccess-wago)" = "$(cat "$tx/previous-id")" || fail 'Prior runtime changed'
${wagoHardwareDeploymentPreflightScript(testRoot, true, profile)}
docker() { timeout -k 5 45 docker --host unix:///var/run/docker.sock "$@"; }
# Reserve the full checkpoint and headroom on its actual target filesystem.
command -v du >/dev/null || fail 'Checkpoint sizing unavailable'
state_size=$(du -sk "$data" | awk 'NR==1 && $1 ~ /^[0-9]+$/ {print $1}')
free=$(df -Pk "$root/var/lib" | awk 'NR==2 && $4 ~ /^[0-9]+$/ {print $4}')
case "$state_size:$free" in *[!0-9:]*) fail 'Invalid checkpoint capacity' ;; esac
test -n "$state_size" && test -n "$free" && test "$free" -gt "$((state_size + 16384))" || fail 'Insufficient checkpoint storage'
phase stopping
rm -f "$config/runtime-enabled"
docker stop "$(cat "$tx/previous-id")" >/dev/null
test "$(docker inspect --format '{{.State.Running}}' "$(cat "$tx/previous-id")")" = false || fail 'Prior runtime did not stop'
timeout -k 5 300 cp -a "$data" "$tx/state.previous"
phase checkpointed
docker rename "$(cat "$tx/previous-id")" attraccess-wago.previous
# Hook and mounts belong to the deployed build too. Publish on its destination
# filesystem, retaining the previous hook until server acknowledgement.
hook_stage="$root/etc/rc.d/.attraccess-wago-hook-${tokenValue}"
test ! -e "$hook_stage" && test ! -L "$hook_stage" || fail 'Runtime hook publication recovery required'
cp "$tx/hook.next" "$hook_stage"
chmod 0700 "$hook_stage"
sync
mv "$hook_stage" "$hook"
sync
phase starting
${wagoHardwareDeploymentPreflightScript(testRoot, true, profile)}
docker() { timeout -k 5 45 docker --host unix:///var/run/docker.sock "$@"; }
set --
if test -f "$config/runtime-ca.pem"; then set -- -v "$config/runtime-ca.pem:/var/lib/attraccess-wago/mqtt-ca.pem:ro"; fi
docker run -d --pull=never --name attraccess-wago --restart no --env-file "$config/runtime.env" --label ${labelWord} --env "WAGO_RUNTIME_IMAGE_ID=$(cat "$tx/image-id")" ${wagoHardwareDeploymentDockerArgs(testRoot, profile)} -v "$data:/var/lib/attraccess-wago" "$@" "$(cat "$tx/image-id")"
phase verifying
touch "$config/runtime-enabled"
${wagoRuntimeSupervisorLaunchShell()}
echo 'Runtime update started; permanent heartbeat and readiness unverified'
`;
}
