import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { RuntimeArtifactCatalogIsolatedDiskTestScope } from './wago-runtime-artifacts.spec';
export function registerRuntimeArtifactCatalogIsolatedDiskRetainsOldBundlesAcrossConcurrentImportsAndSnapshotsSurviveActivation(
  scope: RuntimeArtifactCatalogIsolatedDiskTestScope,
): void {
  it('retains old bundles across concurrent imports and snapshots survive activation', async () => {
    const first = await scope.catalog.import(scope.upload());
    const snapshot = await scope.catalog.acquire();
    const second = scope.bundle({ ...scope.manifest, runtimeVersion: '0.2.0' });
    await Promise.all([scope.catalog.import(scope.upload(second)), scope.catalog.import(scope.upload(second))]);
    expect(await readFile(snapshot.path)).toEqual(scope.bundle());
    expect(snapshot.digest).toBe(first.digest);
    expect(await scope.catalog.list()).toHaveLength(2);
    expect((await scope.catalog.current())?.manifest.runtimeVersion).toBe('0.2.0');
    const old = await scope.catalog.acquire(first.digest);
    await old.cleanup();
    await snapshot.cleanup();
    await snapshot.cleanup();
    expect(await readdir(join(await scope.catalog.root(), 'snapshots'))).toEqual([]);
    expect(await readdir(join(await scope.catalog.root(), 'staging'))).toEqual([]);
  });
}
