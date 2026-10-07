import { quote } from './wago-hardware-deployment.codesys-disabled.helpers';
import { provisionLock } from './wago-hardware-deployment.codesys-disabled.helpers';
import { dockerRecoveryHelpers } from './wago-hardware-deployment.codesys-disabled.helpers';
import { CC100_MODBUS_PROFILE_ID } from '../shared/hardware-profile';
import { CC100_SERIAL_HOST_PATH } from '../shared/hardware-profile';
import { CC100_SERIAL_PATH } from '../shared/hardware-profile';
import { isCc100HardwareProfile } from '../shared/hardware-profile';
import type { Cc100HardwareProfile } from '../shared/hardware-profile';
import { WAGO_HARDWARE_PROFILE } from './wago-hardware-deployment.wago-hardware-profile';
import { WAGO_DIN } from './wago-hardware-deployment.state';
import { WAGO_DOUT } from './wago-hardware-deployment.state';
import { wagoSerialDeploymentPreflight } from './wago-serial-deployment';
import { checks } from './wago-hardware-deployment.checks';

export function rootValue(testRoot: string): string {
  if (testRoot && (!testRoot.startsWith('/') || testRoot === '/' || /[\n,]/.test(testRoot)))
    throw new Error('Test root must be an absolute isolated directory without commas');
  return quote(testRoot.replace(/\/$/, ''));
}
export /** A missing daemon is not evidence that its container/shim has stopped. */
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

/** A durable tokened receipt makes lost SSH responses / coordinator saves retryable. */
export function wagoDockerProvisionFinishScript(
  token: string,
  outcome: 'accepted' | 'restored',
  testRoot = '',
  helperParameters = false,
  locked = false,
): string {
  if (outcome !== 'accepted' && outcome !== 'restored') throw new Error('Invalid provisioning outcome');
  return `${provisionLock(token, testRoot, helperParameters, locked)}
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

export function wagoHardwareDeploymentReportScript(testRoot = ''): string {
  return `${checks(testRoot)}
qualification=required
case "$provision" in prepare-controller|install-vendor-runtime) qualification=software-supported ;; esac
printf 'version=1\\nplatform=%s\\nhardware=%s\\nexclusivity=%s\\ndocker=%s\\nconfigDocker=%s\\nprovision=%s\\nqualification=%s\\n' "$platform" "$hardware" "$exclusivity" "$docker_state" "$config_docker" "$provision" "$qualification"
`;
}
