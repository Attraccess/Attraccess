import { preamble } from './wago-runtime-install.preamble';
import { quote } from './wago-runtime-install.bounded-docker.helpers';
import { bundleCapacityPreflightScript } from './wago-runtime-install.bounded-docker.helpers';

/** Stop and remove the failed owned runtime without restoring previous workloads. */
export function runtimeBundleRecoveryScript(testRoot = '', token?: string): string {
  if (token && !/^[a-f0-9]{32}$/.test(token)) throw new Error('Invalid delivery token');
  return `${preamble(testRoot, false, true)}
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

/** Before preparation: staging/tools only, with no Docker daemon query. */
export function runtimeBundleStagingCapacityPreflightScript(bytes: number, testRoot = ''): string {
  return bundleCapacityPreflightScript(bytes, testRoot, false);
}
