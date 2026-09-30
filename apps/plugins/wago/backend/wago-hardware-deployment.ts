/** FW31 vendor lifecycle and narrow digital I/O deployment. Physical qualification is separate. */
import { wagoFw31IdentityCheck } from './wago-firmware-identity';
import { wagoCodesysClassificationShell } from './wago-codesys-classification';
import { wagoShellFilesystemGuard } from './wago-shell-filesystem';
import { wagoShellStat } from './wago-shell-stat';
import { wagoHostIoGuardShell } from './wago-host-io-guard';
import { wagoPrivilegeProbeShell } from './wago-privilege-probe';
import { wagoRuntimeSupervisorAcknowledgeShell, wagoRuntimeSupervisorLaunchShell } from './wago-runtime-supervisor';
import {
  CC100_DIGITAL_PROFILE_ID,
  CC100_MODBUS_PROFILE_ID,
  CC100_SERIAL_HOST_PATH,
  CC100_SERIAL_PATH,
  isCc100HardwareProfile,
  type Cc100HardwareProfile,
} from '../shared/hardware-profile';
import { wagoSerialDeploymentPreflight } from './wago-serial-deployment';

export const WAGO_HARDWARE_PROFILE = CC100_DIGITAL_PROFILE_ID;
export const WAGO_DIN = '/sys/devices/platform/soc/44009000.spi/spi_master/spi0/spi0.0/din';
export const WAGO_DOUT = '/sys/kernel/dout_drv/DOUT_DATA';
/** RUN LED dies used for runtime status. Cosmetic: absent files are skipped, never fatal.
 * WAGO ledserverd keeps RUN at STATIC_OFF once CODESYS is disabled, so it does not compete.
 */
export const WAGO_RUN_LEDS = {
  green: '/sys/devices/platform/led/leds/run-green/brightness',
  red: '/sys/devices/platform/led/leds/run-red/brightness',
} as const;
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
      'prepare-controller',
      'install-vendor-runtime',
      'review-start-installed-runtime',
      'unsupported-fw31-package-activation',
      'unsupported-tool-state',
      'unsupported-lifecycle-dependencies',
    ],
    qualification: ['required', 'software-supported'],
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

function checks(testRoot: string, boundedDocker = true, inspectHostWriters = true): string {
  return `set -eu
${wagoShellStat()}
root=${rootValue(testRoot)}
# Never inherit a remote Docker context or TCP endpoint from the login shell.
unset DOCKER_HOST DOCKER_CONTEXT DOCKER_TLS_VERIFY DOCKER_CERT_PATH
export DOCKER_HOST=unix:///var/run/docker.sock
docker_cli=$(command -v docker || :)
daemon_cli=$(command -v dockerd || :)
docker() { ${boundedDocker ? 'timeout -k 5 10 "$docker_cli"' : 'command docker'} --host unix:///var/run/docker.sock "$@"; }
config_docker=missing
[ ! -x "$root/etc/config-tools/config_docker" ] || config_docker=present
platform=unsupported-firmware
if test -f "$root/etc/os-release" &&
  ${wagoFw31IdentityCheck(true)}; then platform=supported; fi
din="$root${WAGO_DIN}"
dout="$root${WAGO_DOUT}"
wago_led_green=
wago_led_red=
if test -f "$root${WAGO_RUN_LEDS.green}" && test ! -L "$root${WAGO_RUN_LEDS.green}"; then wago_led_green="$root${WAGO_RUN_LEDS.green}"; fi
if test -f "$root${WAGO_RUN_LEDS.red}" && test ! -L "$root${WAGO_RUN_LEDS.red}"; then wago_led_red="$root${WAGO_RUN_LEDS.red}"; fi
hardware=accessible
if ! test -f "$din" || ! test -f "$dout" || test -L "$din" || test -L "$dout"; then
  hardware=missing-register
else
  ${wagoPrivilegeProbeShell()}
fi
exclusivity=unknown
processes=$(ps -eo comm=) || exit 1
${wagoCodesysClassificationShell()}
codesys_state=$(wago_codesys_classify) || exit 1
if [ "$codesys_state" = active ]; then exclusivity=codesys-active; fi
# WAGO config_runtime/init runtime use S98_runtime. A stopped PLC can return
# at reboot; process absence is not permission to replace its output ownership.
if [ "$exclusivity" = unknown ] && { test -e "$root/etc/rc.d/S98_runtime" || test -L "$root/etc/rc.d/S98_runtime" || test "$(cat "$root/etc/specific/rtsversion" 2>/dev/null || :)" != 0; }; then
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
    if [ "$exclusivity" = unknown ] && [ "$codesys_state" = inactive ] && [ "$hardware" != missing-register ]; then
      exclusivity=clear
      output_canonical=$(readlink -f "$dout") || exit 1
      containers=$(docker container ls -a --no-trunc --format '{{.ID}}') || exit 1
      for container in $containers; do
        name=$(docker inspect --format '{{.Name}}' "$container") || exit 1
        # The installer stops this exact predecessor under the shared lock.
        [ "$name" != /attraccess-wago ] || continue
        privileged=$(docker inspect --format '{{.HostConfig.Privileged}}' "$container") || exit 1
        case "$privileged" in true) exclusivity=output-container-conflict ;; false) ;; *) exit 1 ;; esac
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
    ${
      inspectHostWriters
        ? `if [ "$exclusivity" = clear ]; then
      ${wagoHostIoGuardShell()}
      if ! wago_host_io_guard allow-owned; then exclusivity=unknown; fi
    fi`
        : ''
    }
  elif [ "$platform" = supported ] && [ -x "$root/etc/init.d/dockerd" ]; then
    if ! printf '%s\\n' "$processes" | grep -iq dockerd &&
      test ! -e "$root/var/run/docker.pid" && test ! -L "$root/var/run/docker.pid"; then
      docker_state=installed-stopped
    fi
  fi
fi
if [ "$platform" = supported ] && [ -n "$docker_cli" ] && [ -n "$daemon_cli" ] &&
  [ "$config_docker" = present ] && [ -x "$root/etc/config-tools/get_docker_config" ] &&
  [ -x "$root/etc/config-tools/config_runtime" ] && [ -x "$root/etc/init.d/runtime" ] &&
  [ -x "$root/etc/init.d/dockerd" ]; then
  provision=prepare-controller
  installed=$(${boundedDocker ? 'timeout -k 5 10 ' : ''}"$root/etc/config-tools/get_docker_config" install-status) || exit 1
  case "$installed" in
    installed) ;;
    'not installed') provision=install-vendor-runtime ;;
    *) provision=unsupported-tool-state ;;
  esac
fi
`;
}

export function wagoHardwareDeploymentReportScript(testRoot = ''): string {
  return `${checks(testRoot)}
qualification=required
case "$provision" in prepare-controller|install-vendor-runtime) qualification=software-supported ;; esac
printf 'version=1\\nplatform=%s\\nhardware=%s\\nexclusivity=%s\\ndocker=%s\\nconfigDocker=%s\\nprovision=%s\\nqualification=%s\\n' "$platform" "$hardware" "$exclusivity" "$docker_state" "$config_docker" "$provision" "$qualification"
`;
}

/** Recheck under the install lock immediately before any runtime transaction. */
export function wagoHardwareDeploymentPreflightScript(
  testRoot = '',
  boundedDocker = true,
  profile: Cc100HardwareProfile = WAGO_HARDWARE_PROFILE,
): string {
  return `${checks(testRoot, boundedDocker)}
[ "$platform" = supported ] || { echo "$platform" >&2; exit 1; }
[ "$hardware" = accessible ] || { echo "$hardware" >&2; exit 1; }
[ "$docker_state" = running ] || { echo "$docker_state: $provision" >&2; exit 1; }
[ "$exclusivity" = clear ] || { echo "$exclusivity" >&2; exit 1; }
${profile === CC100_MODBUS_PROFILE_ID ? wagoSerialDeploymentPreflight() : ''}
`;
}

export function wagoHardwareDeploymentDockerArgs(
  testRoot = '',
  profile: Cc100HardwareProfile = WAGO_HARDWARE_PROFILE,
): string {
  rootValue(testRoot);
  if (!isCc100HardwareProfile(profile)) throw new Error('Unsupported CC100 hardware profile');
  const serial =
    profile === CC100_MODBUS_PROFILE_ID
      ? ` --group-add "$wago_serial_gid" --device ${quote(`${testRoot}${CC100_SERIAL_HOST_PATH}:${CC100_SERIAL_PATH}:rw`)}`
      : '';
  // Preflight sets wago_led_* only for present LED files; quoted words survive the :+ expansion.
  const leds = (['green', 'red'] as const)
    .map(
      (die) =>
        ` \${wago_led_${die}:+--mount "type=bind,src=$wago_led_${die},dst=/run/attraccess-wago/io/led-run-${die}"}`,
    )
    .join('');
  return `--user 10001:10001 --cap-drop ALL --security-opt no-new-privileges --network host --env WAGO_HARDWARE_PROFILE=${profile} --mount ${quote(`type=bind,src=${testRoot}${WAGO_DIN},dst=/run/attraccess-wago/io/din,readonly`)} --mount ${quote(`type=bind,src=${testRoot}${WAGO_DOUT},dst=/run/attraccess-wago/io/dout`)}${leds}${serial}`;
}

function provisionLock(token: string, testRoot: string): string {
  if (!/^[a-f0-9]{32}$/.test(token)) throw new Error('Invalid provisioning token');
  return `set -eu
umask 077
root=${rootValue(testRoot)}
config="$root/etc/attraccess-wago"
journal="$config/docker-provision"
fail() { echo "$*" >&2; exit 1; }
 ${wagoShellFilesystemGuard({ waitForLock: true })}
 for path in "$root/var/lib/attraccess-wago-install-transaction" "$root/var/lib/attraccess-wago-install-transaction.cleanup" "$root/var/lib/attraccess-wago-install-transaction.restored" "$root/var/lib/attraccess-wago-install-transaction.accepted-cleanup" "$config/delivery"; do
  test ! -e "$path" || fail 'Finish runtime delivery/recovery before Docker provisioning'
done
token=${quote(token)}
for preparation_path in "$journal" "$config/docker-provision.completed-$token"; do
  if test -e "$preparation_path" || test -L "$preparation_path"; then
    test -d "$preparation_path" && test ! -L "$preparation_path" && test "$(stat -c '%u:%g:%a' "$preparation_path")" = 0:0:700 || fail 'Unsafe preparation journal ownership or permissions'
    for field in token mode prior started restored start-intent accepted os-release dockerd; do
      path="$preparation_path/$field"
      if test -e "$path" || test -L "$path"; then
        test -f "$path" && test ! -L "$path" || fail 'Unsafe preparation journal field'
        metadata=$(stat -c '%u:%g:%a:%h' "$path") || fail 'Cannot inspect preparation journal field'
        case "$metadata" in 0:0:[0-7][0145][0145]:1) ;; *) fail 'Unsafe preparation journal field ownership or permissions' ;; esac
      fi
    done
  fi
done
`;
}

/** Narrow ownership is reapplied to volatile sysfs files on every controller boot. */
function codesysStopped(): string {
  return `
${wagoCodesysClassificationShell()}
codesys_state=$(wago_codesys_classify) || fail 'Cannot verify CODESYS stopped'
case "$codesys_state" in inactive) ;; active) fail 'codesys-active' ;; *) fail 'Cannot verify CODESYS stopped' ;; esac
`;
}

function codesysDisabled(): string {
  return `${codesysStopped()}
test -f "$root/etc/specific/rtsversion" && test ! -L "$root/etc/specific/rtsversion" &&
  test "$(cat "$root/etc/specific/rtsversion")" = 0 &&
  test ! -e "$root/etc/rc.d/S98_runtime" && test ! -L "$root/etc/rc.d/S98_runtime" || fail 'codesys-boot-enabled'
for entry in "$root/etc/rc.d/"*; do
  test -e "$entry" || { test ! -L "$entry" || fail 'Invalid enabled boot entry'; continue; }
  target=$(readlink -f "$entry") || fail 'Cannot inspect enabled boot entry'
  case "$target" in */init.d/runtime|*/codesys3|*/plclinux_rt|*/rtswrapper) fail 'codesys-boot-enabled' ;; esac
done
`;
}

function hardwareOwnership(): string {
  return `${codesysDisabled()}
${wagoHostIoGuardShell()}
din="$root${WAGO_DIN}"
dout="$root${WAGO_DOUT}"
wago_host_io_guard allow-owned || fail "$host_io_guard_reason"
test -f "$root${WAGO_DIN}" && test ! -L "$root${WAGO_DIN}" &&
  test -f "$root${WAGO_DOUT}" && test ! -L "$root${WAGO_DOUT}" || fail 'missing-register'
chown 10001:10001 "$root${WAGO_DIN}" "$root${WAGO_DOUT}" || fail 'io-ownership-failed'
chmod 0400 "$root${WAGO_DIN}" || fail 'io-permission-failed'
chmod 0600 "$root${WAGO_DOUT}" || fail 'io-permission-failed'
test "$(stat -c '%u:%g:%a' "$root${WAGO_DIN}")" = 10001:10001:400 &&
  test "$(stat -c '%u:%g:%a' "$root${WAGO_DOUT}")" = 10001:10001:600 || fail 'io-permission-unverified'
# Status LEDs are best-effort: a failed grant only leaves the RUN LED dark.
for led in "$root${WAGO_RUN_LEDS.green}" "$root${WAGO_RUN_LEDS.red}"; do
  if test -f "$led" && test ! -L "$led"; then chown 10001:10001 "$led" && chmod 0600 "$led" || :; fi
done
`;
}

/** Docker cannot restart this writer. Every boot, explicit start and bounded
 * crash retry passes the host gate. The supervisor also withdraws a running
 * writer when its periodic observation detects a conflict or cannot complete.
 * The 300s gate budget accommodates the observed FW31 172543ms hardware check
 * (161064ms host IO, 8995ms CODESYS), within the 30-minute operation limit.
 * This timing allowance is not safety certification or physical qualification.
 */
export function wagoRuntimeBootScript(testRoot = '', profile: Cc100HardwareProfile = WAGO_HARDWARE_PROFILE): string {
  return `#!/bin/sh
set -eu
umask 077
root=${rootValue(testRoot)}
unset DOCKER_HOST DOCKER_CONTEXT DOCKER_TLS_VERIFY DOCKER_CERT_PATH
export DOCKER_HOST=unix:///var/run/docker.sock
command -v timeout >/dev/null || exit 1
docker_cli=$(command -v docker) || exit 1
docker() { timeout -k 5 10 "$docker_cli" --host unix:///var/run/docker.sock "$@"; }
config="$root/etc/attraccess-wago"
hook="$root/etc/rc.d/S99_zz_attraccess_wago"
may_stop=0
supervisor_owner=0
fail() { echo "$*" >&2; exit 1; }
${runtimeContainment()}
contain_supervisor_failure() (
  flock() {
    # An exhausted monitor keeps supervisor ownership until the competing
    # transaction releases install.lock. It cannot acknowledge or restart in
    # this state, and must not abandon the writer merely because the lock is busy.
    if test "$action" = supervise; then
      until command flock "$@"; do
        validate_controller_lock || return 1
        sleep 2 || return 1
      done
    else
      command flock "$@"
    fi
  }
  ${wagoShellFilesystemGuard()}
  # Enablement is durable operator intent, not a transient observation result.
  # Only an explicit stop, installation rollback or replacement disables it.
  contain_runtime
)
# Direct exits and errexit from every embedded observation use the same bounded
# containment path. Failure to verify stopping is never a successful receipt.
trap 'status=$?; trap - EXIT; if test "$status" -ne 0; then if test "$supervisor_owner" = 1; then if contain_supervisor_failure; then if test "$action" = start && test -f "$config/runtime-enabled"; then nohup "$hook" supervise </dev/null >/dev/null 2>&1 9>&- & fi; else echo "Runtime supervisor containment unverified; recovery required" >&2; fi; elif test "$may_stop" = 1; then contain_runtime || echo "Runtime containment unverified; recovery required" >&2; fi; fi; exit "$status"' EXIT
trap 'exit 130' HUP INT TERM
action=\${1:-}
case "$action" in
  supervise)
    ${wagoShellFilesystemGuard({ lockName: 'supervisor.lock', descriptor: 8 })}
    supervisor_owner=1
    test -f "$hook" && test ! -L "$hook" && test "$(stat -c '%u:%g:%a:%h' "$hook")" = 0:0:700:1 || fail 'Unsafe runtime boot hook'
    retries=0
    record_failure() {
      report=$(mktemp "$config/supervisor-report.XXXXXX")
      { date -u '+%Y-%m-%dT%H:%M:%SZ'; printf 'exit=%s action=%s\\n' "$status" "$cycle"; dd if="$gate_error" bs=1 count=4096 2>/dev/null; } > "$report"
      test ! -d "$config/supervisor.last-error" || fail 'Unsafe supervisor diagnostic path'
      mv -f "$report" "$config/supervisor.last-error"
    }
    while test -f "$config/runtime-enabled"; do
      # Only requests present before this gate may use its observation. A new
      # transaction can run between the child releasing install.lock and our
      # receipt publication; it must wait for the next complete gate.
      set -- "$config"/supervisor-start.*
      cycle=cycle
      test "$retries" -lt 5 || cycle=watch
      gate_error=$(mktemp "$config/supervisor-error.XXXXXX")
      if observation=$(timeout -k 5 300 "$hook" "$cycle" 8>&- 2>"$gate_error"); then
        rm -f "$gate_error"
        case "$observation" in
          started) retries=$((retries + 1)) ;;
          running) retries=0 ;;
          disabled) exit 0 ;;
          *) fail 'Invalid runtime supervisor observation' ;;
        esac
        ${wagoRuntimeSupervisorAcknowledgeShell()}
      else
        status=$?
        record_failure
        rm -f "$gate_error"
        if test "$status" = 75; then
          # The other transaction owns the writer. Never stop it on lock contention.
          sleep 2
        else
          # A timed-out child may not have run its trap. Verify OFF before retrying.
          contain_supervisor_failure || fail 'Runtime supervisor containment unverified; recovery required'
          # Retry only through a new complete hardware gate. Keep crash loops bounded
          # to five starts per burst, with a cooldown rather than permanent disablement.
          sleep 30
          retries=0
        fi
        continue
      fi
      sleep 2
    done
    exit 0 ;;
  start|stop)
    ${wagoShellFilesystemGuard()}
    test -f "$hook" && test ! -L "$hook" && test "$(stat -c '%u:%g:%a:%h' "$hook")" = 0:0:700:1 || fail 'Unsafe runtime boot hook'
    exec 9>&-
    supervisor_owner=1
    # Bound the complete gate, including host /proc and filesystem observations.
    # The outer owner contains a timeout even if the child cannot run its trap.
    if timeout -k 5 300 "$hook" "$action-checked"; then
      if test "$action" = start; then
        # Readiness runs a second full gate. Its 330s acknowledgement and 300s
        # lock-reacquisition budgets must not be nested in the first gate's 300s.
        # A transaction queued on install.lock can take it as the child releases it.
        # Containment would need that lock too, so never stop its writer: hand the
        # started runtime to a detached supervisor, which waits out contention.
        fail() {
          echo "$*" >&2
          case "$*" in 'Another runtime transaction holds the controller lock')
            supervisor_owner=0
            nohup "$hook" supervise </dev/null >/dev/null 2>&1 9>&- &
            exit 75 ;;
          esac
          exit 1
        }
        ${wagoShellFilesystemGuard()}
        ${wagoRuntimeSupervisorLaunchShell()}
      fi
      exit 0
    else
      status=$?
      # A transaction may acquire the lock between the outer check and child.
      # Contention never authorizes stopping its writer after it releases it.
      test "$status" != 75 || supervisor_owner=0
      exit "$status"
    fi ;;
  start-checked) action=start ;;
  stop-checked) action=stop ;;
  cycle|watch) ;;
  *) fail 'Invalid runtime lifecycle action' ;;
esac
# Lock contention belongs to another transaction. A supervisor retries it,
# without stopping that transaction's runtime or opening a second writer.
fail() {
  echo "$*" >&2
  case "$*" in 'Another runtime transaction holds the controller lock') exit 75 ;; esac
  exit 1
}
${wagoShellFilesystemGuard()}
if test "$action" = stop; then
  rm -f "$config/runtime-enabled"
  contain_runtime || fail 'Runtime stop unverified; recovery required'
  exit 0
fi
if test ! -e "$config/runtime-enabled" && test ! -L "$config/runtime-enabled"; then
  case "$action" in cycle|watch) echo disabled ;; esac
  exit 0
fi
may_stop=1
command -v nohup >/dev/null || fail 'Runtime supervisor launcher unavailable'
test -f "$config/runtime-enabled" && test ! -L "$config/runtime-enabled" && test "$(stat -c '%u:%g:%a:%h' "$config/runtime-enabled")" = 0:0:600:1 || fail 'Invalid runtime enablement'
${wagoFw31IdentityCheck(true)} || fail 'unsupported-firmware'
# Wait for the vendor daemon; no network downloads, host restarts or infinite retry.
attempt=0
until docker info >/dev/null 2>&1; do
  attempt=$((attempt + 1)); test "$attempt" -lt 15 || fail 'docker-start-timeout'
  sleep 2
done
# hardwareOwnership below checks host writers immediately before granting IO;
# the complete post-grant preflight checks them again before starting a writer.
# Do not add a third identical scan before those two required boundaries.
${checks(testRoot, true, false)}
[ "$exclusivity" = clear ] || fail "$exclusivity"
${hardwareOwnership()}
${wagoHardwareDeploymentPreflightScript(testRoot, true, profile)}
test "$(docker inspect --format '{{.HostConfig.RestartPolicy.Name}}' attraccess-wago)" = no || fail 'Invalid runtime restart policy'
running=$(docker inspect --format '{{.State.Running}}' attraccess-wago) || fail 'Cannot observe runtime'
case "$running" in
  false)
    test "$action" != watch || fail 'Runtime crash retry limit reached'
    docker start attraccess-wago >/dev/null || fail 'runtime-start-failed'
    test "$(docker inspect --format '{{.State.Running}}' attraccess-wago)" = true || fail 'Runtime start unverified'
    observation=started ;;
  true) observation=running ;;
  *) fail 'Invalid runtime state' ;;
esac
if test "$action" = start; then
  # The outer start action performs the separately bounded supervisor handoff.
  :
else
  echo "$observation"
fi
`;
}

/** A missing daemon is not evidence that its container/shim has stopped. */
function runtimeContainment(): string {
  return `contain_runtime() {
  containment_commands=0
  docker update --restart=no attraccess-wago >/dev/null 2>&1 || containment_commands=1
  docker stop attraccess-wago >/dev/null 2>&1 || containment_commands=1
  if test "$containment_commands" = 0; then
    test "$(docker inspect --format '{{.State.Running}} {{.HostConfig.RestartPolicy.Name}}' attraccess-wago)" = 'false no' || return 1
  else
    # A verified absence is the only successful result when the target did not
    # accept stop. Daemon unavailability/list errors leave containment unknown.
    owned=$(docker container ls -a --no-trunc --filter name=^/attraccess-wago$ --format '{{.ID}}') || return 1
    test -z "$owned" || return 1
  fi
}`;
}

/** confirmInstall authorizes destructive controller preparation, including active PLCs.
 * Only the firmware-installed vendor components are used; no package is downloaded.
 * The journal records ownership/retry state, never promises restoration of old workloads.
 */
export function wagoCommissioningPreparationScript(
  token: string,
  testRoot = '',
  profile: Cc100HardwareProfile = WAGO_HARDWARE_PROFILE,
): string {
  return `${provisionLock(token, testRoot)}
${checks(testRoot)}
[ "$platform" = supported ] || fail "$platform"
case "$provision" in prepare-controller|install-vendor-runtime) ;; *) fail "$provision" ;; esac
command -v timeout >/dev/null || fail 'bounded-vendor-command-unavailable'
case "$hardware" in accessible|uid10001-access-denied) ;; *) fail "$hardware" ;; esac
${profile === CC100_MODBUS_PROFILE_ID ? wagoSerialDeploymentPreflight() : ''}
test -f "$root/etc/specific/rtsversion" && test ! -L "$root/etc/specific/rtsversion" || fail 'Invalid runtime selection'
if test -e "$journal" || test -L "$journal"; then
  test -d "$journal" && test ! -L "$journal" || fail 'Invalid Docker provisioning journal'
  test -f "$journal/mode" && test "$(cat "$journal/mode")" = destructive || fail 'Legacy provisioning recovery required'
  test -f "$journal/token" && test ! -L "$journal/token" && test "$(cat "$journal/token")" = "$token" || fail 'Docker provisioning token mismatch'
  test ! -e "$journal/restored" || fail 'Acknowledge previous preparation recovery'
else
  stage=$(mktemp -d "$config/prepare-stage.XXXXXX")
  trap 'rm -rf "$stage"' EXIT
  trap 'exit 130' HUP INT TERM
  printf '%s\\n' "$token" > "$stage/token"
  printf '%s\\n' destructive > "$stage/mode"
  mv "$stage" "$journal"
  trap - EXIT HUP INT TERM
fi
rm -f "$config/runtime-enabled" "$journal/started"
touch "$journal/start-intent"
${runtimeContainment()}
boot_stage=
trap 'status=$?; trap - EXIT; test -z "$boot_stage" || rm -f "$boot_stage"; if test "$status" -ne 0; then contain_runtime || echo "Runtime containment unverified; recovery required" >&2; fi; exit "$status"' EXIT
trap 'exit 130' HUP INT TERM
if docker info >/dev/null 2>&1; then
  contain_runtime || fail 'Cannot verify previous runtime containment'
fi
# The FW31 init has no status command. Explicit stop covers an active process
# even when runtime selection is already 0; the selection override is vendor API.
timeout -k 5 30 "$root/etc/init.d/runtime" stop 1 >/dev/null 2>&1 || fail 'codesys-stop-failed'
timeout -k 5 30 "$root/etc/init.d/runtime" stop 2 >/dev/null 2>&1 || fail 'codesys-stop-failed'
${codesysStopped()}
timeout -k 5 45 "$root/etc/config-tools/config_runtime" --wait runtime-version=0 force-new-version=yes restart-server=NO >/dev/null 2>&1 || fail 'codesys-disable-failed'
${codesysDisabled()}
sync || fail 'Controller persistence flush failed'
${codesysDisabled()}
# Vendor install is a supported activation preparation using present binaries.
if [ "$provision" = install-vendor-runtime ]; then
  boot_medium=$(timeout -k 5 10 "$root/etc/config-tools/get_filesystem_data" active-partition-medium) || fail 'Cannot verify Docker boot medium'
  case "$boot_medium" in ''|sd-card) fail 'Unsupported Docker boot medium' ;; esac
  timeout -k 5 45 "$root/etc/config-tools/config_docker" install >/dev/null 2>&1 || fail 'docker-install-failed'
fi
if ! docker info >/dev/null 2>&1 || { test ! -e "$root/etc/rc.d/S99_docker" && test ! -L "$root/etc/rc.d/S99_docker"; }; then
  boot_medium=$(timeout -k 5 10 "$root/etc/config-tools/get_filesystem_data" active-partition-medium) || fail 'Cannot verify Docker boot medium'
  case "$boot_medium" in ''|sd-card) fail 'Unsupported Docker boot medium' ;; esac
  timeout -k 5 45 "$root/etc/config-tools/config_docker" activate >/dev/null 2>&1 || fail 'docker-activation-failed'
fi
test -e "$root/etc/rc.d/S99_docker" && test -x "$root/etc/rc.d/S99_docker" || fail 'docker-boot-not-enabled'
test "$(readlink -f "$root/etc/rc.d/S99_docker")" = "$root/etc/init.d/dockerd" || fail 'docker-boot-unverified'
test "$(timeout -k 5 10 "$root/etc/config-tools/get_docker_config" activation-status)" = active || fail 'docker-activation-unverified'
docker info >/dev/null 2>&1 || fail 'docker-start-timeout'
test "$(docker version --format '{{.Server.Version}}')" = 25.0.4 || fail 'Unsupported firmware Docker version'
# Existing Attraccess is an owned predecessor, but may have unsafe auto-start
# settings. Disable and stop it before changing any hardware ownership.
containers=$(docker container ls -a --no-trunc --format '{{.ID}}') || fail 'Cannot inspect Docker workloads'
for container in $containers; do
  name=$(docker inspect --format '{{.Name}}' "$container") || fail 'Cannot inspect Docker workload'
  if [ "$name" = /attraccess-wago ]; then
    docker update --restart=no "$container" >/dev/null || fail 'Cannot disable previous runtime'
    docker stop "$container" >/dev/null || fail 'Cannot stop previous runtime'
    test "$(docker inspect --format '{{.State.Running}} {{.HostConfig.RestartPolicy.Name}}' "$container")" = 'false no' || fail 'Previous runtime stop unverified'
  fi
done
${checks(testRoot)}
[ "$exclusivity" = clear ] || fail "$exclusivity"
${hardwareOwnership()}
${wagoHardwareDeploymentPreflightScript(testRoot, true, profile)}
test ! -L "$root/etc/rc.d/S99_zz_attraccess_wago" || fail 'Invalid runtime boot hook'
wago_require_root_directory "$root/etc/rc.d" || fail 'Unsafe boot directory'
boot_stage=$(mktemp "$root/etc/rc.d/.attraccess-wago-stage.XXXXXX")
cat > "$boot_stage" <<'ATTRACCESS_BOOT'
${wagoRuntimeBootScript(testRoot, profile)}ATTRACCESS_BOOT
chmod 0700 "$boot_stage"
test -f "$boot_stage" && test ! -L "$boot_stage" && test "$(stat -c '%u:%g:%a:%h' "$boot_stage")" = 0:0:700:1 || fail 'Unsafe runtime boot staging'
mv -f "$boot_stage" "$root/etc/rc.d/S99_zz_attraccess_wago"
touch "$journal/started"
trap - EXIT HUP INT TERM
echo 'docker-provision=started'
`;
}

export function wagoDockerProvisionScript(review: WagoDockerProvisionReview, testRoot = ''): string {
  if (review.reviewedDockerActivation !== true || review.action !== 'start-installed-runtime')
    throw new Error('Explicit reviewedDockerActivation and start-installed-runtime action required');
  return wagoCommissioningPreparationScript(review.token, testRoot);
}

/** Cleanup is containment, not restoration of vendor networking or old PLC state.
 * Legacy journals retain token/recorded-context integrity checks, but no longer
 * block solely because a vendor networking event cannot be rolled back.
 */
function dockerRecoveryHelpers(): string {
  return `
unset DOCKER_HOST DOCKER_CONTEXT DOCKER_TLS_VERIFY DOCKER_CERT_PATH
export DOCKER_HOST=unix:///var/run/docker.sock
docker_cli=$(command -v docker) || fail 'Docker command unavailable for recovery'
docker() { timeout -k 5 10 "$docker_cli" --host unix:///var/run/docker.sock "$@"; }
completed="$config/docker-provision.completed-$token"
${runtimeContainment()}
validate_journal() {
  test -d "$journal" && test ! -L "$journal" || fail 'Invalid Docker provisioning journal'
  test -f "$journal/token" && test ! -L "$journal/token" && test "$(cat "$journal/token")" = "$token" || fail 'Docker provisioning token mismatch'
  if test -e "$journal/mode" || test -L "$journal/mode"; then
    test -f "$journal/mode" && test ! -L "$journal/mode" && test "$(cat "$journal/mode")" = destructive || fail 'Invalid preparation journal mode'
  else
    test -f "$journal/prior" && test ! -L "$journal/prior" && test "$(cat "$journal/prior")" = stopped || fail 'Invalid legacy provisioning journal'
    if test -e "$journal/os-release" || test -L "$journal/os-release" || test -e "$journal/dockerd" || test -L "$journal/dockerd"; then
      for name in os-release dockerd; do
        test -f "$journal/$name" && test ! -L "$journal/$name" || fail 'Incomplete firmware/service context; recovery retained'
      done
      cmp -s "$root/etc/os-release" "$journal/os-release" || fail 'Firmware changed; recovery retained'
      cmp -s "$root/etc/init.d/dockerd" "$journal/dockerd" || fail 'Docker service changed; recovery retained'
    fi
  fi
}
completed_recovery() {
  test -d "$completed" && test ! -L "$completed" || return 1
  test -f "$completed/token" && test ! -L "$completed/token" && test "$(cat "$completed/token")" = "$token" &&
    test -f "$completed/mode" && test ! -L "$completed/mode" && test "$(cat "$completed/mode")" = destructive &&
    test -f "$completed/restored" && test ! -L "$completed/restored" || fail 'Invalid preparation recovery receipt'
}
`;
}

export function wagoDockerProvisionRecoveryScript(token: string, testRoot = ''): string {
  return `${provisionLock(token, testRoot)}
${dockerRecoveryHelpers()}
if test ! -e "$journal" && test ! -L "$journal"; then
  if completed_recovery; then echo 'docker-provision=contained'; exit 0; fi
  # Preparation records its journal before any mutation. A missing journal is
  # therefore a preflight-only failure, or a completed tokened cleanup.
  test ! -e "$completed" && test ! -L "$completed" || fail 'Conflicting preparation receipt'
  stage=$(mktemp -d "$config/prepare-recovery-stage.XXXXXX")
  trap 'rm -rf "$stage"' EXIT
  trap 'exit 130' HUP INT TERM
  printf '%s\\n' "$token" > "$stage/token"
  printf '%s\\n' destructive > "$stage/mode"
  touch "$stage/restored"
  mv "$stage" "$journal"
  trap - EXIT HUP INT TERM
  echo 'docker-provision=contained'; exit 0
fi
validate_journal
printf '%s\\n' destructive > "$journal/mode"
rm -f "$config/runtime-enabled"
contain_runtime || fail 'Cannot verify runtime containment; Docker recovery required'
touch "$journal/restored"
echo 'docker-provision=contained'
`;
}

/** A durable tokened receipt makes lost SSH responses / coordinator saves retryable. */
export function wagoDockerProvisionFinishScript(
  token: string,
  outcome: 'accepted' | 'restored',
  testRoot = '',
): string {
  if (outcome !== 'accepted' && outcome !== 'restored') throw new Error('Invalid provisioning outcome');
  return `${provisionLock(token, testRoot)}
${dockerRecoveryHelpers()}
if test ! -e "$journal" && test ! -L "$journal"; then
  ${outcome === 'restored' ? `completed_recovery || fail 'No preparation recovery receipt'` : `test -d "$completed" && test ! -L "$completed" && test -f "$completed/token" && test ! -L "$completed/token" && test "$(cat "$completed/token")" = "$token" && test -f "$completed/accepted" || fail 'No preparation acceptance receipt'`}
  exit 0
fi
validate_journal
test -f "$journal/${outcome === 'accepted' ? 'started' : 'restored'}" && test ! -L "$journal/${outcome === 'accepted' ? 'started' : 'restored'}" || fail 'Preparation outcome not verified'
${
  outcome === 'accepted'
    ? `test ! -e "$journal/restored" || fail 'Preparation was recovered'
${wagoHardwareDeploymentPreflightScript(testRoot)}
touch "$journal/accepted"`
    : ''
}
printf '%s\\n' destructive > "$journal/mode"
test ! -e "$completed" && test ! -L "$completed" || fail 'Conflicting preparation completion receipt'
mv "$journal" "$completed"
`;
}
