import { join } from 'node:path';
import { WagoRuntimeArtifactsService } from './wago-runtime-artifacts';
import { WagoArtifactsController } from './wago-artifacts.controller';
import { RuntimeArtifactCatalogIsolatedDiskTestScope } from './wago-runtime-artifacts.spec';
export function registerRuntimeArtifactCatalogIsolatedDiskRedactsFilesystemFailuresFromTheReadOnlyRuntimeController(
  scope: RuntimeArtifactCatalogIsolatedDiskTestScope,
): void {
  it('redacts filesystem failures from the read-only runtime controller', async () => {
    const controller = new WagoArtifactsController(scope.catalog as WagoRuntimeArtifactsService);
    const source = join(scope.root, 'private-source', 'runtime.tar');
    const rawError = new Error(`EACCES: permission denied, open '${source}'`);
    for (const method of ['list', 'current'] as const) {
      const spy = jest.spyOn(scope.catalog, method).mockRejectedValueOnce(rawError);
      await expect(controller[method]()).rejects.toMatchObject({ message: expect.not.stringContaining(scope.root) });
      spy.mockRestore();
    }
  });
}
