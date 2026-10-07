/** FW31 vendor lifecycle and narrow digital I/O deployment. Physical qualification is separate. */
import { CC100_MODBUS_PROFILE_ID, type Cc100HardwareProfile } from '../shared/hardware-profile';
import { wagoSerialDeploymentPreflight } from './wago-serial-deployment';
/** Newline-delimited key=value report, version 1. Values are fixed enums, never shell input.
 * A nonzero SSH exit is an invalid/incomplete report, not an unsupported controller.
 */
import { checks } from './wago-hardware-deployment.checks';
import { codesysDisabled } from './wago-hardware-deployment.codesys-disabled.helpers';
import { codesysStopped } from './wago-hardware-deployment.codesys-disabled.helpers';
import { hardwareOwnership } from './wago-hardware-deployment.codesys-disabled.helpers';
import { provisionLock } from './wago-hardware-deployment.codesys-disabled.helpers';
import { runtimeContainment } from './wago-hardware-deployment.root-value.helpers';
import { WagoDockerProvisionReview } from './wago-hardware-deployment.wago-docker-provision-review';
import { wagoHardwareDeploymentPreflightScript } from './wago-hardware-deployment.root-value.helpers';
import { WAGO_HARDWARE_PROFILE } from './wago-hardware-deployment.wago-hardware-profile';
import { wagoRuntimeBootScript } from './wago-runtime-boot';

export type { WagoHardwareDeploymentReport } from '../shared/commissioning';

/** confirmInstall authorizes destructive controller preparation, including active PLCs.
 * Only the firmware-installed vendor components are used; no package is downloaded.
 * The journal records ownership/retry state, never promises restoration of old workloads.
 */
export function wagoCommissioningPreparationScript(
  token: string,
  testRoot = '',
  profile: Cc100HardwareProfile = WAGO_HARDWARE_PROFILE,
): string {
  return `printf 'WAGO_PROGRESS=preparation-lock\\n'
${provisionLock(token, testRoot)}
printf 'WAGO_PROGRESS=preparation-inspect\\n'
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
printf 'WAGO_PROGRESS=preparation-codesys\\n'
timeout -k 5 30 "$root/etc/init.d/runtime" stop 1 >/dev/null 2>&1 || fail 'codesys-stop-failed'
timeout -k 5 30 "$root/etc/init.d/runtime" stop 2 >/dev/null 2>&1 || fail 'codesys-stop-failed'
${codesysStopped()}
timeout -k 5 45 "$root/etc/config-tools/config_runtime" --wait runtime-version=0 force-new-version=yes restart-server=NO >/dev/null 2>&1 || fail 'codesys-disable-failed'
${codesysDisabled()}
sync || fail 'Controller persistence flush failed'
${codesysDisabled()}
# Vendor install is a supported activation preparation using present binaries.
printf 'WAGO_PROGRESS=preparation-docker\\n'
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
printf 'WAGO_PROGRESS=preparation-io\\n'
${checks(testRoot)}
[ "$exclusivity" = clear ] || fail "$exclusivity"
printf 'WAGO_PROGRESS=preparation-permissions\\n'
${hardwareOwnership()}
printf 'WAGO_PROGRESS=preparation-final\\n'
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
printf 'WAGO_PROGRESS=preparation-ready\\n'
echo 'docker-provision=started'
`;
}

export function wagoDockerProvisionScript(review: WagoDockerProvisionReview, testRoot = ''): string {
  if (review.reviewedDockerActivation !== true || review.action !== 'start-installed-runtime')
    throw new Error('Explicit reviewedDockerActivation and start-installed-runtime action required');
  return wagoCommissioningPreparationScript(review.token, testRoot);
}

export { parseWagoHardwareDeploymentReport } from './wago-hardware-deployment.codesys-disabled.helpers';
export { WAGO_DIN } from './wago-hardware-deployment.state';
export { wagoDockerProvisionFinishScript } from './wago-hardware-deployment.root-value.helpers';
export { wagoDockerProvisionRecoveryScript } from './wago-hardware-deployment.root-value.helpers';
export { type WagoDockerProvisionReview } from './wago-hardware-deployment.wago-docker-provision-review';
export { WAGO_DOCKER_PROVISION_REVIEW_FLAG } from './wago-hardware-deployment.state';
export { WAGO_DOUT } from './wago-hardware-deployment.state';
export { wagoHardwareDeploymentDockerArgs } from './wago-hardware-deployment.root-value.helpers';
export { wagoHardwareDeploymentPreflightScript } from './wago-hardware-deployment.root-value.helpers';
export { wagoHardwareDeploymentReportScript } from './wago-hardware-deployment.root-value.helpers';
export { WAGO_HARDWARE_PROFILE } from './wago-hardware-deployment.wago-hardware-profile';
export { WAGO_RUN_LEDS } from './wago-hardware-deployment.state';
export { wagoRuntimeBootScript } from './wago-runtime-boot';
