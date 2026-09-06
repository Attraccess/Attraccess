import { wagoHardwareDeploymentDockerArgs, wagoHardwareDeploymentPreflightScript } from './wago-hardware-deployment';
import { wagoShellFilesystemGuard } from './wago-shell-filesystem';
import { wagoRuntimeSupervisorLaunchShell } from './wago-runtime-supervisor';

/**
 * The caller must authenticate the bundle signature/checksum before uploading it
 * to /tmp/attraccess-wago-runtime.tar over pinned SSH. This script checks the
 * embedded reference, not the signature (the controller has no signing key).
 *
 * Stage runtime.env.next atomically, mode 0600, under the same install.lock
 * flock used here; refuse staging while install-transaction or runtime.env.next
 * exists. Never write runtime.env directly. Bundle uploads must also be serialized
 * with staging/install. Keep the lock file: unlinking it defeats flock.
 *
 * A successful start retains ownership for explicit recovery or acceptance after
 * coordinator readiness checks. Recovery stops/removes the failed new runtime;
 * destructive commissioning never restores old workloads or revoked credentials.
 * testRoot is only for isolated shell fixtures; production callers must omit it.
 */
export function runtimeBundleInstallScript(image: string, testRoot = ''): string {
  return installScript(image, testRoot);
}

function installScript(image: string, testRoot: string, locked = false): string {
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
${wagoHardwareDeploymentPreflightScript(testRoot)}
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
# the signed bundle is staged and the predecessor is stopped and removed.
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
# Do not pipe docker load into sed: POSIX sh would hide a failing load exit code.
docker load -i "$tx/bundle/image.tar" > "$tx/load-output"
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
${wagoHardwareDeploymentPreflightScript(testRoot)}
${boundedDocker()}
# Every subsequent start must pass the host gate again. Docker's own restart
# manager cannot run that gate and must never restart a physical I/O writer.
docker run -d --pull=never --name attraccess-wago --restart no --env-file "$config/runtime.env" ${wagoHardwareDeploymentDockerArgs(testRoot)} -v "$data:/var/lib/attraccess-wago" "$@" "$runtime_image"
touch "$tx/started"
touch "$config/runtime-enabled"
${wagoRuntimeSupervisorLaunchShell()}
trap - EXIT HUP INT TERM
echo 'Runtime container started; readiness unverified; recovery journal retained'
`;
}

/** Stop and remove the failed owned runtime without restoring previous workloads. */
export function runtimeBundleRecoveryScript(testRoot = '', token?: string): string {
  if (token && !/^[a-f0-9]{32}$/.test(token)) throw new Error('Invalid delivery token');
  return `${preamble(testRoot)}
test ! -e "$acceptedCleanup" || fail 'Acceptance cleanup is pending; recovery is unavailable'
${
  token
    ? `if test ! -e "$tx" && test ! -e "$receipt" && test ! -e "$cleanup" && test ! -e "$config/delivery"; then
  preparation="$config/docker-provision"
  if test ! -e "$preparation"; then
    preparation="$config/docker-provision.completed-${token}"
    test -f "$preparation/restored" && test ! -L "$preparation/restored" || fail 'No preparation recovery ownership'
  fi
  test -d "$preparation" && test ! -L "$preparation" &&
    test -f "$preparation/token" && test ! -L "$preparation/token" && test "$(cat "$preparation/token")" = ${quote(token)} &&
    test -f "$preparation/mode" && test ! -L "$preparation/mode" && test "$(cat "$preparation/mode")" = destructive || fail 'No preparation recovery ownership'
  test ! -e "$config/runtime.env.next" && test ! -e "$config/runtime-ca.pem.next" || fail 'Unowned staged runtime configuration'
  stage=$(mktemp -d "$root/var/lib/attraccess-wago-recovery-stage.XXXXXX")
  trap 'rm -rf "$stage"' EXIT
  trap 'exit 130' HUP INT TERM
  printf '%s\\n' ${quote(token)} > "$stage/token"
  mv "$stage" "$receipt"
  trap - EXIT HUP INT TERM
fi`
    : ''
}
${token ? `require_owner ${quote(token)}` : ''}
if [ -d "$receipt" ]; then
  rm -rf "$receipt/bundle"
  rm -f "$root/tmp/attraccess-wago-runtime.tar"
  rm -rf "$config/delivery"
  exit 0
fi
if [ -d "$cleanup" ]; then
  rm -rf "$cleanup"
  rm -f "$root/tmp/attraccess-wago-runtime.tar"
  rm -rf "$config/delivery"
  exit 0
fi
if [ ! -d "$tx" ]; then
  test -d "$config/delivery" || fail 'No runtime transaction to recover'
  rm -f "$config/runtime.env.next" "$config/runtime-ca.pem.next" "$root/tmp/attraccess-wago-runtime.tar"
  mv "$config/delivery" "$receipt"
  rm -rf "$receipt/bundle"
  exit 0
fi
test ! -e "$tx/accepting" || fail 'Acceptance already began; finish acceptance instead of recovery'
rollback retained || fail 'Recovery incomplete; journal retained for another recovery attempt'
rm -f "$root/tmp/attraccess-wago-runtime.tar"
rm -rf "$config/delivery"
`;
}

/** Remove a restored receipt only after the coordinator saved the restoration outcome. */
export function runtimeBundleRecoveryAcknowledgementScript(testRoot: string, token: string): string {
  if (!/^[a-f0-9]{32}$/.test(token)) throw new Error('Invalid delivery token');
  return `${preamble(testRoot)}
test ! -d "$tx" || fail 'Recovery is not complete'
acknowledged="$receipt.acknowledged-${token}"
if test -e "$acknowledged" || test -L "$acknowledged"; then
  test -d "$acknowledged" && test ! -L "$acknowledged" || fail 'Invalid acknowledgement cleanup'
  rm -rf "$acknowledged"
fi
if [ -d "$receipt" ]; then
  require_owner ${quote(token)}
  acknowledged="$receipt.acknowledged-${token}"
  test ! -e "$acknowledged" && test ! -L "$acknowledged" || fail 'Recovery acknowledgement cleanup required'
  mv "$receipt" "$acknowledged"
  rm -rf "$acknowledged"
fi
`;
}

/** Call only after the coordinator accepts the new runtime; discards recovery metadata. */
export function runtimeBundleAcceptScript(testRoot = ''): string {
  return `${preamble(testRoot)}
test ! -e "$cleanup" || fail 'Recovery cleanup is pending; acceptance is unavailable'
if [ -d "$acceptedCleanup" ]; then rm -rf "$acceptedCleanup"; exit 0; fi
test -f "$tx/started" || fail 'No started runtime transaction to accept'
test ! -e "$tx/recovering" || fail 'Recovery already began; finish recovery instead of acceptance'
validate_snapshot || fail 'Incomplete runtime transaction metadata'
touch "$tx/accepting"
mv "$tx" "$acceptedCleanup"
rm -rf "$acceptedCleanup"
`;
}

function preamble(testRoot: string, locked = false): string {
  if (testRoot && (!testRoot.startsWith('/') || testRoot === '/' || testRoot.includes('\n')))
    throw new Error('Test root must be an absolute isolated directory');
  return `set -eu
umask 077
root=${quote(testRoot.replace(/\/$/, ''))}
unset DOCKER_HOST DOCKER_CONTEXT DOCKER_TLS_VERIFY DOCKER_CERT_PATH
${boundedDocker()}
config="$root/etc/attraccess-wago"
hook="$root/etc/rc.d/S99_zz_attraccess_wago"
data="$root/var/lib/attraccess-wago"
tx="$root/var/lib/attraccess-wago-install-transaction"
cleanup="$tx.cleanup"
acceptedCleanup="$tx.accepted-cleanup"
receipt="$tx.restored"
fail() { echo "$*" >&2; exit 1; }
${wagoShellFilesystemGuard({ acquireLock: !locked })}
wago_require_root_directory_or_alias "$root/var" && wago_require_root_directory_or_alias "$root/var/lib" || fail 'Unsafe runtime journal parent'
for journal in "$tx" "$cleanup" "$acceptedCleanup" "$receipt" "$config/delivery" "$config/docker-provision" "$config"/docker-provision.completed-*; do
  if test -e "$journal" || test -L "$journal"; then
    test -d "$journal" && test ! -L "$journal" &&
      test "$(stat -c '%u:%g:%a' "$journal")" = 0:0:700 || fail 'Unsafe runtime journal ownership, permissions or file type'
  fi
done
test ! -e "$tx" || { test ! -e "$cleanup" && test ! -e "$receipt" && test ! -e "$acceptedCleanup"; } || fail 'Conflicting runtime journals require manual inspection'
require_owner() {
  expected=$1
  for journal in "$tx" "$receipt" "$cleanup" "$config/delivery"; do
    if [ -d "$journal" ]; then
      test -f "$journal/token" && test ! -L "$journal/token" || fail 'Runtime transaction has no ownership token'
      actual=$(cat "$journal/token")
      test "$actual" = "$expected" || fail 'Runtime transaction belongs to another commissioning session'
      return 0
    fi
  done
  fail 'No runtime transaction to recover'
}
validate_snapshot() {
  if test -e "$tx/mode" || test -L "$tx/mode"; then
    test -f "$tx/mode" && test ! -L "$tx/mode" && test "$(cat "$tx/mode")" = destructive || return 1
  else
    # Valid base transactions may be contained, but never restore their former
    # containers, data or credentials under the destructive product policy.
    for field in old-running had-data had-env had-ca; do
      test -f "$tx/$field" && test ! -L "$tx/$field" || return 1
      case "$(cat "$tx/$field")" in true|false) ;; *) return 1 ;; esac
    done
  fi
  test -f "$tx/prepared" && test -f "$tx/old-id" && test ! -L "$tx/old-id" || return 1
  test "$(wc -l < "$tx/old-id" | tr -d ' ')" -le 2 || return 1
  grep -Eq '[^a-zA-Z0-9-]|^$' "$tx/old-id" && return 1
  test "$?" = 1 || return 1
}
remove_owned_container() {
  remove_id=$1
  docker update --restart=no "$remove_id" >/dev/null || return 1
  test "$(docker inspect --format '{{.HostConfig.RestartPolicy.Name}}' "$remove_id")" = no || return 1
  docker stop "$remove_id" >/dev/null || return 1
  test "$(docker inspect --format '{{.State.Running}}' "$remove_id")" = false || return 1
  docker rm "$remove_id" >/dev/null || return 1
  docker container ls -a --no-trunc --format '{{.ID}}' > "$tx/remaining-containers" || return 1
  grep -Fxq "$remove_id" "$tx/remaining-containers" && return 1
  test "$?" = 1 || return 1
}
rollback() {
  # Never infer absence from lost metadata. An unprepared transaction may only
  # be discarded while its explicit preparation marker still exists.
  if [ -f "$tx/prepared" ]; then
    validate_snapshot || return 1
  else
    test -f "$tx/preparing" || return 1
    for marker in data-changing env-changing ca-changing new-container started; do
      test ! -e "$tx/$marker" || return 1
    done
  fi
  touch "$tx/recovering" || return 1
  rm -f "$config/runtime-enabled" || return 1
  if [ -f "$tx/prepared" ]; then
    # Any failed Docker query is an error, never evidence of container absence.
    docker container ls -a --no-trunc --format '{{.ID}} {{.Names}}' > "$tx/containers" || return 1
    # Validate every recorded predecessor before removing any owned container.
    # This also contains interrupted destructive installs that failed before
    # their predecessor was stopped; it never restores a previous workload.
    if test -s "$tx/old-id"; then
      for old_id in $(cat "$tx/old-id"); do
        old_name=$(awk -v id="$old_id" '$1 == id { print $2 }' "$tx/containers")
        case "$old_name" in
          ''|attraccess-wago|attraccess-wago.previous) ;;
          *) return 1 ;;
        esac
      done
    fi
    for owned_id in $(awk '$2 == "attraccess-wago" || $2 == "attraccess-wago.previous" { print $1 }' "$tx/containers"); do
      remove_owned_container "$owned_id" || return 1
    done
    if [ -f "$tx/data-changing" ]; then rm -rf "$data" || return 1; fi
    if [ -f "$tx/env-changing" ]; then rm -f "$config/runtime.env" || return 1; fi
    if [ -f "$tx/ca-changing" ]; then rm -f "$config/runtime-ca.pem" || return 1; fi
  fi
  rm -f "$config/runtime.env.next" "$config/runtime-ca.pem.next" || return 1
  # Once renamed, even a partially deleted journal is cleanup-only. No retry
  # may interpret its remaining files as instructions to restore again.
  if [ "\${1:-}" = retained ]; then
    mv "$tx" "$receipt" || return 1
    rm -rf "$receipt/bundle" || return 1
  else
    mv "$tx" "$cleanup" || return 1
    rm -rf "$cleanup" || return 1
  fi
}
`;
}

function boundedDocker(): string {
  return 'docker() { timeout -k 5 45 docker --host unix:///var/run/docker.sock "$@"; }';
}

function quote(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

/** One SSH stdin stream: the shared flock covers every uploaded byte and mutation.
 * A leftover delivery journal is only cleared by explicit recovery under flock.
 */
export function runtimeBundleDeliveryScript(
  image: string,
  environment: string,
  caPem: string | undefined,
  bytes: number,
  digest: string,
  token: string,
  testRoot = '',
): string {
  if (!Number.isSafeInteger(bytes) || bytes <= 0 || !/^[a-f0-9]{64}$/.test(digest) || !/^[a-f0-9]{32}$/.test(token))
    throw new Error('Invalid delivery metadata');
  return `${runtimeBundlePreflightScript(bytes, testRoot)}
${preamble(testRoot)}
test ! -e "$tx" && test ! -e "$cleanup" && test ! -e "$receipt" && test ! -e "$acceptedCleanup" && test ! -e "$config/runtime.env.next" && test ! -e "$config/runtime-ca.pem.next" || fail 'Recovery or acceptance required before delivery'
if [ -e "$config/docker-provision" ]; then
  test -f "$config/docker-provision/started" && test ! -e "$config/docker-provision/restored" || fail 'Docker provisioning recovery required'
  test "$(cat "$config/docker-provision/token")" = ${quote(token)} || fail 'Docker provisioning belongs to another delivery'
fi
test ! -e "$config/delivery" && test ! -L "$config/delivery" || fail 'Delivery journal exists; explicit recovery required'
stage=$(mktemp -d "$config/delivery-stage.XXXXXX")
trap 'rm -rf "$stage"' EXIT
trap 'exit 130' HUP INT TERM
printf '%s\\n' ${quote(token)} > "$stage/token"
printf '%s\\n' receiving > "$stage/phase"
mv "$stage" "$config/delivery"
trap - EXIT HUP INT TERM
cat > "$config/delivery/bundle"
test "$(wc -c < "$config/delivery/bundle" | tr -d ' ')" = ${bytes} || fail 'Incomplete runtime upload'
printf '%s  %s\\n' ${quote(digest)} "$config/delivery/bundle" | sha256sum -c - >/dev/null
mv "$config/delivery/bundle" "$root/tmp/attraccess-wago-runtime.tar"
printf '%s' ${quote(Buffer.from(environment).toString('base64'))} | base64 -d > "$config/delivery/env"
chmod 0600 "$config/delivery/env"
mv "$config/delivery/env" "$config/runtime.env.next"
${
  caPem
    ? `printf '%s' ${quote(Buffer.from(caPem).toString('base64'))} | base64 -d > "$config/delivery/ca"
chmod 0600 "$config/delivery/ca"
mv "$config/delivery/ca" "$config/runtime-ca.pem.next"`
    : ''
}
printf '%s\\n' installing > "$config/delivery/phase"
${installScript(image, testRoot, true)}
rm -f "$root/tmp/attraccess-wago-runtime.tar"
rm -rf "$config/delivery"
`;
}

/** Read-only prerequisites; Docker must already be available. Never switch workloads. */
export function runtimeBundlePreflightScript(bytes: number, testRoot = ''): string {
  if (!Number.isSafeInteger(bytes) || bytes < 0) throw new Error('Invalid bundle size');
  return `set -eu
${wagoHardwareDeploymentPreflightScript(testRoot)}
command -v flock >/dev/null
command -v docker >/dev/null
command -v sha256sum >/dev/null
command -v base64 >/dev/null
tar --version | grep -q 'GNU tar'
docker_root=$(docker info --format '{{.DockerRootDir}}')
test -n "$docker_root" && test -d "$docker_root"
test "$(df -Pk "$docker_root" | awk 'END {print $4}')" -ge ${Math.ceil((bytes * 3) / 1024) + 16384}
${['/tmp', '/var/lib', '/etc'].map((path) => `test "$(df -Pk ${quote(testRoot + path)} | awk 'END {print $4}')" -ge ${Math.ceil((bytes * 3) / 1024) + 16384}`).join('\n')}
`;
}

/** Decode only the first stdin line; leave the binary bundle for the locked script. */
export const runtimeBundleStreamReceiver = `set -eu
umask 077
directory=$(mktemp -d "\${TMPDIR:-/tmp}/attraccess-wago-receiver.XXXXXX")
trap 'code=$?; trap - EXIT HUP INT TERM; rm -rf "$directory"; exit "$code"' EXIT
child=
interrupt() {
  trap '' HUP INT TERM
  if [ -n "$child" ]; then kill -TERM "$child" 2>/dev/null || :; wait "$child" 2>/dev/null || :; fi
  exit "$1"
}
trap 'interrupt 129' HUP
trap 'interrupt 130' INT
trap 'interrupt 143' TERM
chmod 0700 "$directory"
IFS= read -r payload
printf '%s' "$payload" | base64 -d > "$directory/script"
chmod 0600 "$directory/script"
unset payload
exec 3<&0
sh "$directory/script" <&3 &
child=$!
wait "$child"
`;
