import { WagoRuntimeArtifactsService } from './wago-runtime-artifacts';
import { RuntimeArtifactCatalogIsolatedDiskTestScope } from './wago-runtime-artifacts.spec';
export function registerRuntimeArtifactCatalogIsolatedDiskIgnoresALegacyImportedReleaseWhenLocalBuildAssetsHaveNotBeenInstalled(
  scope: RuntimeArtifactCatalogIsolatedDiskTestScope,
): void {
  it('ignores a legacy imported release when local build assets have not been installed', async () => {
    process.env.STORAGE_ROOT = scope.root;
    delete process.env.WAGO_CC100_BUILD_ASSETS_PATH;
    process.env.NODE_ENV = 'development';
    await scope.catalog.import(scope.upload());
    const service = new WagoRuntimeArtifactsService();
    try {
      expect(await service.current()).toBeNull();
      expect(await service.list()).toEqual([]);
      expect(await service.has()).toBe(false);
      await expect(service.acquire()).rejects.toThrow('Build');
      const source = scope.upload();
      await expect(service.import(source)).rejects.toThrow('server build owns');
      expect(source.bundle.destroyed).toBe(true);
    } finally {
      await service.onModuleDestroy();
    }
  });
}
