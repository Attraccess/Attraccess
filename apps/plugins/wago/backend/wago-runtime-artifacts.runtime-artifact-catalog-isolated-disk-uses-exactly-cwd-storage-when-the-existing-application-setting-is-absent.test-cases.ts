import { realpath } from 'node:fs/promises';
import { join } from 'node:path';
import { WagoRuntimeArtifactsService } from './wago-runtime-artifacts';
import { RuntimeArtifactCatalogIsolatedDiskTestScope } from './wago-runtime-artifacts.spec';
export function registerRuntimeArtifactCatalogIsolatedDiskUsesExactlyCwdStorageWhenTheExistingApplicationSettingIsAbsent(
  scope: RuntimeArtifactCatalogIsolatedDiskTestScope,
): void {
  it('uses exactly cwd/storage when the existing application setting is absent', async () => {
    const previous = process.env.STORAGE_ROOT;
    delete process.env.STORAGE_ROOT;
    const cwd = jest.spyOn(process, 'cwd').mockReturnValue(scope.root);
    try {
      const service = new WagoRuntimeArtifactsService();
      expect(await service.root()).toBe(await realpath(join(scope.root, 'storage', 'wago-runtime-artifacts')));
      await service.onModuleDestroy();
    } finally {
      cwd.mockRestore();
      if (previous !== undefined) process.env.STORAGE_ROOT = previous;
    }
  });
}
