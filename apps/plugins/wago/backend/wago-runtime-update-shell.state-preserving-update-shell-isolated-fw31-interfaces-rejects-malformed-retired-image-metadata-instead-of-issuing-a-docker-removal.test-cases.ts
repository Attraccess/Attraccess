import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { StatePreservingUpdateShellIsolatedFw31InterfacesTestScope } from './wago-runtime-update-shell.spec';
export function registerStatePreservingUpdateShellIsolatedFw31InterfacesRejectsMalformedRetiredImageMetadataInsteadOfIssuingADockerRemoval(
  scope: StatePreservingUpdateShellIsolatedFw31InterfacesTestScope,
): void {
  it('rejects malformed retired image metadata instead of issuing a Docker removal', () => {
    scope.success(scope.stage());
    scope.success(scope.rollback());
    scope.fixture.file(scope.tx + '/image-id', '--force');
    expect(scope.acknowledge().status).not.toBe(0);
    expect(scope.fixture.read('docker.log')).not.toMatch(/^image rm /m);
    expect(existsSync(join(scope.fixture.root, scope.tx))).toBe(true);
  });
}
