import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { StatePreservingUpdateShellIsolatedFw31InterfacesTestScope } from './wago-runtime-update-shell.spec';
export function registerStatePreservingUpdateShellIsolatedFw31InterfacesResumesAcknowledgementAfterTheUnusedImageWasRemovedButBeforeTheReceiptWasRemoved(
  scope: StatePreservingUpdateShellIsolatedFw31InterfacesTestScope,
): void {
  it('resumes acknowledgement after the unused image was removed but before the receipt was removed', () => {
    scope.success(scope.stage());
    scope.success(scope.rollback());
    scope.fixture.file('images.json', JSON.stringify([scope.previousImageId]));
    scope.success(scope.acknowledge());
    expect(scope.fixture.read('docker.log')).not.toContain(`image rm ${scope.imageId}`);
    expect(existsSync(join(scope.fixture.root, scope.tx))).toBe(false);
  });
}
