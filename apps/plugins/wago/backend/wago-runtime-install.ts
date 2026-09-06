import { wagoHardwareDeploymentDockerArgs, wagoHardwareDeploymentPreflightScript } from './wago-hardware-deployment';

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
 * A successful start retains the transaction for explicit recovery or acceptance
 * after coordinator readiness checks. It does not prove runtime health. Recovery
 * restores old credentials verbatim; it cannot undo broker-side revocation.
 * testRoot is only for isolated shell fixtures; production callers must omit it.
 */
export function runtimeBundleInstallScript(image: string, testRoot = ''): string {
  return installScript(image, testRoot);
}

function installScript(image: string, testRoot: string, locked = false): string {
  if (!/^\S+@sha256:[a-f0-9]{64}$/i.test(image)) throw new Error('Runtime image must be digest-pinned');
  return `${preamble(testRoot, locked)}
test ! -e "$tx" && test ! -e "$cleanup" && test ! -e "$receipt" && test ! -e "$acceptedCleanup" || fail 'Runtime transaction exists; recover or accept it before retrying'
test ! -e "$config/runtime.env.previous" || fail 'Unowned previous environment requires manual inspection'
test -s "$config/runtime.env.next" && test ! -L "$config/runtime.env.next" || fail 'Missing staged runtime.env.next'
test ! -L "$data" && test ! -L "$config/runtime.env" && test ! -L "$config/runtime-ca.pem" || fail 'Runtime paths must not be symlinks'
if [ -e "$config/docker-provision" ]; then
  test -f "$config/docker-provision/started" && test ! -e "$config/docker-provision/restored" || fail 'Docker provisioning recovery required'
  test -f "$config/delivery/token" && test "$(cat "$config/docker-provision/token")" = "$(cat "$config/delivery/token")" || fail 'Docker provisioning belongs to another delivery'
fi
${wagoHardwareDeploymentPreflightScript(testRoot)}
docker container ls -a --no-trunc --format '{{.ID}} {{.Names}}' > "$config/containers.next"
if grep -q ' attraccess-wago.previous$' "$config/containers.next"; then
  fail 'Unowned previous container requires manual inspection'
fi
mkdir -m 0700 "$tx"
if [ -e "$config/delivery/token" ]; then
  test -f "$config/delivery/token" && test ! -L "$config/delivery/token" || fail 'Invalid delivery ownership token'
  cp "$config/delivery/token" "$tx/token"
  chmod 0600 "$tx/token"
fi
touch "$tx/preparing"
trap 'code=$?; trap - EXIT; if [ "$code" -ne 0 ]; then if ! rollback; then echo "Rollback incomplete; recovery snapshot retained at $tx" >&2; fi; fi; exit "$code"' EXIT
trap 'trap - EXIT; echo "Interrupted; recovery snapshot retained at $tx" >&2; exit 130' HUP INT TERM
mkdir "$tx/bundle"
# Stream only the two expected members into regular files; never unpack archive
# paths, links, permissions or device nodes into the controller filesystem.
tar --warning=no-timestamp --warning=no-unknown-keyword -xOf "$root/tmp/attraccess-wago-runtime.tar" image-reference > "$tx/bundle/image-reference"
test "$(cat "$tx/bundle/image-reference")" = ${quote(image)} || fail 'Runtime image reference mismatch'
tar --warning=no-timestamp --warning=no-unknown-keyword -xOf "$root/tmp/attraccess-wago-runtime.tar" image.tar > "$tx/bundle/image.tar"
test -s "$tx/bundle/image.tar" || fail 'Empty runtime image archive'
awk '$2 == "attraccess-wago" { print $1 }' "$config/containers.next" > "$tx/old-id"
printf '%s\\n' false > "$tx/old-running"
if [ -s "$tx/old-id" ]; then
  docker inspect --format '{{.State.Running}}' "$(cat "$tx/old-id")" > "$tx/old-running"
  grep -Eq '^(true|false)$' "$tx/old-running" || fail 'Cannot determine previous running state'
fi
if [ -e "$data" ]; then echo true; else echo false; fi > "$tx/had-data"
if [ -e "$config/runtime.env" ]; then echo true; else echo false; fi > "$tx/had-env"
if [ -e "$config/runtime-ca.pem" ]; then echo true; else echo false; fi > "$tx/had-ca"
touch "$tx/prepared"
rm -f "$tx/preparing"
if [ -s "$tx/old-id" ]; then
  docker stop "$(cat "$tx/old-id")" >/dev/null
  docker rename "$(cat "$tx/old-id")" attraccess-wago.previous
fi
# Intent markers precede mutations so recovery also handles interruption between
# a rename and its following command. Saved directories are never copied live.
touch "$tx/data-changing"
if [ "$(cat "$tx/had-data")" = true ]; then mv "$data" "$tx/data.previous"; fi
mkdir -m 0700 "$data"
chown 10001:10001 "$data"
touch "$tx/ca-changing"
if [ "$(cat "$tx/had-ca")" = true ]; then mv "$config/runtime-ca.pem" "$tx/ca.previous"; fi
if [ -e "$config/runtime-ca.pem.next" ]; then
  test -f "$config/runtime-ca.pem.next" && test ! -L "$config/runtime-ca.pem.next" || fail 'Invalid staged CA'
  mv "$config/runtime-ca.pem.next" "$config/runtime-ca.pem"
  chmod 0444 "$config/runtime-ca.pem"
fi
touch "$tx/env-changing"
if [ "$(cat "$tx/had-env")" = true ]; then mv "$config/runtime.env" "$config/runtime.env.previous"; fi
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
# This stable source survives acceptance and is restored before restarting on rollback.
set --
if [ -f "$config/runtime-ca.pem" ]; then
  set -- -v "$config/runtime-ca.pem:/var/lib/attraccess-wago/mqtt-ca.pem:ro"
fi
docker run -d --pull=never --name attraccess-wago --restart unless-stopped --env-file "$config/runtime.env" ${wagoHardwareDeploymentDockerArgs(testRoot)} -v "$data:/var/lib/attraccess-wago" "$@" "$runtime_image"
touch "$tx/started"
trap - EXIT HUP INT TERM
echo 'Runtime container started; readiness unverified; recovery snapshot retained'
`;
}

/** Explicitly restore the snapshot, including the prior container running state. */
export function runtimeBundleRecoveryScript(testRoot = '', token?: string): string {
  if (token && !/^[a-f0-9]{32}$/.test(token)) throw new Error('Invalid delivery token');
  return `${preamble(testRoot)}
test ! -e "$acceptedCleanup" || fail 'Acceptance cleanup is pending; recovery is unavailable'
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
  rm -rf "$config/delivery"
  exit 0
fi
test ! -e "$tx/accepting" || fail 'Acceptance already began; finish acceptance instead of recovery'
rollback retained || fail 'Recovery incomplete; snapshot retained for another recovery attempt'
rm -f "$root/tmp/attraccess-wago-runtime.tar"
rm -rf "$config/delivery"
`;
}

/** Remove a restored receipt only after the coordinator saved the restoration outcome. */
export function runtimeBundleRecoveryAcknowledgementScript(testRoot: string, token: string): string {
  if (!/^[a-f0-9]{32}$/.test(token)) throw new Error('Invalid delivery token');
  return `${preamble(testRoot)}
test ! -d "$tx" || fail 'Recovery is not complete'
if [ -d "$receipt" ]; then
  require_owner ${quote(token)}
  rm -rf "$receipt"
fi
`;
}

/** Call only after the coordinator accepts the new runtime; discards rollback data. */
export function runtimeBundleAcceptScript(testRoot = ''): string {
  return `${preamble(testRoot)}
test ! -e "$cleanup" || fail 'Recovery cleanup is pending; acceptance is unavailable'
if [ -d "$acceptedCleanup" ]; then rm -rf "$acceptedCleanup"; exit 0; fi
test -f "$tx/started" || fail 'No started runtime transaction to accept'
test ! -e "$tx/recovering" || fail 'Recovery already began; finish recovery instead of acceptance'
validate_snapshot || fail 'Incomplete runtime transaction metadata'
touch "$tx/accepting"
docker container ls -a --no-trunc --format '{{.ID}} {{.Names}}' > "$tx/containers"
if [ -s "$tx/old-id" ] && grep -q "^$(cat "$tx/old-id") " "$tx/containers"; then
  docker rm "$(cat "$tx/old-id")" >/dev/null
fi
rm -f "$config/runtime.env.previous"
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
docker() { command docker --host unix:///var/run/docker.sock "$@"; }
config="$root/etc/attraccess-wago"
data="$root/var/lib/attraccess-wago"
tx="$root/var/lib/attraccess-wago-install-transaction"
cleanup="$tx.cleanup"
acceptedCleanup="$tx.accepted-cleanup"
receipt="$tx.restored"
fail() { echo "$*" >&2; exit 1; }
test ! -L "$config" || fail 'Runtime configuration must not be a symlink'
mkdir -p "$config" "$root/var/lib"
chown 0:0 "$config"
chmod 0700 "$config"
${
  locked
    ? ''
    : `exec 9>"$config/install.lock"
flock -n 9 || fail 'Another runtime transaction holds the controller lock'`
}
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
  test -f "$tx/prepared" && test -f "$tx/old-id" && test ! -L "$tx/old-id" || return 1
  test "$(wc -l < "$tx/old-id" | tr -d ' ')" -le 1 || return 1
  if [ -s "$tx/old-id" ]; then grep -Eq '^[a-zA-Z0-9-]+$' "$tx/old-id" || return 1; fi
  for field in old-running had-data had-env had-ca; do
    test -f "$tx/$field" && test ! -L "$tx/$field" || return 1
    case "$(cat "$tx/$field")" in true|false) ;; *) return 1 ;; esac
  done
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
  if [ -f "$tx/prepared" ]; then
    # Any failed Docker query is an error, never evidence of container absence.
    if [ -f "$tx/new-container" ]; then
      docker container ls -a --no-trunc --format '{{.ID}} {{.Names}}' > "$tx/containers" || return 1
      new_id=$(awk '$2 == "attraccess-wago" { print $1 }' "$tx/containers")
      if [ -n "$new_id" ] && [ "$new_id" != "$(cat "$tx/old-id")" ]; then
        docker rm -f "$new_id" >/dev/null || return 1
      fi
    fi
    if [ -f "$tx/data-changing" ] && [ ! -f "$tx/data-restored" ]; then
      if [ -d "$tx/data.previous" ]; then
        rm -rf "$data" || return 1
        mv "$tx/data.previous" "$data" || return 1
      elif [ "$(cat "$tx/had-data")" = false ]; then
        rm -rf "$data" || return 1
      fi
      touch "$tx/data-restored" || return 1
    fi
    if [ -f "$tx/env-changing" ] && [ ! -f "$tx/env-restored" ]; then
      if [ -f "$config/runtime.env.previous" ]; then
        mv -f "$config/runtime.env.previous" "$config/runtime.env" || return 1
      elif [ "$(cat "$tx/had-env")" = false ]; then
        rm -f "$config/runtime.env" || return 1
      fi
      touch "$tx/env-restored" || return 1
    fi
    if [ -f "$tx/ca-changing" ] && [ ! -f "$tx/ca-restored" ]; then
      if [ -f "$tx/ca.previous" ]; then
        mv -f "$tx/ca.previous" "$config/runtime-ca.pem" || return 1
      elif [ "$(cat "$tx/had-ca")" = false ]; then
        rm -f "$config/runtime-ca.pem" || return 1
      fi
      touch "$tx/ca-restored" || return 1
    fi
    if [ -s "$tx/old-id" ]; then
      old_id=$(cat "$tx/old-id")
      old_name=$(docker inspect --format '{{.Name}}' "$old_id") || return 1
      if [ "$old_name" != /attraccess-wago ]; then
        docker rename "$old_id" attraccess-wago || return 1
      fi
      if [ "$(cat "$tx/old-running")" = true ]; then
        docker start "$old_id" >/dev/null || return 1
      else
        docker stop "$old_id" >/dev/null || return 1
      fi
    fi
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
mkdir -m 0700 "$config/delivery" || fail 'Delivery journal exists; explicit recovery required'
printf '%s\\n' ${quote(token)} > "$config/delivery/token"
printf '%s\\n' receiving > "$config/delivery/phase"
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
processes=$(ps -eo comm=)
if printf '%s' "$processes" | grep -iq '[c]odesys'; then echo 'CODESYS workload preservation unavailable' >&2; exit 1; fi
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
