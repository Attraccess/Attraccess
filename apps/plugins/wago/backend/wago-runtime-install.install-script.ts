import { wagoHardwareDeploymentDockerArgs, wagoHardwareDeploymentPreflightScript } from './wago-hardware-deployment';
import { wagoRuntimeSupervisorLaunchShell } from './wago-runtime-supervisor';
import { CC100_DIGITAL_PROFILE_ID, type Cc100HardwareProfile } from '../shared/hardware-profile';
import { preamble } from './wago-runtime-install.preamble';
import { boundedDocker } from './wago-runtime-install.bounded-docker.helpers';
import { quote } from './wago-runtime-install.bounded-docker.helpers';

export function installScript(
  image: string,
  testRoot: string,
  locked = false,
  profile: Cc100HardwareProfile = CC100_DIGITAL_PROFILE_ID,
): string {
  if (!/^\S+@sha256:[a-f0-9]{64}$/i.test(image)) throw new Error('Runtime image must be digest-pinned');
  return `${preamble(testRoot, locked)}
test ! -e "$tx" && test ! -e "$cleanup" && test ! -e "$receipt" && test ! -e "$acceptedCleanup" || fail 'Runtime transaction exists; recover or accept it before retrying'
test -s "$config/runtime.env.next" && test ! -L "$config/runtime.env.next" || fail 'Missing staged runtime.env.next'
test ! -L "$data" && test ! -L "$config/runtime.env" && test ! -L "$config/runtime-ca.pem" || fail 'Runtime paths must not be symlinks'
test -x "$root/etc/rc.d/S99_zz_attraccess_wago" && test ! -L "$root/etc/rc.d/S99_zz_attraccess_wago" || fail 'Controller preparation required'
test "$(stat -c '%u:%g:%a:%h' "$root/etc/rc.d/S99_zz_attraccess_wago")" = 0:0:700:1 || fail 'Unsafe controller boot hook'
command -v nohup >/dev/null || fail 'Runtime supervisor launch tool unavailable'
if [ -e "$config/docker-provision" ]; then
  test -f "$config/docker-provision/started" && test ! -e "$config/docker-provision/restored" || fail 'Docker provisioning recovery required'
  test -f "$config/delivery/token" && test "$(cat "$config/docker-provision/token")" = "$(cat "$config/delivery/token")" || fail 'Docker provisioning belongs to another delivery'
fi
${wagoHardwareDeploymentPreflightScript(testRoot, true, profile)}
${boundedDocker()}
docker container ls -a --no-trunc --format '{{.ID}} {{.Names}}' > "$config/containers.next"
stage=$(mktemp -d "$root/var/lib/attraccess-wago-install-stage.XXXXXX")
trap 'rm -rf "$stage"' EXIT
trap 'exit 130' HUP INT TERM
printf '%s\\n' destructive > "$stage/mode"
if [ -e "$config/delivery/token" ]; then
  test -f "$config/delivery/token" && test ! -L "$config/delivery/token" || fail 'Invalid delivery ownership token'
  cp "$config/delivery/token" "$stage/token"
  chmod 0600 "$stage/token"
fi
touch "$stage/preparing"
mv "$stage" "$tx"
trap - EXIT HUP INT TERM
trap 'code=$?; trap - EXIT; if [ "$code" -ne 0 ]; then if ! rollback; then echo "Cleanup incomplete; recovery journal retained" >&2; fi; fi; exit "$code"' EXIT
trap 'trap - EXIT; echo "Interrupted; recovery journal retained" >&2; exit 130' HUP INT TERM
mkdir "$tx/bundle"
# Stream only the two expected members into regular files; never unpack archive
# paths, links, permissions or device nodes into the controller filesystem.
tar --warning=no-timestamp --warning=no-unknown-keyword -xOf "$root/tmp/attraccess-wago-runtime.tar" image-reference > "$tx/bundle/image-reference"
test "$(cat "$tx/bundle/image-reference")" = ${quote(image)} || fail 'Runtime image reference mismatch'
tar --warning=no-timestamp --warning=no-unknown-keyword -xOf "$root/tmp/attraccess-wago-runtime.tar" image.tar > "$tx/bundle/image.tar"
test -s "$tx/bundle/image.tar" || fail 'Empty runtime image archive'
awk '$2 == "attraccess-wago" || $2 == "attraccess-wago.previous" { print $1 }' "$config/containers.next" > "$tx/old-id"
touch "$tx/prepared"
rm -f "$tx/preparing"
rm -f "$config/runtime-enabled"
for old_id in $(cat "$tx/old-id"); do
  remove_owned_container "$old_id" || fail 'Previous owned runtime containment failed'
done
# No prior-workload snapshots: these fixed owned paths are replaced only after
  # the verified bundle is staged and the predecessor is stopped and removed.
touch "$tx/data-changing"
rm -rf "$data"
mkdir -m 0700 "$data"
chown 10001:10001 "$data"
touch "$tx/ca-changing"
rm -f "$config/runtime-ca.pem"
if [ -e "$config/runtime-ca.pem.next" ]; then
  test -f "$config/runtime-ca.pem.next" && test ! -L "$config/runtime-ca.pem.next" || fail 'Invalid staged CA'
  mv "$config/runtime-ca.pem.next" "$config/runtime-ca.pem"
  chmod 0444 "$config/runtime-ca.pem"
fi
touch "$tx/env-changing"
rm -f "$config/runtime.env.previous"
mv "$config/runtime.env.next" "$config/runtime.env"
chmod 0600 "$config/runtime.env"
# FW31 takes over 45s to decompress/import even a cached runtime image. Give
# import its own bounded budget; ordinary Docker queries keep their short limit.
# Do not pipe docker load into sed: POSIX sh would hide a failing load exit code.
timeout -k 5 300 docker --host unix:///var/run/docker.sock load -i "$tx/bundle/image.tar" > "$tx/load-output" || fail 'Runtime image load failed or exceeded 300 seconds'
sed -n -e 's/^Loaded image: //p' -e 's/^Loaded image ID: //p' "$tx/load-output" > "$tx/loaded-image"
test "$(wc -l < "$tx/loaded-image" | tr -d ' ')" = 1 || fail 'Expected exactly one loaded image'
runtime_image=$(cat "$tx/loaded-image")
test -n "$runtime_image"
docker image inspect "$runtime_image" >/dev/null
touch "$tx/new-container"
# The parent of the host CA is root-owned and private. A nested read-only bind
# prevents the runtime from unlinking/replacing trust via its writable data mount.
# This stable source survives acceptance.
set --
if [ -f "$config/runtime-ca.pem" ]; then
  set -- -v "$config/runtime-ca.pem:/var/lib/attraccess-wago/mqtt-ca.pem:ro"
fi
${wagoHardwareDeploymentPreflightScript(testRoot, true, profile)}
${boundedDocker()}
# Every subsequent start must pass the host gate again. Docker's own restart
# manager cannot run that gate and must never restart a physical I/O writer.
docker run -d --pull=never --name attraccess-wago --restart no --env-file "$config/runtime.env" ${wagoHardwareDeploymentDockerArgs(testRoot, profile)} -v "$data:/var/lib/attraccess-wago" "$@" "$runtime_image"
touch "$tx/started"
touch "$config/runtime-enabled"
${wagoRuntimeSupervisorLaunchShell()}
trap - EXIT HUP INT TERM
echo 'Runtime container started; readiness unverified; recovery journal retained'
`;
}
