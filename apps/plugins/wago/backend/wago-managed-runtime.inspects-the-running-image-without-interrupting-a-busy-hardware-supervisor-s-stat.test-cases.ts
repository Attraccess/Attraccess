import { managedHostHelper } from './wago-managed-helper';
import { fw31ShellFixture } from './fixtures/fw31-shell-fixture';
import { MANAGED_HELPER_PROTOCOL } from './wago-managed-installer';
import type { FixedManagedExecutorAndRecoveryProgramsTestScope } from './wago-managed-runtime.spec';
import { DataSource } from 'typeorm';
import { WagoManagedAccess } from './wago-managed-access.entity';
import { WagoRuntimeUpdateEntity } from './wago-managed-access.entity';
import { WagoDeviceOperation } from './wago-managed-access.entity';
import { WagoManagedUpdates1780010650000 } from './migrations/1780010650000-add-wago-managed-updates';
import type { ManagedEnrolmentAndDurableCredentialLifecycleTestScope } from './wago-managed-runtime.spec';
import { rmSync } from 'node:fs';
import { join } from 'node:path';
import { existsSync } from 'node:fs';
import { managedSsh } from './wago-managed-ssh';

export function registerInspectsTheRunningImageWithoutInterruptingABusyHardwareSupervisorSStat(
  scope: FixedManagedExecutorAndRecoveryProgramsTestScope,
): void {
  it.each(['native', 'terse'] as const)(
    'inspects the running image without interrupting a busy hardware supervisor (%s stat)',
    (statStyle) => {
      const fixture = fw31ShellFixture(statStyle);
      try {
        fixture.file('bin/id', '#!/bin/sh\necho 0\n', 0o700);
        fixture.file('bin/cut', '#!/bin/sh\nexec /usr/bin/cut "$@"\n', 0o700);
        fixture.file('etc/attraccess-wago/install.lock', '');
        const helper = managedHostHelper(scope.artifact, fixture.root);
        fixture.file('usr/sbin/attraccess-wago-management', helper, 0o700);
        const containers = JSON.stringify([
          { id: 'a'.repeat(64), name: 'attraccess-wago', imageId: scope.artifact.imageId, running: true },
        ]);
        fixture.file('containers.json', containers);
        const result = fixture.run(helper, 'supervisor-lock-held', Buffer.from(`inspect ${'a'.repeat(32)}\n`));
        expect({ status: result.status, stderr: result.stderr }).toEqual({ status: 0, stderr: '' });
        expect(result.stdout).toMatch(
          new RegExp(`^${MANAGED_HELPER_PROTOCOL}\\n[a-f0-9]{64}\\n${scope.artifact.imageId} true\\n$`),
        );
        expect(fixture.read('containers.json')).toBe(containers);
        expect(fixture.read('usr/sbin/attraccess-wago-management')).toBe(helper);
      } finally {
        fixture.dispose();
      }
    },
  );
}

export function registerMigratesCredentialUpdateOperationStorageTogetherAndRefusesDestructiveDowngradeWithCredent(
  _scope: FixedManagedExecutorAndRecoveryProgramsTestScope,
): void {
  it('migrates credential/update/operation storage together and refuses destructive downgrade with credentials', async () => {
    const db = await new DataSource({
      type: 'sqlite',
      database: ':memory:',
      entities: [WagoManagedAccess, WagoRuntimeUpdateEntity, WagoDeviceOperation],
      migrations: [WagoManagedUpdates1780010650000],
    }).initialize();
    try {
      await db.runMigrations();
      await db.query(
        "INSERT INTO plugin_wago_managed_access VALUES (1, NULL, '10.0.0.1', 'pin', 'token', 'pending', 'ciphertext', 'key-pin')",
      );
      await expect(db.undoLastMigration()).rejects.toThrow('Retire managed');
    } finally {
      await db.destroy();
    }
  });
}

export function registerPersistsAuthenticatedCiphertextBeforeRemoteMutationAndRotatesPerEnrolment(
  scope: ManagedEnrolmentAndDurableCredentialLifecycleTestScope,
): void {
  it('persists authenticated ciphertext before remote mutation and rotates per enrolment', async () => {
    const execute = jest.fn(async (_script: string) => {
      const rows = await scope.db.query('SELECT encrypted_credentials FROM plugin_wago_managed_access');
      expect(rows[0].encrypted_credentials).not.toContain('PRIVATE KEY');
      expect(JSON.parse(scope.decrypt(rows[0].encrypted_credentials))).toMatchObject({ sessionId: 1 });
      return 'OK\n';
    });
    await scope.service.enrol(scope.session(), execute, new AbortController().signal);
    await scope.service.enrol(scope.session(2), async () => 'OK\n', new AbortController().signal);
    const rows = await scope.db.query(
      'SELECT encrypted_credentials, key_fingerprint FROM plugin_wago_managed_access ORDER BY session_id',
    );
    const first = JSON.parse(scope.decrypt(rows[0].encrypted_credentials)),
      second = JSON.parse(scope.decrypt(rows[1].encrypted_credentials));
    expect(first.privateKey).not.toEqual(second.privateKey);
    expect(first.recoveryPassword).not.toEqual(second.recoveryPassword);
    expect(scope.rootProbe).toHaveBeenCalledWith(
      scope.session().targetHost,
      scope.session().hostKeyFingerprint,
      first.recoveryPassword,
    );
    expect(await scope.db.getRepository(WagoManagedAccess).findOneByOrFail({ sessionId: 1 })).not.toHaveProperty(
      'encryptedCredentials',
    );
    expect(await scope.service.recoverPassword(1, scope.principal)).toEqual({ password: first.recoveryPassword });
    expect(await scope.service.status(100)).toEqual({
      sessionId: null,
      management: 'reenrol_required',
      keyFingerprint: null,
      update: null,
      physicalQualification: 'unverified',
    });
  });
}

export function registerProcessesANewConnectionImmediatelyInsideTheFleetScanCooldown(
  scope: ManagedEnrolmentAndDurableCredentialLifecycleTestScope,
): void {
  it('processes a new connection immediately inside the fleet scan cooldown', async () => {
    const internals = scope.service as unknown as {
      nextScanAt: number;
      scanning: boolean;
      reconcileConnection(id: number): Promise<void>;
    };
    while (internals.scanning) await new Promise(setImmediate);
    internals.nextScanAt = Date.now() + 30_000;
    const reconcile = jest.spyOn(internals, 'reconcileConnection').mockResolvedValue(undefined);
    const handler = jest.mocked(scope.service['wago'].registerRuntimeStatusHandler).mock.calls[0][0];
    handler(1, {
      imageId: scope.artifact.imageId,
      streamId: '00000000-0000-4000-8000-000000000001',
      sequence: 1,
      timestamp: Date.now(),
      receivedAt: Date.now(),
    });
    await new Promise(setImmediate);
    expect(reconcile).toHaveBeenCalledWith(1);
  });
}

export function registerReportsTheLegacyReceiverCapabilityWithoutTakingTheMutationLock(
  scope: FixedManagedExecutorAndRecoveryProgramsTestScope,
): void {
  it('reports the legacy receiver capability without taking the mutation lock', () => {
    const fixture = fw31ShellFixture();
    try {
      fixture.file('bin/id', '#!/bin/sh\necho 0\n', 0o700);
      fixture.file('etc/attraccess-wago/install.lock', '');
      fixture.file('etc/attraccess-wago-management/token', 'a'.repeat(32));
      const request = Buffer.from(`receiver-status ${'a'.repeat(32)}\n`);
      const helper = managedHostHelper(scope.artifact, fixture.root);
      expect(fixture.run(helper, 'supervisor-lock-held', request).stdout).toBe('head-byte-count supported\n');
      rmSync(join(fixture.root, 'bin/head'));
      fixture.file('bin/head', '#!/bin/sh\nexit 1\n', 0o700);
      const unsupported = fixture.run(helper, 'supervisor-lock-held', request);
      expect({ status: unsupported.status, stdout: unsupported.stdout, stderr: unsupported.stderr }).toEqual({
        status: 0,
        stdout: 'head-byte-count unsupported\n',
        stderr: '',
      });
      expect(fixture.run(helper, '', Buffer.from(`receiver-status ${'b'.repeat(32)}\n`)).status).not.toBe(0);
    } finally {
      fixture.dispose();
    }
  });
}

export function registerReportsUpdateStorageRequirementsWithoutWritingControllerStateSStat(
  scope: FixedManagedExecutorAndRecoveryProgramsTestScope,
): void {
  it.each(['native', 'terse'] as const)(
    'reports update storage requirements without writing controller state (%s stat)',
    (statStyle) => {
      const fixture = fw31ShellFixture(statStyle);
      try {
        fixture.file('bin/id', '#!/bin/sh\necho 0\n', 0o700);
        fixture.file('etc/attraccess-wago/install.lock', '');
        fixture.file('etc/attraccess-wago-management/token', 'a'.repeat(32));
        const containers = fixture.read('containers.json');
        const result = fixture.run(
          managedHostHelper(scope.artifact, fixture.root),
          'supervisor-lock-held',
          Buffer.from(`storage-status ${'a'.repeat(32)}\n`),
        );
        expect({ status: result.status, stderr: result.stderr }).toEqual({ status: 0, stderr: '' });
        expect(result.stdout).toBe(
          ['/var/lib', '/var/lib'].map((path) => `${fixture.root}${path} 999999 16704 disk /fixture\n`).join(''),
        );
        expect(fixture.read('containers.json')).toBe(containers);
        expect(existsSync(join(fixture.root, 'var/lib/attraccess-wago-update-transaction'))).toBe(false);
        expect(
          fixture.run(
            managedHostHelper(scope.artifact, fixture.root),
            '',
            Buffer.from(`storage-status ${'b'.repeat(32)}\n`),
          ).status,
        ).not.toBe(0);
        rmSync(join(fixture.root, 'etc/attraccess-wago'), { recursive: true });
        expect(
          fixture.run(
            managedHostHelper(scope.artifact, fixture.root),
            '',
            Buffer.from(`storage-status ${'a'.repeat(32)}\n`),
          ).status,
        ).not.toBe(0);
        expect(existsSync(join(fixture.root, 'etc/attraccess-wago'))).toBe(false);
      } finally {
        fixture.dispose();
      }
    },
  );
}

export function registerRequiresARecordedAdministratorAuditBeforeDecryptingDisclosingRootRecovery(
  scope: ManagedEnrolmentAndDurableCredentialLifecycleTestScope,
): void {
  it('requires a recorded administrator audit before decrypting/disclosing root recovery', async () => {
    await scope.service.enrol(scope.session(), async () => 'OK\n', new AbortController().signal);
    scope.decrypt.mockClear();
    scope.audit.mockResolvedValue({ status: 'unavailable' });
    await expect(scope.service.recoverPassword(1, scope.principal)).rejects.toThrow('Durable audit');
    expect(scope.decrypt).not.toHaveBeenCalled();
    expect(JSON.stringify(scope.audit.mock.calls)).not.toContain('PRIVATE KEY');
    scope.audit.mockResolvedValue({ status: 'recorded' });
    const result = await scope.service.recoverPassword(1, scope.principal);
    expect(result).toEqual({ password: expect.stringMatching(/^[A-Za-z0-9_-]{43}$/) });
    expect(result).not.toHaveProperty('privateKey');
  });
}

export function registerRetainsRecoveryIntentOnFailedSecondKeyConnectionWithoutDisablingSshPolicy(
  scope: ManagedEnrolmentAndDurableCredentialLifecycleTestScope,
): void {
  it('retains recovery intent on failed second key connection without disabling SSH policy', async () => {
    jest.mocked(managedSsh).mockRejectedValue(new Error('transport output with fixture secret'));
    const execute = jest.fn(async (_script: string) => 'OK\n');
    await expect(scope.service.enrol(scope.session(), execute, new AbortController().signal)).rejects.toThrow(
      'Managed SSH setup failed (proof)',
    );
    expect(await scope.db.getRepository(WagoManagedAccess).findOneByOrFail({ sessionId: 1 })).toMatchObject({
      state: 'recovery_required',
    });
    expect(execute).toHaveBeenCalledTimes(1);
    expect(execute.mock.calls[0][0]).not.toContain('dropbear restart');
    expect(scope.rootProbe).not.toHaveBeenCalled();
  });
}

export function registerRetainsRetirementIntentAndRecoverySecretsUntilRemoteKeyRemovalIsIndependentlyVerified(
  scope: ManagedEnrolmentAndDurableCredentialLifecycleTestScope,
): void {
  it('retains retirement intent and recovery secrets until remote key removal is independently verified', async () => {
    await scope.service.enrol(scope.session(), async () => 'OK\n', new AbortController().signal);
    await scope.db.getRepository(WagoManagedAccess).update(1, { controllerId: 1, state: 'managed' });
    await expect(scope.service.assertRemovable(1)).rejects.toThrow('retire managed');
    const probe = jest.fn(async () => false);
    scope.service.registerRetirementProbe(probe);
    await expect(scope.service.restoreAccess(1, scope.principal)).rejects.toThrow('retirement is unverified');
    expect((await scope.service.sessionStatus(1)).management).toBe('retiring');
    await expect(scope.service.retryAccess(1)).rejects.toThrow('cannot be retried');
    // A restarted request can observe the removal, even after losing its SSH reply.
    probe.mockResolvedValue(true);
    await scope.service.restoreAccess(1, scope.principal);
    expect((await scope.service.sessionStatus(1)).management).toBe('retired');
    await expect(scope.service.assertRemovable(1)).resolves.toBeUndefined();
    expect(await scope.service.recoverPassword(1, scope.principal)).toEqual({ password: expect.any(String) });
  });
}

export function registerRetainsThePendingIdentityAfterLostKeyCleanupAndRetriesWithoutGeneratingReplacementSecre(
  scope: ManagedEnrolmentAndDurableCredentialLifecycleTestScope,
): void {
  it('retains the pending identity after lost key cleanup and retries without generating replacement secrets', async () => {
    jest.mocked(managedSsh).mockImplementation(async (_access, _key, header) => {
      if (header.startsWith('access-key-commit')) {
        expect(await scope.db.getRepository(WagoManagedAccess).findOneByOrFail({ sessionId: 1 })).toMatchObject({
          state: 'verified',
        });
        throw new Error('lost receipt');
      }
      return `OK ${header.split(' ')[1]}\n`;
    });
    await expect(
      scope.service.enrol(scope.session(), async () => 'OK\n', new AbortController().signal),
    ).rejects.toThrow('Managed SSH setup failed (commit)');
    const before = (await scope.db.query('SELECT encrypted_credentials FROM plugin_wago_managed_access'))[0]
      .encrypted_credentials;
    jest
      .mocked(managedSsh)
      .mockImplementation(async (_access, _key, header) =>
        header.startsWith('proof ') ? `OK ${header.split(' ')[1]}\n` : 'OK\n',
      );
    await scope.service.enrol(scope.session(), async () => 'OK\n', new AbortController().signal);
    expect(
      (await scope.db.query('SELECT encrypted_credentials FROM plugin_wago_managed_access'))[0].encrypted_credentials,
    ).toBe(before);
  });
}

export { registerSelectsEncryptedRecoveryAccessOnlyAfterProvingThePinnedRootLogin } from './wago-managed-runtime.inspects-the-running-image-without-interrupting-a-busy-hardware-supervisor-s-stat.selects-encrypted-recovery-access-only-after-proving-the-pinned-root-login.test-cases';
