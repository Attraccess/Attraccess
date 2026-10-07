import { wagoCodesysClassificationShell } from './wago-codesys-classification';
import { runtimeContainment } from './wago-hardware-deployment.root-value.helpers';
import { wagoHostIoGuardShell } from './wago-host-io-guard';
import { WAGO_DIN } from './wago-hardware-deployment.state';
import { WAGO_DOUT } from './wago-hardware-deployment.state';
import { WAGO_RUN_LEDS } from './wago-hardware-deployment.state';
import type { WagoHardwareDeploymentReport } from '../shared/commissioning';
import { wagoShellFilesystemGuard } from './wago-shell-filesystem';
import { rootValue } from './wago-hardware-deployment.root-value.helpers';

export /** Narrow ownership is reapplied to volatile sysfs files on every controller boot. */
function codesysStopped(): string {
  return `
${wagoCodesysClassificationShell()}
codesys_state=$(wago_codesys_classify) || fail 'Cannot verify CODESYS stopped'
case "$codesys_state" in inactive) ;; active) fail 'codesys-active' ;; *) fail 'Cannot verify CODESYS stopped' ;; esac
`;
}

export function codesysDisabled(): string {
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

export /** Cleanup is containment, not restoration of vendor networking or old PLC state.
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

export function hardwareOwnership(): string {
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
export function quote(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

export function provisionLock(token: string, testRoot: string, helperParameters = false, locked = false): string {
  if (!/^[a-f0-9]{32}$/.test(token)) throw new Error('Invalid provisioning token');
  return `set -eu
umask 077
root=${rootValue(testRoot)}
config="$root/etc/attraccess-wago"
journal="$config/docker-provision"
fail() { echo "$*" >&2; exit 1; }
 ${wagoShellFilesystemGuard({ waitForLock: true, acquireLock: !locked })}
 for path in "$root/var/lib/attraccess-wago-install-transaction" "$root/var/lib/attraccess-wago-install-transaction.cleanup" "$root/var/lib/attraccess-wago-install-transaction.restored" "$root/var/lib/attraccess-wago-install-transaction.accepted-cleanup" "$config/delivery" "$root/var/lib/attraccess-wago-update-transaction" "$root/var/lib"/attraccess-wago-update-cleanup-*; do
  test ! -e "$path" || fail 'Finish runtime delivery/recovery before Docker provisioning'
done
token=${helperParameters ? '"${token}"' : quote(token)}
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
