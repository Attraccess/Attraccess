import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { runtimeBundleAcceptScript } from './wago-runtime-install';
import type { DestructiveRuntimeShellTransactionAndOfflineStreamFixturesTestScope } from './wago-runtime-install.spec';
import { rmSync } from 'node:fs';
import { runtimeBundleRecoveryScript } from './wago-runtime-install';
import { WAGO_DOUT } from './wago-hardware-deployment';
import { statSync } from 'node:fs';
import { chmodSync } from 'node:fs';
import { symlinkSync } from 'node:fs';
import { runtimeBundleInstallScript } from './wago-runtime-install';
import { runtimeBundleRecoveryAcknowledgementScript } from './wago-runtime-install';

export function registerAcceptsExplicitlyPreservesActiveTrustAndSupportsANewDestructiveEnrollment(
  scope: DestructiveRuntimeShellTransactionAndOfflineStreamFixturesTestScope,
): void {
  it('accepts explicitly, preserves active trust and supports a new destructive enrollment', () => {
    scope.fixture.file(scope.config + '/runtime-ca.pem.next', 'public CA');
    expect(scope.install().status).toBe(0);
    expect(scope.fixture.run(runtimeBundleAcceptScript(scope.fixture.root)).status).toBe(0);
    expect(existsSync(join(scope.fixture.root, scope.tx))).toBe(false);
    expect(scope.fixture.read(scope.config + '/runtime-ca.pem')).toBe('public CA');
    scope.fixture.file(scope.config + '/runtime.env.next', 'NEW=second');
    expect(scope.install().status).toBe(0);
    expect(scope.fixture.containers()).toHaveLength(1);
  });
}

export function registerAllowsASlowFirmwareImageImportToCompleteBeforeStartingTheRuntime(
  scope: DestructiveRuntimeShellTransactionAndOfflineStreamFixturesTestScope,
): void {
  it('allows a slow firmware image import to complete before starting the runtime', () => {
    // The real FW31 device takes 56 seconds even with the image already cached.
    scope.fixture.file('docker-load-seconds', '90');
    expect(scope.install().status).toBe(0);
    expect(scope.fixture.containers()).toEqual([
      expect.objectContaining({ name: 'attraccess-wago', running: true, restart: 'no' }),
    ]);
  });
}

export function registerContainsSFailuresWithoutRestoringOldWorkloads(
  scope: DestructiveRuntimeShellTransactionAndOfflineStreamFixturesTestScope,
): void {
  it.each(['load', 'inspect-image', 'start', 'supervisor-launch-failed'])(
    'contains %s failures without restoring old workloads',
    (fault) => {
      scope.prior();
      expect(scope.install(fault).status).not.toBe(0);
      expect(scope.fixture.containers()).toEqual([]);
      expect(existsSync(join(scope.fixture.root, scope.config, 'runtime-enabled'))).toBe(false);
      expect(existsSync(join(scope.fixture.root, scope.data))).toBe(false);
      expect(existsSync(join(scope.fixture.root, scope.tx))).toBe(false);
    },
  );
}

export function registerContainsValidLegacyTransactionsWithoutRestoringTheirPriorContainerOrData(
  scope: DestructiveRuntimeShellTransactionAndOfflineStreamFixturesTestScope,
): void {
  it('contains valid legacy transactions without restoring their prior container or data', () => {
    scope.fixture.file(scope.tx + '/prepared', '');
    scope.fixture.file(scope.tx + '/old-id', 'old-id\n');
    scope.fixture.file(scope.tx + '/new-container', '');
    scope.fixture.file(scope.tx + '/data-changing', '');
    for (const name of ['old-running', 'had-data', 'had-env', 'had-ca'])
      scope.fixture.file(scope.tx + '/' + name, 'true');
    scope.fixture.file(scope.tx + '/data.previous/credentials.json', 'old fixture identity');
    scope.fixture.setContainers([{ id: 'old-id', name: 'attraccess-wago.previous', running: false }]);
    expect(scope.recover().status).toBe(0);
    expect(scope.fixture.containers()).toEqual([]);
    expect(existsSync(join(scope.fixture.root, scope.data))).toBe(false);
  });
}

export function registerDiscardsTheOldOwnedContainerAndCredentialsRatherThanBackingUpOrRestartingThem(
  scope: DestructiveRuntimeShellTransactionAndOfflineStreamFixturesTestScope,
): void {
  it('discards the old owned container and credentials rather than backing up or restarting them', () => {
    scope.prior();
    expect(scope.install().status).toBe(0);
    expect(scope.fixture.containers().map((c) => c.id)).toEqual(['new-id']);
    expect(existsSync(join(scope.fixture.root, scope.data, 'credentials.json'))).toBe(false);
    expect(existsSync(join(scope.fixture.root, scope.tx, 'data.previous'))).toBe(false);
    expect(existsSync(join(scope.fixture.root, scope.config, 'runtime.env.previous'))).toBe(false);
    expect(scope.recover().status).toBe(0);
    expect(scope.fixture.containers()).toEqual([]);
    expect(existsSync(join(scope.fixture.root, scope.data))).toBe(false);
    expect(existsSync(join(scope.fixture.root, scope.config, 'runtime-enabled'))).toBe(false);
    expect(scope.fixture.read('docker.log')).not.toMatch(/^start old-id/m);
  });
}

export function registerDoesNotInstallASOfflineBundle(
  scope: DestructiveRuntimeShellTransactionAndOfflineStreamFixturesTestScope,
): void {
  it.each(['truncated', 'corrupt'])('does not install a %s offline bundle', (fault) => {
    rmSync(join(scope.fixture.root, scope.config, 'runtime.env.next'));
    const { bundle, script } = scope.delivery();
    const bytes = fault === 'truncated' ? bundle.subarray(1) : Buffer.from(bundle);
    if (fault === 'corrupt') bytes[bytes.length - 1] ^= 1;
    expect(scope.fixture.run(script, '', bytes).status).not.toBe(0);
    expect(scope.fixture.containers()).toEqual([]);
    expect(scope.fixture.run(runtimeBundleRecoveryScript(scope.fixture.root, scope.token)).status).toBe(0);
  });
}

export function registerFailsBeforeDiscardingAPredecessorIfFirmwareHardwareOrTheBootGateIsUnavailable(
  scope: DestructiveRuntimeShellTransactionAndOfflineStreamFixturesTestScope,
): void {
  it('fails before discarding a predecessor if firmware, hardware or the boot gate is unavailable', () => {
    scope.prior();
    expect(scope.install('io-permissions').stderr).toContain('uid10001-access-denied');
    rmSync(join(scope.fixture.root, WAGO_DOUT));
    expect(scope.install().stderr).toContain('missing-register');
    expect(scope.fixture.containers()[0].running).toBe(true);
    expect(existsSync(join(scope.fixture.root, scope.tx))).toBe(false);
  });
}

export function registerInstallsAFreshRuntimeWithAutomaticDockerRestartsDisabledAndGatedBootRetainingRecoveryO(
  scope: DestructiveRuntimeShellTransactionAndOfflineStreamFixturesTestScope,
): void {
  it('installs a fresh runtime with automatic Docker restarts disabled and gated boot, retaining recovery ownership', () => {
    const r = scope.install();
    expect(r.status).toBe(0);
    expect(scope.fixture.containers()).toEqual([
      expect.objectContaining({ name: 'attraccess-wago', running: true, restart: 'no' }),
    ]);
    expect(scope.fixture.read('docker.log')).toContain('--network host');
    expect(scope.fixture.read(scope.config + '/runtime.env')).toBe('NEW=enrollment');
    expect(statSync(join(scope.fixture.root, scope.config, 'runtime.env')).mode & 0o777).toBe(0o600);
    expect(existsSync(join(scope.fixture.root, scope.config, 'runtime-enabled'))).toBe(true);
    expect(existsSync(join(scope.fixture.root, scope.tx, 'started'))).toBe(true);
  });
}

export function registerInstallsTheRtuReleaseWithOnlyTheCc100SerialDeviceAndItsExistingGroup(
  scope: DestructiveRuntimeShellTransactionAndOfflineStreamFixturesTestScope,
): void {
  it('installs the RTU release with only the CC100 serial device and its existing group', () => {
    scope.fixture.file('dev/ttySTM1', 'isolated character-device stand-in', 0o660);
    chmodSync(join(scope.fixture.root, 'dev/ttySTM1'), 0o660);
    symlinkSync(join(scope.fixture.root, 'dev/ttySTM1'), join(scope.fixture.root, 'dev/serial'));
    scope.fixture.file('sys/class/tty/ttySTM1/device/of_node/linux,rs485-enabled-at-boot-time', '');
    scope.fixture.file('etc/group', scope.fixture.read('etc/group') + 'dialout:x:106:\n');
    scope.fixture.file(
      'owners.json',
      JSON.stringify({
        ...JSON.parse(scope.fixture.read('owners.json')),
        '/dev/ttySTM1': '0:106',
      }),
    );
    // Exercise the generated shell; only the isolated device's character type is synthetic.
    const characterDevice = `test() {
      if [ "$1" = -c ] && [ "$2" = "$FIXTURE_ROOT/dev/ttySTM1" ]; then command test -f "$2";
      else command test "$@"; fi
    }\n`;
    const result = scope.fixture.run(
      characterDevice +
        runtimeBundleInstallScript(scope.image, scope.fixture.root, 'cc100-751-9301-fw31-digital-rtu-v1'),
    );
    expect({ status: result.status, stderr: result.stderr }).toEqual({ status: 0, stderr: '' });
    expect(scope.fixture.read('docker.log')).toContain(`--device ${scope.fixture.root}/dev/ttySTM1:/dev/serial:rw`);
    expect(scope.fixture.read('docker.log')).toContain('--group-add 106');
    expect(scope.fixture.read('docker.log')).toContain('WAGO_HARDWARE_PROFILE=cc100-751-9301-fw31-digital-rtu-v1');
    expect(scope.fixture.read('docker.log')).not.toContain('--privileged');
  });
}

export function registerProtectsTheFixedCaOutsideWritableStateAndDiscardsItOnFailedEnrollment(
  scope: DestructiveRuntimeShellTransactionAndOfflineStreamFixturesTestScope,
): void {
  it('protects the fixed CA outside writable state and discards it on failed enrollment', () => {
    scope.prior();
    scope.fixture.file(scope.config + '/runtime-ca.pem.next', 'new public CA');
    expect(scope.install().status).toBe(0);
    expect(scope.fixture.read(scope.config + '/runtime-ca.pem')).toBe('new public CA');
    expect(statSync(join(scope.fixture.root, scope.config)).mode & 0o777).toBe(0o700);
    expect(statSync(join(scope.fixture.root, scope.config, 'runtime-ca.pem')).mode & 0o777).toBe(0o444);
    expect(scope.fixture.read('docker.log')).toContain(
      scope.config + '/runtime-ca.pem:/var/lib/attraccess-wago/mqtt-ca.pem:ro',
    );
    expect(scope.recover().status).toBe(0);
    expect(existsSync(join(scope.fixture.root, scope.config, 'runtime-ca.pem'))).toBe(false);
  });
}

export function registerPublishesRecoveryOwnershipAtomicallyWhenInterruptedBeforeTheReceiptRename(
  scope: DestructiveRuntimeShellTransactionAndOfflineStreamFixturesTestScope,
): void {
  it('publishes recovery ownership atomically when interrupted before the receipt rename', () => {
    rmSync(join(scope.fixture.root, scope.config, 'runtime.env.next'));
    scope.fixture.file(scope.config + '/docker-provision/token', scope.token);
    scope.fixture.file(scope.config + '/docker-provision/mode', 'destructive');
    rmSync(join(scope.fixture.root, 'bin/mv'));
    scope.fixture.file(
      'bin/mv',
      `#!${process.execPath}
const args = process.argv.slice(2);
if (process.env.FAULT === 'publish-interrupted' && args.at(-1).endsWith('install-transaction.restored')) {
  process.kill(process.ppid, 'SIGTERM'); process.exit(0);
}
const result = require('node:child_process').spawnSync('/bin/mv', args, { stdio: 'inherit' });
process.exit(result.status ?? 1);
`,
      0o700,
    );
    expect(
      scope.fixture.run(runtimeBundleRecoveryScript(scope.fixture.root, scope.token), 'publish-interrupted').status,
    ).not.toBe(0);
    expect(existsSync(join(scope.fixture.root, scope.tx + '.restored'))).toBe(false);
    expect(scope.fixture.run(runtimeBundleRecoveryScript(scope.fixture.root, scope.token)).status).toBe(0);
  });
}

export function registerRecoversInterruptionBeforeTheUploadJournalExistsUsingExactPreparationOwnership(
  scope: DestructiveRuntimeShellTransactionAndOfflineStreamFixturesTestScope,
): void {
  it('recovers interruption before the upload journal exists using exact preparation ownership', () => {
    rmSync(join(scope.fixture.root, scope.config, 'runtime.env.next'));
    scope.fixture.file(scope.config + '/docker-provision/token', scope.token);
    scope.fixture.file(scope.config + '/docker-provision/mode', 'destructive');
    expect(scope.fixture.run(runtimeBundleRecoveryScript(scope.fixture.root, scope.token)).status).toBe(0);
    expect(scope.fixture.read(scope.tx + '.restored/token')).toBe(scope.token + '\n');
    expect(scope.fixture.run(runtimeBundleRecoveryAcknowledgementScript(scope.fixture.root, scope.token)).status).toBe(
      0,
    );
    expect(scope.fixture.run(runtimeBundleRecoveryScript(scope.fixture.root, scope.token)).status).toBe(0);
    expect(scope.fixture.run(runtimeBundleRecoveryScript(scope.fixture.root, 'b'.repeat(32))).status).not.toBe(0);
  });
}

export function registerRejectsAWrongEmbeddedImageReferenceBeforeDiscardingExistingState(
  scope: DestructiveRuntimeShellTransactionAndOfflineStreamFixturesTestScope,
): void {
  it('rejects a wrong embedded image reference before discarding existing state', () => {
    scope.prior();
    expect(
      scope.fixture.run(runtimeBundleInstallScript('other.invalid/image@sha256:' + 'b'.repeat(64), scope.fixture.root))
        .stderr,
    ).toContain('image reference mismatch');
    expect(scope.fixture.containers()[0].id).toBe('old-id');
    expect(scope.fixture.read(scope.data + '/credentials.json')).toBe('revoked-old-fixture-credentials');
  });
}

export function registerRejectsAnRtuReleaseBeforeReplacingTheCurrentRuntimeWhenItsSerialDeviceIsMissing(
  scope: DestructiveRuntimeShellTransactionAndOfflineStreamFixturesTestScope,
): void {
  it('rejects an RTU release before replacing the current runtime when its serial device is missing', () => {
    scope.prior();
    const result = scope.fixture.run(
      runtimeBundleInstallScript(scope.image, scope.fixture.root, 'cc100-751-9301-fw31-digital-rtu-v1'),
    );
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('serial device');
    expect(scope.fixture.containers()[0].id).toBe('old-id');
    expect(existsSync(join(scope.fixture.root, scope.tx))).toBe(false);
  });
}

export function registerRejectsAnUntrustedPreparationJournalBeforeUsingItsRecoveryOwnership(
  scope: DestructiveRuntimeShellTransactionAndOfflineStreamFixturesTestScope,
): void {
  it('rejects an untrusted preparation journal before using its recovery ownership', () => {
    scope.fixture.file(scope.config + '/docker-provision/token', scope.token);
    scope.fixture.file(scope.config + '/docker-provision/mode', 'destructive');
    scope.fixture.file(
      'owners.json',
      JSON.stringify({
        ...JSON.parse(scope.fixture.read('owners.json')),
        ['/' + scope.config + '/docker-provision']: '10001:10001',
      }),
    );
    const result = scope.fixture.run(runtimeBundleRecoveryScript(scope.fixture.root, scope.token));
    expect(result.stderr).toContain('Unsafe runtime journal ownership');
    expect(scope.fixture.read(scope.config + '/runtime.env.next')).toBe('NEW=enrollment');
    expect(existsSync(join(scope.fixture.root, scope.tx + '.restored'))).toBe(false);
  });
}

export function registerRequiresControllerPreparationAndRejectsANewlyActivePlc(
  scope: DestructiveRuntimeShellTransactionAndOfflineStreamFixturesTestScope,
): void {
  it('requires controller preparation and rejects a newly active PLC', () => {
    scope.fixture.file('plc', 'running');
    expect(scope.install().stderr).toContain('codesys-active');
    scope.fixture.file('plc', 'stopped');
    rmSync(join(scope.fixture.root, 'etc/rc.d/S99_zz_attraccess_wago'));
    expect(scope.install().stderr).toContain('Controller preparation required');
  });
}
