import { existsSync, renameSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { StatePreservingUpdateShellIsolatedFw31InterfacesTestScope } from './wago-runtime-update-shell.spec';
export function registerStatePreservingUpdateShellIsolatedFw31InterfacesResumesPartialCleanupWithoutRequiringMetadataAlreadyDeletedByTheInterruptedCleanup(
  scope: StatePreservingUpdateShellIsolatedFw31InterfacesTestScope,
): void {
  it('resumes partial cleanup without requiring metadata already deleted by the interrupted cleanup', () => {
    scope.success(scope.stage());
    scope.success(scope.rollback());
    const cleanup = join(scope.fixture.root, `var/lib/attraccess-wago-update-cleanup-${scope.token}`);
    renameSync(join(scope.fixture.root, scope.tx), cleanup);
    rmSync(join(cleanup, 'token'));
    expect(scope.stage().status).not.toBe(0);
    scope.success(scope.acknowledge());
    expect(existsSync(cleanup)).toBe(false);
    expect(scope.fixture.read(scope.data + '/credentials.json')).toBe('permanent-credentials');
  });
}
