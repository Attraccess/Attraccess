import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { runtimeUpdateAcknowledgeScript } from './wago-runtime-update-shell';
import { StatePreservingUpdateShellIsolatedFw31InterfacesTestScope } from './wago-runtime-update-shell.spec';
export function registerStatePreservingUpdateShellIsolatedFw31InterfacesRetainsAcknowledgementOwnershipOnSAndRetriesImageCleanupSafely(
  scope: StatePreservingUpdateShellIsolatedFw31InterfacesTestScope,
): void {
  it.each(['image-remove-failed', 'image-list-failed', 'docker-list-failed', 'docker-inspect-failed'])(
    'retains acknowledgement ownership on %s and retries image cleanup safely',
    (fault) => {
      scope.success(scope.stage());
      scope.success(scope.rollback());
      const result = scope.fixture.run(
        runtimeUpdateAcknowledgeScript(scope.token, scope.profile, scope.fixture.root),
        fault,
      );
      expect(result.status).not.toBe(0);
      expect(existsSync(join(scope.fixture.root, scope.tx))).toBe(true);
      expect(JSON.parse(scope.fixture.read('images.json'))).toEqual([scope.previousImageId, scope.imageId]);
      scope.success(scope.acknowledge());
      expect(JSON.parse(scope.fixture.read('images.json'))).toEqual([scope.previousImageId]);
    },
  );
}
