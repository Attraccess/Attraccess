import { readdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { RuntimeArtifactCatalogIsolatedDiskTestScope } from './wago-runtime-artifacts.spec';
export function registerRuntimeArtifactCatalogIsolatedDiskValidatesASelectedCatalogArtifactWithoutCreatingADeliverySnapshot(
  scope: RuntimeArtifactCatalogIsolatedDiskTestScope,
): void {
  it('validates a selected catalog artifact without creating a delivery snapshot', async () => {
    const imported = await scope.catalog.import(scope.upload());

    expect(await scope.catalog.get(imported.digest)).toEqual(imported);
    expect(await readdir(join(await scope.catalog.root(), 'snapshots'))).toEqual([]);
    await rm(join(await scope.catalog.root(), 'objects', imported.digest, 'runtime.tar'));
    await expect(scope.catalog.get(imported.digest)).rejects.toThrow();
  });
}
