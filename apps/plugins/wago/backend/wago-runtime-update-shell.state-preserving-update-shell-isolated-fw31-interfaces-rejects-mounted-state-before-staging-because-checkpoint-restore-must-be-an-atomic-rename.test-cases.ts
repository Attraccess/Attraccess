import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { StatePreservingUpdateShellIsolatedFw31InterfacesTestScope } from './wago-runtime-update-shell.spec';
export function registerStatePreservingUpdateShellIsolatedFw31InterfacesRejectsMountedStateBeforeStagingBecauseCheckpointRestoreMustBeAnAtomicRename(
  scope: StatePreservingUpdateShellIsolatedFw31InterfacesTestScope,
): void {
  it('rejects mounted state before staging because checkpoint restore must be an atomic rename', () => {
    scope.fixture.file(
      'proc/self/mountinfo',
      `1 0 0:1 / / rw - ext4 fixture rw\n2 1 0:1 / ${scope.fixture.root}/${scope.data} rw - ext4 bind rw\n`,
    );
    const result = scope.stage();
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('Mounted runtime state');
    expect(scope.fixture.containers()[0].running).toBe(true);
    expect(existsSync(join(scope.fixture.root, scope.tx))).toBe(false);
  });
}
