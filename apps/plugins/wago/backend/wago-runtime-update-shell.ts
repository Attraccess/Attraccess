import type { BuildRuntimeArtifact } from './wago-build-runtime';
import {
  wagoHardwareDeploymentDockerArgs,
  wagoHardwareDeploymentPreflightScript,
  wagoRuntimeBootScript,
} from './wago-hardware-deployment';
import { runtimeBundleCapacityPreflightScript } from './wago-runtime-install';
import { wagoShellFilesystemGuard } from './wago-shell-filesystem';
import { wagoRuntimeSupervisorLaunchShell } from './wago-runtime-supervisor';
import { isCc100HardwareProfile, type Cc100HardwareProfile } from '../shared/hardware-profile';

const quote = (text: string) => `'${text.replaceAll("'", "'\\''")}'`;
const imageIdPattern = /^sha256:[a-f0-9]{64}$/;

/** These server-generated scripts are a separate state-preserving transaction.
 * They are not the destructive commissioning delivery/recovery scripts. A future
 * qualified management helper must expose only these fixed operations, never a
 * management-account arbitrary sudo executor.
 */
function preamble(token: string, profile: Cc100HardwareProfile, testRoot: string) {
  if (!/^[a-f0-9]{32}$/.test(token) || !isCc100HardwareProfile(profile)) throw new Error('Invalid update ownership');
  if (testRoot && (!testRoot.startsWith('/') || testRoot === '/' || /[\n,]/.test(testRoot)))
    throw new Error('Invalid isolated root');
  return `set -eu
umask 077
root=${quote(testRoot)}
config="$root/etc/attraccess-wago"
hook="$root/etc/rc.d/S99_zz_attraccess_wago"
data="$root/var/lib/attraccess-wago"
tx="$root/var/lib/attraccess-wago-update-transaction"
cleanup="$root/var/lib/attraccess-wago-update-cleanup-${token}"
unset DOCKER_HOST DOCKER_CONTEXT DOCKER_TLS_VERIFY DOCKER_CERT_PATH
docker() { timeout -k 5 45 docker --host unix:///var/run/docker.sock "$@"; }
fail() { echo "$*" >&2; exit 1; }
${wagoShellFilesystemGuard()}
wago_require_root_directory_or_alias "$root/var/lib" || fail 'Unsafe state parent'
for path in "$config/delivery" "$config/docker-provision" "$config/runtime.env.next" "$config/runtime-ca.pem.next" "$root/var/lib/attraccess-wago-install-transaction" "$root/var/lib/attraccess-wago-install-transaction.restored" "$root/var/lib/attraccess-wago-install-transaction.cleanup" "$root/var/lib/attraccess-wago-install-transaction.accepted-cleanup"; do
  test ! -e "$path" && test ! -L "$path" || fail 'Commissioning recovery or acceptance required'
done
require_transaction() {
  test -d "$tx" && test ! -L "$tx" && test "$(stat -c '%u:%g:%a' "$tx")" = 0:0:700 || fail 'Unsafe update journal'
  for field in token profile phase image-id previous-id previous-image-id; do
    test -f "$tx/$field" && test ! -L "$tx/$field" && test "$(stat -c '%u:%g:%a:%h' "$tx/$field")" = 0:0:600:1 || fail 'Unsafe update metadata'
  done
  test "$(cat "$tx/token")" = ${quote(token)} && test "$(cat "$tx/profile")" = ${quote(profile)} || fail 'Foreign update transaction'
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
  test "$(docker inspect --format '{{index .Config.Labels "io.attraccess.wago.update-token"}}' attraccess-wago)" = ${quote(token)}
}
`;
}

/** Bounded binary receiver. Load and verify the image before stopping the prior
 * runtime. A truncated stream, failed load or wrong config digest cannot activate.
 */
export function runtimeUpdateStageScript(artifact: BuildRuntimeArtifact, token: string, testRoot = '') {
  if (
    !imageIdPattern.test(artifact.imageId) ||
    !/^[a-f0-9]{64}$/.test(artifact.digest) ||
    !Number.isSafeInteger(artifact.bytes) ||
    artifact.bytes < 1 ||
    artifact.bytes > 512 * 1024 * 1024 ||
    !/^ghcr\.io\/attraccess\/wago-cc100-runtime(?::[A-Za-z0-9_.-]+)?@sha256:[a-f0-9]{64}$/.test(artifact.image)
  ) {
    throw new Error('Invalid update artifact');
  }
  const profile = artifact.manifest.hardware.profile;
  return `${preamble(token, profile, testRoot)}
${runtimeBundleCapacityPreflightScript(artifact.bytes, testRoot)}
# Update peaks differ from commissioning: both retained archives are on the
# journal filesystem. Add the Docker reserve there only when it shares st_dev.
journal_identity=$(stat -Lc '%d:%i' "$root/var/lib")
docker_identity=$(stat -Lc '%d:%i' "$docker_root")
journal_free=$(df -Pk "$root/var/lib" | awk 'NR==2 && $4 ~ /^[0-9]+$/ {print $4}')
case "$journal_free" in ''|*[!0-9]*) fail 'Invalid journal storage capacity' ;; esac
journal_required=${2 * Math.ceil(artifact.bytes / 1024) + 16384}
if test "\${journal_identity%%:*}" = "\${docker_identity%%:*}"; then journal_required=$((journal_required + ${3 * Math.ceil(artifact.bytes / 1024)})); fi
test "$journal_free" -ge "$journal_required" || fail 'Insufficient update journal storage'
${wagoHardwareDeploymentPreflightScript(testRoot, true, profile)}
docker() { timeout -k 5 45 docker --host unix:///var/run/docker.sock "$@"; }
command -v head >/dev/null && command -v sync >/dev/null || fail 'Bounded update tools unavailable'
test ! -e "$tx" && test ! -L "$tx" || fail 'Update recovery or acknowledgement required'
for pending in "$root/var/lib"/attraccess-wago-update-cleanup-*; do test ! -e "$pending" && test ! -L "$pending" || fail 'Update cleanup acknowledgement required'; done
test -f "$config/runtime.env" && test ! -L "$config/runtime.env" && test "$(stat -c '%u:%g:%a:%h' "$config/runtime.env")" = 0:0:600:1 || fail 'Unsafe enrolled runtime environment'
wago_require_root_directory "$root/etc/rc.d" || fail 'Unsafe runtime hook parent'
test -f "$hook" && test ! -L "$hook" && test "$(stat -c '%u:%g:%a:%h' "$hook")" = 0:0:700:1 || fail 'Unsafe installed runtime hook'
test -d "$data" && test ! -L "$data" && test "$(stat -c '%u:%g:%a' "$data")" = 10001:10001:700 || fail 'Unsafe enrolled runtime state'
require_atomic_state_paths
test "$(docker inspect --format '{{.HostConfig.RestartPolicy.Name}}' attraccess-wago)" = no || fail 'Runtime must use the owned supervisor'
test "$(docker inspect --format '{{.State.Running}}' attraccess-wago)" = true || fail 'Prior runtime is not running'
prior=$(docker inspect --format '{{.Id}}' attraccess-wago)
case "$prior" in ''|*[!a-f0-9]*) fail 'Invalid prior container identity' ;; esac
test "\${#prior}" = 64 || fail 'Invalid prior container identity'
test -z "$(docker container ls -a --filter 'name=^/attraccess-wago.previous$' --format '{{.ID}}')" || fail 'Unowned previous runtime exists'
stage=$(mktemp -d "$root/var/lib/attraccess-wago-update-stage.XXXXXX")
trap 'rm -rf "$stage"' EXIT
printf '%s\\n' ${quote(token)} > "$stage/token"
printf '%s\\n' ${quote(profile)} > "$stage/profile"
printf '%s\\n' ${quote(artifact.imageId)} > "$stage/image-id"
printf '%s\\n' "$prior" > "$stage/previous-id"
previous_image=$(docker inspect --format '{{.Image}}' "$prior")
case "$previous_image" in sha256:*) ;; *) fail 'Invalid prior runtime image identity' ;; esac
previous_digest=\${previous_image#sha256:}
case "$previous_digest" in ''|*[!a-f0-9]*) fail 'Invalid prior runtime image identity' ;; esac
test "\${#previous_digest}" = 64 || fail 'Invalid prior runtime image identity'
printf '%s\\n' "$previous_image" > "$stage/previous-image-id"
cp "$hook" "$stage/hook.previous"
chmod 0700 "$stage/hook.previous"
printf '%s' ${quote(Buffer.from(wagoRuntimeBootScript(testRoot, profile)).toString('base64'))} | base64 -d > "$stage/hook.next"
chmod 0700 "$stage/hook.next"
printf '%s\\n' receiving > "$stage/phase"
sync
mv "$stage" "$tx"
sync
trap - EXIT
# At most B+1 bytes may reach disk, even if a trusted server stream malfunctions.
timeout -k 5 300 head -c ${artifact.bytes + 1} > "$tx/bundle.tar"
test "$(wc -c < "$tx/bundle.tar" | tr -d ' ')" = ${artifact.bytes} || fail 'Incomplete or oversized runtime transfer'
printf '%s  %s\\n' ${quote(artifact.digest)} "$tx/bundle.tar" | sha256sum -c - >/dev/null || fail 'Runtime checksum mismatch'
tar --warning=no-timestamp --warning=no-unknown-keyword -xOf "$tx/bundle.tar" image-reference > "$tx/reference"
test "$(cat "$tx/reference")" = ${quote(artifact.image)} || fail 'Runtime reference mismatch'
tar --warning=no-timestamp --warning=no-unknown-keyword -xOf "$tx/bundle.tar" image.tar > "$tx/image.tar"
timeout -k 5 300 docker --host unix:///var/run/docker.sock load -i "$tx/image.tar" > "$tx/load-output" || fail 'Runtime load failed'
sed -n -e 's/^Loaded image: //p' -e 's/^Loaded image ID: //p' "$tx/load-output" > "$tx/loaded-image"
test "$(wc -l < "$tx/loaded-image" | tr -d ' ')" = 1 || fail 'Expected one runtime image'
test "$(docker image inspect --format '{{.Id}}' "$(cat "$tx/loaded-image")")" = ${quote(artifact.imageId)} || fail 'Loaded image identity mismatch'
test "$(docker image inspect --format '{{.Os}}/{{.Architecture}}/{{.Variant}}' ${quote(artifact.imageId)})" = linux/arm/v7 || fail 'Incompatible runtime platform'
phase staged
`;
}

/** Preserve runtime.env, trust and enrolled state. Retain the old container and
 * checkpoint data only while stopped. No update path issues enrollment credentials.
 */
export function runtimeUpdateActivateScript(token: string, profile: Cc100HardwareProfile, testRoot = '') {
  return `${preamble(token, profile, testRoot)}
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
hook_stage="$root/etc/rc.d/.attraccess-wago-hook-${token}"
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
docker run -d --pull=never --name attraccess-wago --restart no --env-file "$config/runtime.env" --label ${quote(`io.attraccess.wago.update-token=${token}`)} --env "WAGO_RUNTIME_IMAGE_ID=$(cat "$tx/image-id")" ${wagoHardwareDeploymentDockerArgs(testRoot, profile)} -v "$data:/var/lib/attraccess-wago" "$@" "$(cat "$tx/image-id")"
phase verifying
touch "$config/runtime-enabled"
${wagoRuntimeSupervisorLaunchShell()}
echo 'Runtime update started; permanent heartbeat and readiness unverified'
`;
}

export function runtimeUpdateAcceptScript(token: string, profile: Cc100HardwareProfile, testRoot = '') {
  return `${preamble(token, profile, testRoot)}
require_transaction
case "$(cat "$tx/phase")" in verifying|accepted) ;; *) fail 'Update is not ready for acceptance' ;; esac
owned_new_container || fail 'Foreign runtime container'
test "$(docker inspect --format '{{.State.Running}}' attraccess-wago)" = true || fail 'Runtime is not running'
test "$(docker inspect --format '{{.Image}}' attraccess-wago)" = "$(cat "$tx/image-id")" || fail 'Runtime image mismatch'
phase accepted
`;
}

export function runtimeUpdateRollbackScript(
  token: string,
  profile: Cc100HardwareProfile,
  previousImageId: string,
  testRoot = '',
) {
  if (!imageIdPattern.test(previousImageId)) throw new Error('Invalid prior runtime image identity');
  return `${preamble(token, profile, testRoot)}
if test ! -e "$tx" && test ! -L "$tx"; then
  # Admission may fail before a journal exists. Absence alone proves nothing:
  # require the expected unchanged predecessor and the full host safety gate.
  for pending in "$root/var/lib"/attraccess-wago-update-cleanup-*; do test ! -e "$pending" && test ! -L "$pending" || fail 'Update cleanup acknowledgement required'; done
  test "$(docker inspect --format '{{.Image}}' attraccess-wago)" = ${quote(previousImageId)} || fail 'No journal and prior image is not current'
  test "$(docker inspect --format '{{.State.Running}}' attraccess-wago)" = true || fail 'No journal and prior runtime is not running'
  ${wagoHardwareDeploymentPreflightScript(testRoot, true, profile)}
  echo 'Prior runtime unchanged; no update journal'
  exit 0
fi
require_transaction
test "$(cat "$tx/previous-image-id")" = ${quote(previousImageId)} || fail 'Prior image does not match recovery intent'
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
    hook_stage="$root/etc/rc.d/.attraccess-wago-hook-${token}"
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

/** Cleanup is separate from acceptance/restoration and follows a durable server
 * acknowledgement. Never prune Docker images, unrelated containers or host files.
 */
export function runtimeUpdateAcknowledgeScript(token: string, profile: Cc100HardwareProfile, testRoot = '') {
  return `${preamble(token, profile, testRoot)}
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
