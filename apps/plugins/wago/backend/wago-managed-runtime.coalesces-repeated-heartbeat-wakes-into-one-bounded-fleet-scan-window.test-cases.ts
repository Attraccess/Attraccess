import type { ManagedEnrolmentAndDurableCredentialLifecycleTestScope } from './wago-managed-runtime.spec';
import { WagoManagedAccess } from './wago-managed-access.entity';
import { WagoDeviceOperation } from './wago-managed-access.entity';
import { managedSsh } from './wago-managed-ssh';
import { spawnSync } from 'node:child_process';
import { managedHostHelper } from './wago-managed-helper';
import { fw31ShellFixture } from './fixtures/fw31-shell-fixture';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { WAGO_DIN } from './wago-hardware-deployment';
import { WAGO_DOUT } from './wago-hardware-deployment';
import type { FixedManagedExecutorAndRecoveryProgramsTestScope } from './wago-managed-runtime.spec';
import { WagoController } from './wago-controller.entity';
import { WagoCommissioningSession } from './wago-commissioning-session.entity';
import { commissioningVerification } from './wago-commissioning-verification';
import { managedProvisionScript } from './wago-managed-provision';
import { managedCutoverScript } from './wago-managed-provision';
import { managedCommitScript } from './wago-managed-provision';
import { managedAccessWatchdog } from './wago-managed-provision';
import { generateManagementKey } from './wago-management-key';

export function registerCoalescesRepeatedHeartbeatWakesIntoOneBoundedFleetScanWindow(
  scope: ManagedEnrolmentAndDurableCredentialLifecycleTestScope,
): void {
  it('coalesces repeated heartbeat wakes into one bounded fleet scan window', async () => {
    const internals = scope.service as unknown as {
      scan(): Promise<void>;
      wake(): void;
      nextScanAt: number;
      scanning: boolean;
    };
    const deadline = Date.now() + 5000;
    while (internals.scanning && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 10));
    expect(internals.scanning).toBe(false);
    const scan = jest.spyOn(internals, 'scan').mockResolvedValue(undefined);
    internals.nextScanAt = 0;
    internals.wake();
    await new Promise(setImmediate);
    for (let count = 0; count < 50; count++) internals.wake();
    await new Promise(setImmediate);
    expect(scan).toHaveBeenCalledTimes(1);
    internals.nextScanAt = 0;
    internals.wake();
    await new Promise(setImmediate);
    expect(scan).toHaveBeenCalledTimes(2);
  });
}

export function registerDoesNotMutateRemotelyWhenEncryptionFailsOrReturnsPlaintext(
  scope: ManagedEnrolmentAndDurableCredentialLifecycleTestScope,
): void {
  it('does not mutate remotely when encryption fails or returns plaintext', async () => {
    scope.encrypt.mockImplementation((plaintext) => plaintext);
    const execute = jest.fn();
    await expect(scope.service.enrol(scope.session(), execute, new AbortController().signal)).rejects.toThrow(
      'encryption',
    );
    expect(execute).not.toHaveBeenCalled();
    expect(await scope.db.getRepository(WagoManagedAccess).count()).toBe(0);
  });
}

export function registerDoesNotResurrectRetirementRecordedWhileManagedAccessRetryAcquiresItsLease(
  scope: ManagedEnrolmentAndDurableCredentialLifecycleTestScope,
): void {
  it('does not resurrect retirement recorded while managed-access retry acquires its lease', async () => {
    await scope.service.enrol(scope.session(), async () => 'OK\n', new AbortController().signal);
    const operations = scope.service['operations'];
    const acquire = operations.acquire.bind(operations);
    jest.spyOn(operations, 'acquire').mockImplementation(async (...args) => {
      await scope.db.getRepository(WagoManagedAccess).update(1, { state: 'retiring' });
      return acquire(...args);
    });
    jest.mocked(managedSsh).mockClear();
    await expect(scope.service.retryAccess(1)).rejects.toThrow('cannot be retried');
    expect(jest.mocked(managedSsh)).not.toHaveBeenCalled();
    expect((await scope.service.sessionStatus(1)).management).toBe('retiring');
    expect(
      await scope.db.getRepository(WagoDeviceOperation).findOneBy({ fingerprint: scope.session().hostKeyFingerprint }),
    ).toMatchObject({ owner: null });
  });
}

export function registerExecutesAFullRepeatedImageUpdateThroughOnlyTheFixedDispatcherPreservingEnrolledStateS(
  scope: FixedManagedExecutorAndRecoveryProgramsTestScope,
): void {
  it.each(['native', 'terse'] as const)(
    'executes a full repeated image update through only the fixed dispatcher, preserving enrolled state (%s stat)',
    (statStyle) => {
      const fixture = fw31ShellFixture(statStyle);
      try {
        fixture.file('bin/id', '#!/bin/sh\necho 0\n', 0o700);
        fixture.file('etc/attraccess-wago/runtime.env', 'WAGO_MQTT_PASSWORD=permanent-fixture-secret');
        fixture.file('etc/attraccess-wago/runtime-enabled', '');
        fixture.file('etc/attraccess-wago/install.lock', '');
        fixture.file('var/lib/attraccess-wago/state.json', 'enrolled-state');
        fixture.file(
          'owners.json',
          JSON.stringify({ ...JSON.parse(fixture.read('owners.json')), '/var/lib/attraccess-wago': '10001:10001' }),
        );
        fixture.setContainers([
          {
            id: 'old-id',
            name: 'attraccess-wago',
            running: true,
            restart: 'no',
            imageId: `sha256:${'9'.repeat(64)}`,
            mounts: [fixture.root + WAGO_DIN, fixture.root + WAGO_DOUT],
          },
        ]);
        fixture.file('loaded-image-id', scope.artifact.imageId);
        fixture.file('bundle/image-reference', scope.artifact.image + '\n');
        fixture.file('bundle/image.tar', 'compressed image fixture');
        const file = join(fixture.root, 'tmp/update.tar');
        expect(
          spawnSync('/usr/bin/tar', ['-cf', file, '-C', join(fixture.root, 'bundle'), 'image-reference', 'image.tar'])
            .status,
        ).toBe(0);
        const bundle = readFileSync(file),
          digest = createHash('sha256').update(bundle).digest('hex');
        const helper = managedHostHelper(scope.artifact, fixture.root),
          token = '5'.repeat(32);
        const run = (header: string, bytes = Buffer.alloc(0)) =>
          fixture.run(helper, '', Buffer.concat([Buffer.from(header + '\n'), bytes]));
        const success = (result: ReturnType<typeof run>) =>
          expect({
            status: result.status,
            stderr: result.stderr,
            failure: result.stdout.match(/WAGO_MANAGEMENT_FAILURE=([a-z]+)/)?.[1],
          }).toEqual({ status: 0, stderr: '', failure: undefined });
        success(run(`proof ${token}`));
        expect(
          run(`stage ${token} ${digest} ${bundle.length} ${scope.artifact.imageId} arbitrary-image`).status,
        ).not.toBe(0);
        success(
          run(`stage ${token} ${digest} ${bundle.length} ${scope.artifact.imageId} ${scope.artifact.image}`, bundle),
        );
        expect(run(`activate ${'6'.repeat(32)}`).status).not.toBe(0);
        success(run(`activate ${token}`));
        success(run(`accept ${token}`));
        success(run(`acknowledge ${token}`));
        success(run(`acknowledge ${token}`));
        expect(fixture.read('var/lib/attraccess-wago/state.json')).toBe('enrolled-state');
        expect(fixture.read('etc/attraccess-wago/runtime.env')).toContain('permanent-fixture-secret');
        expect(fixture.containers()).toHaveLength(1);
        expect(fixture.containers()[0]).toMatchObject({ imageId: scope.artifact.imageId, running: true });
      } finally {
        fixture.dispose();
      }
    },
  );
}

export function registerExplainsTheSPrerequisiteHoldingUpAutomaticSshCompletionWithoutTouchingSsh(
  scope: ManagedEnrolmentAndDurableCredentialLifecycleTestScope,
): void {
  it.each(['connection', 'runtime_state', 'enrollment_credentials', 'configuration', 'readiness'] as const)(
    'explains the %s prerequisite holding up automatic SSH completion without touching SSH',
    async (reason) => {
      const now = new Date().toISOString();
      const current = await scope.db.getRepository(WagoController).save(
        Object.assign(new WagoController(), {
          id: 1,
          hardwareId: 'cc100-1',
          trustState: 'claimed',
          mqttServerId: 7,
          pairingCodeHash: 'fixture',
          protocolVersion: '1',
          runtimeVersion: '1',
          capabilities: '[]',
          lastSeenAt: now,
          createdAt: now,
          updatedAt: now,
        }),
      );
      await scope.db.getRepository(WagoCommissioningSession).save(
        Object.assign(scope.session(), {
          mqttServerId: 7,
          firmwareBaseline: '31',
          state: 'awaiting_verification',
          initiatingPrincipal: JSON.stringify(scope.principal),
          auditLog: '[]',
          createdAt: now,
          updatedAt: now,
        }),
      );
      await scope.service.enrol(scope.session(), async () => 'OK\n', new AbortController().signal);
      await scope.db.getRepository(WagoManagedAccess).update(1, { controllerId: 1, state: 'verified' });
      if (reason !== 'connection')
        scope.service['heartbeats'].set(1, {
          imageId: scope.artifact.imageId,
          streamId: 'boot-new',
          timestamp: Date.now(),
          receivedAt: Date.now(),
        });
      scope.service['readiness'].observe = jest.fn(() =>
        reason === 'runtime_state'
          ? undefined
          : {
              timestamp: Date.now(),
              streamId: 'boot-new',
              sequence: 1,
              revision: 1,
              contentHash: 'a'.repeat(64),
              connected: true,
              configurationAccepted: reason !== 'configuration',
              hardwareAvailable: reason !== 'readiness',
              ready: reason !== 'configuration' && reason !== 'readiness',
            },
      );
      jest.mocked(commissioningVerification).mockResolvedValue({
        controllerId: 1,
        permanentConnection: true,
        enrollmentRevoked: reason !== 'enrollment_credentials',
        configurationApplied: reason !== 'configuration',
        hardwareReadiness: reason === 'readiness' ? 'not_ready' : 'ready',
        managementHardening: 'unverified',
        physicalQualification: 'required',
        ready: false,
      });
      jest.mocked(managedSsh).mockClear();
      expect(await scope.service['completeEnrolment'](current)).toBe(false);
      expect(await scope.service.status(1)).toMatchObject({
        management: 'verified',
        managementSetup: { state: 'waiting', reason },
      });
      expect(jest.mocked(managedSsh)).not.toHaveBeenCalled();
    },
  );
}

export function registerFencesRuntimeRetriesWhenRetirementWinsOwnershipAndRetainsPendingRecoveryMetadata(
  scope: ManagedEnrolmentAndDurableCredentialLifecycleTestScope,
): void {
  it('fences runtime retries when retirement wins ownership and retains pending recovery metadata', async () => {
    await scope.service.enrol(scope.session(), async () => 'OK\n', new AbortController().signal);
    await scope.db.getRepository(WagoManagedAccess).update(1, { controllerId: 1, state: 'managed' });
    const operations = scope.service['operations'];
    const acquire = operations.acquire.bind(operations);
    jest.spyOn(operations, 'acquire').mockImplementation(async (...args) => {
      await scope.db.getRepository(WagoManagedAccess).update(1, { state: 'retiring' });
      return acquire(...args);
    });
    jest.mocked(managedSsh).mockClear();
    await expect(scope.service.retryRuntime(1)).rejects.toThrow('management_required');
    expect(jest.mocked(managedSsh)).not.toHaveBeenCalled();
    expect((await scope.service.sessionStatus(1)).management).toBe('retiring');
    expect(
      await scope.db.getRepository(WagoDeviceOperation).findOneBy({ fingerprint: scope.session().hostKeyFingerprint }),
    ).toMatchObject({ owner: null });
  });
}

export function registerGeneratesValidPosixShellWithDynamicBoundedArtifactParametersNoSuppliedScriptsEval(
  scope: FixedManagedExecutorAndRecoveryProgramsTestScope,
): void {
  it('generates valid POSIX shell with dynamic bounded artifact parameters, no supplied scripts/eval', () => {
    const helper = managedHostHelper(scope.artifact);
    const key = generateManagementKey();
    for (const script of [
      helper,
      managedProvisionScript('a'.repeat(32), key.publicKey, 'b'.repeat(43), helper),
      managedCutoverScript('a'.repeat(32)),
      managedCommitScript('a'.repeat(32)),
      managedAccessWatchdog,
    ]) {
      const result = spawnSync('/bin/sh', ['-n'], { input: script, encoding: 'utf8' });
      expect({
        status: result.status,
        stderr: result.stderr,
        failure: result.stdout.match(/WAGO_MANAGEMENT_FAILURE=([a-z]+)/)?.[1],
      }).toEqual({ status: 0, stderr: '', failure: undefined });
    }
    expect(helper).toContain('sh "$tx/bundle.tar" "$((bytes + 1))"');
    expect(helper).toContain('-v b="$kib"');
    expect(helper).toContain('"${token}"');
    expect(helper).not.toMatch(/\beval\b|\b1234567\b|'\$\{token\}'/);
    expect(helper).toContain('*) exit 1 ;;');
  });
}
