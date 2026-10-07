import { managedSshFailure } from './wago-managed-ssh';
import { managedHostHelper } from './wago-managed-helper';
import { FixedManagedExecutorAndRecoveryProgramsTestScope } from './wago-managed-runtime.spec';
export function registerFixedManagedExecutorAndRecoveryProgramsUsesTheSameRtuContractInStageActivationAcceptanceAndRecoveryAndPreservesFixedDiagnosti(
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
