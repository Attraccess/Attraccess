import { spawnSync } from 'node:child_process';
import { managedHostHelper } from './wago-managed-helper';
import {
  managedProvisionScript,
  managedCutoverScript,
  managedCommitScript,
  managedAccessWatchdog,
} from './wago-managed-provision';
import { generateManagementKey } from './wago-management-key';
import { FixedManagedExecutorAndRecoveryProgramsTestScope } from './wago-managed-runtime.spec';
export function registerFixedManagedExecutorAndRecoveryProgramsGeneratesValidPosixShellWithDynamicBoundedArtifactParametersNoSuppliedScriptsEval(
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
