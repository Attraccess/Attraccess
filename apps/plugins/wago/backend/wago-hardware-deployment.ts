/** Software contract from ATT-1056 eafdbe04, reviewed at f3248534. No hardware qualification implied. */
import { wagoFw31IdentityCheck } from './wago-firmware-identity';

export const WAGO_HARDWARE_PROFILE = 'cc100-751-9301-fw31-digital-v1';
export const WAGO_DIN = '/sys/devices/platform/soc/44009000.spi/spi_master/spi0/spi0.0/din';
export const WAGO_DOUT = '/sys/kernel/dout_drv/DOUT_DATA';
export const WAGO_DOCKER_PROVISION_REVIEW_FLAG = 'reviewedDockerActivation' as const;

export interface WagoDockerProvisionReview {
  reviewedDockerActivation: boolean;
  action: 'start-installed-runtime';
  token: string;
}

/** Newline-delimited key=value report, version 1. Values are fixed enums, never shell input.
 * A nonzero SSH exit is an invalid/incomplete report, not an unsupported controller.
 */
import type { WagoHardwareDeploymentReport } from '../shared/commissioning';
export type { WagoHardwareDeploymentReport } from '../shared/commissioning';

/** Reject truncation, duplicate/unknown fields and unexpected command output. Check SSH exit first. */
export function parseWagoHardwareDeploymentReport(output: string): WagoHardwareDeploymentReport {
  const values = {
    version: ['1'],
    platform: ['supported', 'unsupported-firmware'],
    hardware: ['accessible', 'missing-register', 'uid10001-access-denied', 'permission-tool-unavailable'],
    exclusivity: ['clear', 'codesys-active', 'codesys-boot-enabled', 'output-container-conflict', 'unknown'],
    docker: ['running', 'installed-stopped', 'vendor-package-missing', 'unsupported-tool-state'],
    configDocker: ['present', 'missing'],
    provision: [
      'none',
      'review-start-installed-runtime',
      'unsupported-fw31-package-activation',
      'unsupported-tool-state',
      'unsupported-lifecycle-dependencies',
    ],
    qualification: ['required'],
  };
  const lines = output.slice(0, -1).split('\n');
  if (output.length > 2048 || !output.endsWith('\n') || lines.length !== Object.keys(values).length)
    throw new Error('Invalid hardware deployment report');
  const result: Record<string, string> = {};
  for (const line of lines) {
    const [key, value, extra] = line.split('=');
    if (
      extra !== undefined ||
      Object.hasOwn(result, key) ||
      !Object.hasOwn(values, key) ||
      !values[key as keyof typeof values].includes(value)
    )
      throw new Error('Invalid hardware deployment report');
    result[key] = value;
  }
  return result as unknown as WagoHardwareDeploymentReport;
}

function quote(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

function rootValue(testRoot: string): string {
  if (testRoot && (!testRoot.startsWith('/') || testRoot === '/' || /[\n,]/.test(testRoot)))
    throw new Error('Test root must be an absolute isolated directory without commas');
  return quote(testRoot.replace(/\/$/, ''));
}

function checks(testRoot: string): string {
  return `set -eu
root=${rootValue(testRoot)}
# Never inherit a remote Docker context or TCP endpoint from the login shell.
unset DOCKER_HOST DOCKER_CONTEXT DOCKER_TLS_VERIFY DOCKER_CERT_PATH
docker_cli=$(command -v docker || :)
daemon_cli=$(command -v dockerd || :)
docker() { command docker --host unix:///var/run/docker.sock "$@"; }
config_docker=missing
[ ! -x "$root/etc/config-tools/config_docker" ] || config_docker=present
platform=unsupported-firmware
if test -f "$root/etc/os-release" &&
  ${wagoFw31IdentityCheck(true)}; then platform=supported; fi
din="$root${WAGO_DIN}"
dout="$root${WAGO_DOUT}"
hardware=accessible
if ! test -f "$din" || ! test -f "$dout" || test -L "$din" || test -L "$dout"; then
  hardware=missing-register
elif ! command -v setpriv >/dev/null 2>&1; then
  hardware=permission-tool-unavailable
elif ! setpriv --reuid=10001 --regid=10001 --clear-groups --bounding-set=-all --inh-caps=-all --ambient-caps=-all --no-new-privs sh -c 'test "$(id -u)" = 10001 && test "$(id -g)" = 10001' >/dev/null 2>&1; then
  hardware=permission-tool-unavailable
elif ! setpriv --reuid=10001 --regid=10001 --clear-groups --bounding-set=-all --inh-caps=-all --ambient-caps=-all --no-new-privs sh -c 'test -r "$1" && test -r "$2" && test -w "$2"' sh "$din" "$dout"; then
  hardware=uid10001-access-denied
fi
exclusivity=unknown
processes=$(ps -eo comm=) || exit 1
if printf '%s\\n' "$processes" | grep -iq codesys; then exclusivity=codesys-active; fi
# WAGO config_runtime/init runtime use S98_runtime. A stopped PLC can return
# at reboot; process absence is not permission to replace its output ownership.
if [ "$exclusivity" = unknown ] && { test -e "$root/etc/rc.d/S98_runtime" || test -L "$root/etc/rc.d/S98_runtime"; }; then
  exclusivity=codesys-boot-enabled
fi
docker_state=vendor-package-missing
provision=unsupported-fw31-package-activation
if [ -n "$docker_cli" ] || [ -n "$daemon_cli" ]; then
  docker_state=unsupported-tool-state
  provision=unsupported-tool-state
fi
if [ -n "$docker_cli" ] && [ -n "$daemon_cli" ]; then
  if docker info >/dev/null 2>&1; then
    docker_state=running
    provision=none
    if [ "$exclusivity" = unknown ] && [ "$hardware" != missing-register ]; then
      exclusivity=clear
      output_canonical=$(readlink -f "$dout") || exit 1
      containers=$(docker container ls -a --no-trunc --format '{{.ID}}') || exit 1
      for container in $containers; do
        name=$(docker inspect --format '{{.Name}}' "$container") || exit 1
        # The installer stops this exact predecessor under the shared lock.
        [ "$name" != /attraccess-wago ] || continue
        mounts=$(docker inspect --format '{{range .Mounts}}{{if eq .Type "bind"}}{{.Source}}{{"\\n"}}{{end}}{{end}}' "$container") || exit 1
        conflict=0
        while IFS= read -r source; do
          [ -n "$source" ] || continue
          # Also reject parent binds (including /sys or /) and canonical aliases.
          canonical=$(readlink -f "$source") || exit 1
          case "$output_canonical" in "$canonical"|"$canonical"/*) conflict=1 ;; esac
          [ "$canonical" != / ] || conflict=1
        done <<EOF_MOUNTS
$mounts
EOF_MOUNTS
        [ "$conflict" = 0 ] || exclusivity=output-container-conflict
      done
    fi
  elif [ "$platform" = supported ] && [ -x "$root/etc/init.d/dockerd" ]; then
    # The pinned WAGO init implements start/stop/restart, NOT LSB status.
    # Its stop dispatches every networking event. A daemon-only snapshot cannot
    # restore these effects; do not execute it, even for inspection.
    provision=unsupported-lifecycle-dependencies
    if ! printf '%s\\n' "$processes" | grep -iq dockerd &&
      test ! -e "$root/var/run/docker.pid" && test ! -L "$root/var/run/docker.pid"; then
      docker_state=installed-stopped
    fi
  fi
fi
`;
}

export function wagoHardwareDeploymentReportScript(testRoot = ''): string {
  return `${checks(testRoot)}
printf 'version=1\\nplatform=%s\\nhardware=%s\\nexclusivity=%s\\ndocker=%s\\nconfigDocker=%s\\nprovision=%s\\nqualification=required\\n' "$platform" "$hardware" "$exclusivity" "$docker_state" "$config_docker" "$provision"
`;
}

/** Recheck under the install lock immediately before any runtime transaction. */
export function wagoHardwareDeploymentPreflightScript(testRoot = ''): string {
  return `${checks(testRoot)}
[ "$platform" = supported ] || { echo "$platform" >&2; exit 1; }
[ "$hardware" = accessible ] || { echo "$hardware" >&2; exit 1; }
[ "$docker_state" = running ] || { echo "$docker_state: $provision" >&2; exit 1; }
[ "$exclusivity" = clear ] || { echo "$exclusivity" >&2; exit 1; }
`;
}

export function wagoHardwareDeploymentDockerArgs(testRoot = ''): string {
  rootValue(testRoot);
  return `--user 10001:10001 --cap-drop ALL --security-opt no-new-privileges --env WAGO_HARDWARE_PROFILE=${WAGO_HARDWARE_PROFILE} --mount ${quote(`type=bind,src=${testRoot}${WAGO_DIN},dst=/run/attraccess-wago/io/din,readonly`)} --mount ${quote(`type=bind,src=${testRoot}${WAGO_DOUT},dst=/run/attraccess-wago/io/dout`)}`;
}

function provisionLock(token: string, testRoot: string): string {
  if (!/^[a-f0-9]{32}$/.test(token)) throw new Error('Invalid provisioning token');
  return `set -eu
umask 077
root=${rootValue(testRoot)}
config="$root/etc/attraccess-wago"
journal="$config/docker-provision"
fail() { echo "$*" >&2; exit 1; }
test ! -L "$config" || fail 'Invalid configuration directory'
mkdir -p "$config"
chmod 0700 "$config"
exec 9>"$config/install.lock"
flock -n 9 || fail 'Another runtime transaction holds the controller lock'
for path in "$root/var/lib/attraccess-wago-install-transaction" "$root/var/lib/attraccess-wago-install-transaction.cleanup" "$root/var/lib/attraccess-wago-install-transaction.restored" "$root/var/lib/attraccess-wago-install-transaction.accepted-cleanup" "$config/delivery"; do
  test ! -e "$path" || fail 'Finish runtime delivery/recovery before Docker provisioning'
done
token=${quote(token)}
`;
}

/** Kept for existing coordinator/API compatibility. Do not run the old ungrounded
 * LSB start/stop transaction: vendor stop invokes unsnapshotted networking hooks.
 */
export function wagoDockerProvisionScript(review: WagoDockerProvisionReview, testRoot = ''): string {
  if (review.reviewedDockerActivation !== true || review.action !== 'start-installed-runtime')
    throw new Error('Explicit reviewedDockerActivation and start-installed-runtime action required');
  return `${provisionLock(review.token, testRoot)}
test ! -e "$journal" || fail 'Docker provisioning recovery or acceptance required'
${checks(testRoot)}
[ "$platform" = supported ] || fail "$platform"
[ "$exclusivity" != codesys-active ] || fail "$exclusivity"
fail 'unsupported-lifecycle-dependencies: Docker networking and boot restoration require a complete source gate'
`;
}

/** Shared passive state checks and explicit reconciliation of base-version journals.
 * Reconciliation captures CURRENT context under a separate name, never fabricates
 * historical firmware/service snapshots that the base implementation did not save.
 */
function dockerReconciliationHelpers(): string {
  return `
unset DOCKER_HOST DOCKER_CONTEXT DOCKER_TLS_VERIFY DOCKER_CERT_PATH
docker_stopped() {
  test ! -e "$root/var/run/docker.pid" && test ! -L "$root/var/run/docker.pid" || return 1
  if command docker --host unix:///var/run/docker.sock info >/dev/null 2>&1; then return 1; fi
  processes=$(ps -eo comm=) || return 1
  if printf '%s\\n' "$processes" | grep -iq dockerd; then return 1; fi
}
require_no_start_effects() {
  for marker in start-intent started; do
    if test -e "$journal/$marker" || test -L "$journal/$marker"; then
      fail 'unresolved-lifecycle-effects: saved Docker start may have changed WAGO_DOCKER_IPT and networking state; daemon absence cannot prove restoration; recovery retained'
    fi
  done
}
check_context() {
  test -d "$context" && test ! -L "$context" || fail 'Invalid reconciliation context'
  for name in os-release dockerd; do
    test -f "$context/$name" && test ! -L "$context/$name" || fail 'Incomplete firmware/service context; recovery retained'
  done
  cmp -s "$root/etc/os-release" "$context/os-release" || fail 'Firmware changed; recovery retained'
  cmp -s "$root/etc/init.d/dockerd" "$context/dockerd" || fail 'Docker service changed; recovery retained'
}
journal_context() {
  legacy=0
  context="$journal"
  if test -e "$journal/os-release" || test -L "$journal/os-release" || test -e "$journal/dockerd" || test -L "$journal/dockerd"; then
    check_context
  else
    legacy=1
    context="$journal/reconciliation"
    if test -e "$context" || test -L "$context"; then check_context; else context=''; fi
  fi
}
capture_legacy_context() {
  if test "$legacy" = 1 && test -z "$context"; then
    stage=$(mktemp -d "$journal/reconcile.XXXXXX") || fail 'Cannot retain reconciliation context'
    cp "$root/etc/os-release" "$stage/os-release" && cp "$root/etc/init.d/dockerd" "$stage/dockerd" || fail 'Cannot capture current context'
    mv "$stage" "$journal/reconciliation" || fail 'Cannot retain reconciliation context'
    context="$journal/reconciliation"
  fi
  check_context
}
`;
}

/** Call after runtime recovery, before acknowledging provisioning restoration. Never removes packages. */
export function wagoDockerProvisionRecoveryScript(token: string, testRoot = ''): string {
  return `${provisionLock(token, testRoot)}
${dockerReconciliationHelpers()}
if test ! -e "$journal"; then
  fail 'unresolved-lifecycle-effects: no saved Docker journal; daemon absence cannot prove restoration; recovery retained'
fi
test -d "$journal" && test ! -L "$journal" || fail 'No Docker provisioning journal'
test "$(cat "$journal/token")" = "$token" || fail 'Docker provisioning token mismatch'
test "$(cat "$journal/prior")" = stopped || fail 'Invalid Docker provisioning snapshot'
journal_context
require_no_start_effects
if test "$legacy" = 0; then
  ${wagoFw31IdentityCheck(true)} || fail 'Unsupported firmware; recovery retained'
fi
if command docker --host unix:///var/run/docker.sock info >/dev/null 2>&1; then
  containers=$(command docker --host unix:///var/run/docker.sock container ls -a -q) || fail 'Cannot inspect Docker workloads'
  test -z "$containers" || fail 'Docker workloads exist; refusing to stop daemon'
  docker_running=1
else
  # An unavailable API cannot prove that no workloads are present. Only acknowledge
  # an already stopped daemon; never invoke the vendor init's unsupported status.
  docker_stopped || fail 'Cannot inspect Docker workloads'
  docker_running=0
fi
if test -e "$journal/restored"; then
  test "$docker_running" = 0 || fail 'Docker changed after restoration; recovery retained'
  capture_legacy_context
  docker_stopped || fail 'Docker changed during reconciliation; recovery retained'
  echo 'docker-provision=restored'; exit 0
fi
if test "$docker_running" = 1; then
  fail 'unsupported-lifecycle-dependencies: vendor stop invokes unsnapshotted networking events; recovery retained'
fi
capture_legacy_context
docker_stopped || fail 'Docker changed during reconciliation; recovery retained'
touch "$journal/restored"
echo 'docker-provision=restored'
`;
}

/** Acknowledge a verified, never-started journal. Legacy acceptance has no production caller. */
export function wagoDockerProvisionFinishScript(
  token: string,
  outcome: 'accepted' | 'restored',
  testRoot = '',
): string {
  if (outcome !== 'accepted' && outcome !== 'restored') throw new Error('Invalid provisioning outcome');
  return `${provisionLock(token, testRoot)}
${dockerReconciliationHelpers()}
cleanup="$journal.${outcome}-$token"
if test -d "$cleanup" && test ! -e "$journal"; then
  journal="$cleanup"
  require_no_start_effects
  rm -rf "$cleanup"; exit 0
fi
test -d "$journal" && test ! -L "$journal" || fail 'No Docker provisioning journal'
test "$(cat "$journal/token")" = "$token" || fail 'Docker provisioning token mismatch'
test "$(cat "$journal/prior")" = stopped || fail 'Invalid Docker provisioning snapshot'
test -f "$journal/${outcome === 'accepted' ? 'started' : 'restored'}" || fail 'Provisioning outcome not verified'
journal_context
require_no_start_effects
${
  outcome === 'accepted'
    ? `command docker --host unix:///var/run/docker.sock info >/dev/null 2>&1 || fail 'Docker no longer running; recovery retained'`
    : `docker_stopped || fail 'Docker no longer stopped; recovery retained'`
}
${outcome === 'accepted' ? `test ! -e "$journal/restored" || fail 'Docker provisioning was restored'` : ''}
capture_legacy_context
${outcome === 'accepted' ? `command docker --host unix:///var/run/docker.sock info >/dev/null 2>&1 || fail 'Docker changed during reconciliation'` : `docker_stopped || fail 'Docker changed during reconciliation'`}
mv "$journal" "$cleanup"
rm -rf "$cleanup"
`;
}
