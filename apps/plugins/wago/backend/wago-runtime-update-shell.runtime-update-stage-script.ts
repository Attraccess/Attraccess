import type { BuildRuntimeArtifact } from './wago-build-runtime';
import {
  wagoHardwareDeploymentPreflightScript,
  wagoRuntimeBootScript,
} from './wago-hardware-deployment';
import { runtimeUpdateCapacityPreflightScript } from './wago-runtime-install';
import { imageIdPattern } from "./wago-runtime-update-shell.image-id-pattern";
import { quote } from "./wago-runtime-update-shell.quote";
import { preamble } from "./wago-runtime-update-shell.preamble";
import { boundedReceiver } from "./wago-runtime-update-shell.bounded-receiver";

/** Bounded binary receiver. Load and verify the image before stopping the prior
 * runtime. A truncated stream, failed load or wrong config digest cannot activate.
 */
export function runtimeUpdateStageScript(
  artifact: BuildRuntimeArtifact,
  token: string,
  testRoot = '',
  helperParameters = false,
) {
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
  const tokenWord = helperParameters ? '"${token}"' : quote(token);
  const digestWord = helperParameters ? '"${digest}"' : quote(artifact.digest);
  const imageWord = helperParameters ? '"${image}"' : quote(artifact.imageId);
  const referenceWord = helperParameters ? '"${reference}"' : quote(artifact.image);
  return `${preamble(token, profile, testRoot, helperParameters)}
${runtimeUpdateCapacityPreflightScript(artifact.bytes, testRoot, helperParameters)}
${wagoHardwareDeploymentPreflightScript(testRoot, true, profile)}
docker() { timeout -k 5 45 docker --host unix:///var/run/docker.sock "$@"; }
command -v sync >/dev/null && command -v mkfifo >/dev/null || fail 'Bounded update tools unavailable'
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
printf '%s\\n' ${tokenWord} > "$stage/token"
printf '%s\\n' ${quote(profile)} > "$stage/profile"
printf '%s\\n' ${imageWord} > "$stage/image-id"
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
if timeout -k 5 300 sh -c ${quote(boundedReceiver)} sh "$tx/bundle.tar" ${helperParameters ? '"$((bytes + 1))"' : artifact.bytes + 1} "$wago_stat_mode"; then :;
else
  case "$?" in 124|137|143) fail 'Runtime transfer receiver timed out' ;; *) fail 'Runtime transfer receiver failed' ;; esac
fi
test "$(stat -c '%s' "$tx/bundle.tar")" = ${helperParameters ? '"$bytes"' : artifact.bytes} || fail 'Incomplete or oversized runtime transfer'
printf '%s  %s\\n' ${digestWord} "$tx/bundle.tar" | sha256sum -c - >/dev/null || fail 'Runtime checksum mismatch'
tar --warning=no-timestamp --warning=no-unknown-keyword -xOf "$tx/bundle.tar" image-reference > "$tx/reference"
test "$(cat "$tx/reference")" = ${referenceWord} || fail 'Runtime reference mismatch'
# A FIFO avoids retaining a second full archive. Check both processes: a failed
# tar must never be hidden by Docker successfully consuming a partial stream.
mkfifo -m 0600 "$tx/image.pipe"
timeout -k 5 300 tar --warning=no-timestamp --warning=no-unknown-keyword -xOf "$tx/bundle.tar" image.tar > "$tx/image.pipe" &
extractor=$!
trap 'kill "$extractor" 2>/dev/null || :; wait "$extractor" 2>/dev/null || :; rm -f "$tx/image.pipe"' EXIT
if timeout -k 5 300 docker --host unix:///var/run/docker.sock load < "$tx/image.pipe" > "$tx/load-output"; then loaded=1; else loaded=0; fi
if wait "$extractor"; then extracted=1; else extracted=0; fi
trap - EXIT
rm -f "$tx/image.pipe"
test "$loaded:$extracted" = 1:1 || fail 'Runtime load failed'
sed -n -e 's/^Loaded image: //p' -e 's/^Loaded image ID: //p' "$tx/load-output" > "$tx/loaded-image"
test "$(wc -l < "$tx/loaded-image" | tr -d ' ')" = 1 || fail 'Expected one runtime image'
test "$(docker image inspect --format '{{.Id}}' "$(cat "$tx/loaded-image")")" = ${imageWord} || fail 'Loaded image identity mismatch'
test "$(docker image inspect --format '{{.Os}}/{{.Architecture}}/{{.Variant}}' ${imageWord})" = linux/arm/v7 || fail 'Incompatible runtime platform'
# Neither archive is needed for rollback, which retains the previous container,
# hook and stopped-state checkpoint. Reclaim only this token-owned upload.
rm -f "$tx/bundle.tar"
phase staged
`;
}
