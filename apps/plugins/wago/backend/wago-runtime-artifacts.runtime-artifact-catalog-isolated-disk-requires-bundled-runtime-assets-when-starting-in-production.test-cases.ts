import { WagoRuntimeArtifactsService } from './wago-runtime-artifacts';
import { RuntimeArtifactCatalogIsolatedDiskTestScope } from './wago-runtime-artifacts.spec';
export function registerRuntimeArtifactCatalogIsolatedDiskRequiresBundledRuntimeAssetsWhenStartingInProduction(
  scope: RuntimeArtifactCatalogIsolatedDiskTestScope,
): void {
  it('requires bundled runtime assets when starting in production', async () => {
    process.env.STORAGE_ROOT = scope.root;
    delete process.env.WAGO_CC100_BUILD_ASSETS_PATH;
    process.env.NODE_ENV = 'production';
    await scope.catalog.import(scope.upload());
    const service = new WagoRuntimeArtifactsService();
    try {
      await expect(service.onModuleInit()).rejects.toThrow();
      expect(await service.has()).toBe(false);
    } finally {
      await service.onModuleDestroy();
    }
  });
}
