import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import { RuntimeArtifactCatalogIsolatedDiskTestScope } from './wago-runtime-artifacts.spec';
export function registerRuntimeArtifactCatalogIsolatedDiskListsBoundedMetadataWithoutRevalidatingRetainedBundles(
  scope: RuntimeArtifactCatalogIsolatedDiskTestScope,
): void {
  it('lists bounded metadata without revalidating retained bundles', async () => {
    const imported = await scope.catalog.import(scope.upload());
    await rm(join(await scope.catalog.root(), 'objects', imported.digest, 'runtime.tar'));
    expect(await scope.catalog.list()).toEqual([imported]);
    await expect(scope.catalog.acquire()).rejects.toThrow();
  });
}
