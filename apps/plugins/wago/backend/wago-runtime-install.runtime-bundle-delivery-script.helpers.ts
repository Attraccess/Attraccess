import { CC100_DIGITAL_PROFILE_ID } from '../shared/hardware-profile';
import type { Cc100HardwareProfile } from '../shared/hardware-profile';
import { preamble } from './wago-runtime-install.preamble';
import { quote } from './wago-runtime-install.bounded-docker.helpers';
import { installScript } from './wago-runtime-install.install-script';
import { wagoHardwareDeploymentPreflightScript } from './wago-hardware-deployment';
import { runtimeBundleCapacityPreflightScript } from './wago-runtime-install.bounded-docker.helpers';

/** Delivery still requires the exclusive hardware gate after preparation. */
export function runtimeBundlePreflightScript(
  bytes: number,
  testRoot = '',
  profile: Cc100HardwareProfile = CC100_DIGITAL_PROFILE_ID,
): string {
  return `${runtimeBundleCapacityPreflightScript(bytes, testRoot)}
${wagoHardwareDeploymentPreflightScript(testRoot, true, profile)}
`;
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
  profile: Cc100HardwareProfile = CC100_DIGITAL_PROFILE_ID,
): string {
  if (!Number.isSafeInteger(bytes) || bytes <= 0 || !/^[a-f0-9]{64}$/.test(digest) || !/^[a-f0-9]{32}$/.test(token))
    throw new Error('Invalid delivery metadata');
  return `${runtimeBundlePreflightScript(bytes, testRoot, profile)}
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
${installScript(image, testRoot, true, profile)}
rm -f "$root/tmp/attraccess-wago-runtime.tar"
rm -rf "$config/delivery"
`;
}

/**
 * The caller must verify the bundle checksum and manifest before uploading it
 * to /tmp/attraccess-wago-runtime.tar over pinned SSH. This script checks the
 * embedded reference against the selected release.
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
export function runtimeBundleInstallScript(
  image: string,
  testRoot = '',
  profile: Cc100HardwareProfile = CC100_DIGITAL_PROFILE_ID,
): string {
  return installScript(image, testRoot, false, profile);
}

/** Remove a restored receipt only after the coordinator saved the restoration outcome. */
export function runtimeBundleRecoveryAcknowledgementScript(testRoot: string, token: string): string {
  if (!/^[a-f0-9]{32}$/.test(token)) throw new Error('Invalid delivery token');
  return `${preamble(testRoot, false, true)}
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
