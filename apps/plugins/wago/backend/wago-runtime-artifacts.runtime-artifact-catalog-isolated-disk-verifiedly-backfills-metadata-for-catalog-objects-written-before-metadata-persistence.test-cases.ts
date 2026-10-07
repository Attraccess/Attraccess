import { readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { WagoRuntimeArtifactCatalog } from './wago-runtime-artifacts';
import { RuntimeArtifactCatalogIsolatedDiskTestScope } from './wago-runtime-artifacts.spec';
export function registerRuntimeArtifactCatalogIsolatedDiskVerifiedlyBackfillsMetadataForCatalogObjectsWrittenBeforeMetadataPersistence(
  scope: RuntimeArtifactCatalogIsolatedDiskTestScope,
): void {
  it('verifiedly backfills metadata for catalog objects written before metadata persistence', async () => {
    const imported = await scope.catalog.import(scope.upload());
    const metadataPath = join(await scope.catalog.root(), 'objects', imported.digest, 'metadata.json');
    await rm(metadataPath);

    // Reimporting the same release must repair the existing object rather than discard staged metadata.
    await scope.catalog.import(scope.upload());
    const restarted = new WagoRuntimeArtifactCatalog(scope.root);
    expect(await restarted.current()).toEqual(imported);
    expect(await restarted.list()).toEqual([imported]);
    expect(await restarted.has()).toBe(true);
    expect(JSON.parse(await readFile(metadataPath, 'utf8'))).toEqual(imported);
    await restarted.onModuleDestroy();
  });
}
