import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { StatePreservingUpdateShellIsolatedFw31InterfacesTestScope } from './wago-runtime-update-shell.spec';
export function registerStatePreservingUpdateShellIsolatedFw31InterfacesExpiresABusyControllerWaitBeforeCreatingAnUpdateJournalOrStoppingTheRuntime(
  scope: StatePreservingUpdateShellIsolatedFw31InterfacesTestScope,
): void {
  it('expires a busy controller wait before creating an update journal or stopping the runtime', () => {
    const result = scope.stage('lock-wait-expired');
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('Another runtime transaction holds the controller lock');
    expect(existsSync(join(scope.fixture.root, scope.tx))).toBe(false);
    expect(scope.fixture.containers()[0]).toMatchObject({ running: true, imageId: scope.previousImageId });
  });
}
