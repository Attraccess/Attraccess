import { readdir } from 'node:fs/promises';
import { WagoRuntimeArtifactsService } from './wago-runtime-artifacts';
import { Test } from '@nestjs/testing';
import { RuntimeArtifactCatalogIsolatedDiskTestScope } from './wago-runtime-artifacts.spec';
export function registerRuntimeArtifactCatalogIsolatedDiskUsesExistingStorageRootWithoutAccessingThePluginContextOrHostModuleRef(
  scope: RuntimeArtifactCatalogIsolatedDiskTestScope,
): void {
  it('uses existing STORAGE_ROOT without accessing the plugin context or host ModuleRef', async () => {
    const previous = process.env.STORAGE_ROOT;
    process.env.STORAGE_ROOT = scope.root;
    const get = jest.fn(() => {
      throw new Error('Host ModuleRef is not ready');
    });
    try {
      const module = await Test.createTestingModule({
        providers: [
          WagoRuntimeArtifactsService,
          { provide: Symbol.for('attraccess.plugin.context'), useValue: { get } },
        ],
      }).compile();
      expect(await module.get(WagoRuntimeArtifactsService).has()).toBe(false);
      expect(get).not.toHaveBeenCalled();
      expect(await readdir(scope.root)).toEqual([]);
      await module.close();
    } finally {
      if (previous === undefined) delete process.env.STORAGE_ROOT;
      else process.env.STORAGE_ROOT = previous;
    }
  });
}
