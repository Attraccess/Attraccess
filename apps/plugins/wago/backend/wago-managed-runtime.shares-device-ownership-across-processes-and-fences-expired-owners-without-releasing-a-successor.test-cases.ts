import { WagoDeviceOperation } from './wago-managed-access.entity';
import { WagoDeviceOperations } from './wago-device-operations';
import type { ManagedEnrolmentAndDurableCredentialLifecycleTestScope } from './wago-managed-runtime.spec';
import { WagoManagedRuntimeService } from './wago-managed-runtime.service';
import { WagoService } from './wago.service';
import { WagoRuntimeArtifactsService } from './wago-runtime-artifacts';
import { WagoCommissioningReadiness } from './wago-commissioning-readiness';
import { managedSshFailure } from './wago-managed-ssh';
import { managedHostHelper } from './wago-managed-helper';
import type { FixedManagedExecutorAndRecoveryProgramsTestScope } from './wago-managed-runtime.spec';
import { WagoManagedAccess } from './wago-managed-access.entity';
import { managedSsh } from './wago-managed-ssh';

export function registerSharesDeviceOwnershipAcrossProcessesAndFencesExpiredOwnersWithoutReleasingASuccessor(
  scope: ManagedEnrolmentAndDurableCredentialLifecycleTestScope,
): void {
  it('shares device ownership across processes and fences expired owners without releasing a successor', async () => {
    const first = new WagoDeviceOperations(scope.db.getRepository(WagoDeviceOperation));
    const second = new WagoDeviceOperations(scope.db.getRepository(WagoDeviceOperation));
    expect(await first.acquire('device-a', 'commissioning', 100, 200)).toBe(true);
    expect(await second.acquire('device-a', 'update', 150, 300)).toBe(false);
    expect(await second.acquire('device-b', 'update-b', 150, 300)).toBe(true);
    await expect(first.assertOwned('device-a', 'commissioning', 201)).rejects.toThrow('ownership');
    expect(await second.acquire('device-a', 'successor', 201, 400)).toBe(true);
    await first.release('device-a', 'commissioning');
    expect(await first.acquire('device-a', 'third', 202, 500)).toBe(false);
  });
}

export function registerStartsBackgroundReconciliationOnBootstrapWithoutAdditionalConfiguration(
  scope: ManagedEnrolmentAndDurableCredentialLifecycleTestScope,
): void {
  it('starts background reconciliation on bootstrap without additional configuration', async () => {
    const restarted = new WagoManagedRuntimeService(
      scope.context,
      { registerRuntimeStatusHandler: jest.fn() } as unknown as WagoService,
      {} as WagoRuntimeArtifactsService,
      {} as WagoCommissioningReadiness,
    );
    const scan = jest.spyOn(restarted as unknown as { scan(): Promise<void> }, 'scan').mockResolvedValue(undefined);
    try {
      restarted.onApplicationBootstrap();
      await new Promise(setImmediate);
      expect(scan).toHaveBeenCalledTimes(1);
    } finally {
      await restarted.onModuleDestroy();
    }
  });
}

export function registerUsesTheSameRtuContractInStageActivationAcceptanceAndRecoveryAndPreservesFixedDiagnosti(
  scope: FixedManagedExecutorAndRecoveryProgramsTestScope,
): void {
  it('uses the same RTU contract in stage, activation, acceptance and recovery, and preserves fixed diagnostic categories', () => {
    const helper = managedHostHelper({
      ...scope.artifact,
      manifest: {
        ...scope.artifact.manifest,
        hardware: { ...scope.artifact.manifest.hardware, profile: 'cc100-751-9301-fw31-digital-rtu-v1' },
      },
    });
    const comparisons = [...helper.matchAll(/cat "\$tx\/profile"\)" = '([^']+)'/g)].map((entry) => entry[1]);
    expect(comparisons).toHaveLength(5);
    expect(new Set(comparisons)).toEqual(new Set(['cc100-751-9301-fw31-digital-rtu-v1']));
    expect(managedSshFailure('Insufficient update journal storage', 'transfer')).toBe('storage');
    expect(managedSshFailure('Runtime load failed', 'transfer')).toBe('load');
    expect(managedSshFailure('codesys-boot-enabled', 'transfer')).toBe('codesys_boot_enabled');
    expect(managedSshFailure('codesys-active', 'transfer')).toBe('codesys_active');
    expect(managedSshFailure('missing-register', 'transfer')).toBe('io_unavailable');
    expect(managedSshFailure('output-host-process-conflict', 'transfer')).toBe('writer_conflict');
    expect(managedSshFailure('Permission denied (publickey).', 'offline')).toBe('authentication');
    expect(managedSshFailure("flock: invalid option -- 'w'\nBusyBox v1.37.0 () multi-call binary.", 'offline')).toBe(
      'lock_tools',
    );
    expect(managedSshFailure('unexpected remote fixture-secret text', 'transfer')).toBe('transfer');
  });
}

export function registerVerifiesTheEncryptedDatabaseRoundTripAndFailsBeforeRemoteChangesWhenStorageIsCorrupt(
  scope: ManagedEnrolmentAndDurableCredentialLifecycleTestScope,
): void {
  it('verifies the encrypted database round trip and fails before remote changes when storage is corrupt', async () => {
    const repository = scope.db.getRepository(WagoManagedAccess);
    const save = repository.save.bind(repository);
    jest.spyOn(repository, 'save').mockImplementationOnce(async (value) => {
      const row = await save(value);
      await repository.update(1, { encryptedCredentials: 'corrupted-ciphertext' });
      return row;
    });
    const execute = jest.fn();
    await expect(scope.service.enrol(scope.session(), execute, new AbortController().signal)).rejects.toThrow(
      'unavailable',
    );
    expect(execute).not.toHaveBeenCalled();
    expect(managedSsh).not.toHaveBeenCalled();
  });
}

export function registerVisiblyBlocksUnreadableManagedCredentialsWithoutExposingTheEnvelope(
  scope: ManagedEnrolmentAndDurableCredentialLifecycleTestScope,
): void {
  it('visibly blocks unreadable managed credentials without exposing the envelope', async () => {
    await scope.service.enrol(scope.session(), async () => 'OK\n', new AbortController().signal);
    await scope.db.getRepository(WagoManagedAccess).update(1, {
      controllerId: 1,
      state: 'managed',
      encryptedCredentials: 'corrupt-secret-envelope',
    });
    const status = await scope.service.status(1);
    expect(status.management).toBe('recovery_required');
    expect(JSON.stringify(status)).not.toContain('corrupt-secret-envelope');
    await expect(scope.service.assertRemovable(1)).rejects.toThrow('retire managed');
  });
}
