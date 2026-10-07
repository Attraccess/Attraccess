import { WagoRuntimeArtifactCatalog } from './wago-runtime-artifacts';
import { RuntimeArtifactCatalogIsolatedDiskTestScope } from './wago-runtime-artifacts.spec';
export function registerRuntimeArtifactCatalogIsolatedDiskPersistsImmutableVerifiedMetadataAndExposesOnlyNonsecretApiMetadata(
  scope: RuntimeArtifactCatalogIsolatedDiskTestScope,
): void {
  it('persists immutable verified metadata and exposes only nonsecret API metadata', async () => {
    expect(await scope.catalog.has()).toBe(false);
    const imported = await scope.catalog.import(scope.upload());
    expect(imported.manifest).toEqual(scope.manifest);
    expect(Object.isFrozen(imported.manifest.hardware)).toBe(true);
    expect(Object.keys(imported).sort()).toEqual(['bytes', 'digest', 'image', 'manifest']);
    const restarted = new WagoRuntimeArtifactCatalog(scope.root);
    expect(await restarted.current()).toEqual(imported);
    expect(await restarted.has()).toBe(true);
  });
}
