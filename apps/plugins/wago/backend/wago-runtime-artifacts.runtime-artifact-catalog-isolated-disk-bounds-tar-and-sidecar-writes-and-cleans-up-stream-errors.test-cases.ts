import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { WagoRuntimeArtifactCatalog } from './wago-runtime-artifacts';
import { RuntimeArtifactCatalogIsolatedDiskTestScope } from './wago-runtime-artifacts.spec';
export function registerRuntimeArtifactCatalogIsolatedDiskBoundsTarAndSidecarWritesAndCleansUpStreamErrors(
  scope: RuntimeArtifactCatalogIsolatedDiskTestScope,
): void {
  it('bounds tar and sidecar writes and cleans up stream errors', async () => {
    await expect(new WagoRuntimeArtifactCatalog(scope.root, 100).import(scope.upload())).rejects.toThrow();
    await expect(scope.catalog.import(scope.upload(scope.bundle(), 'x'.repeat(4097)))).rejects.toThrow();
    const failed = scope.upload();
    failed.bundle = Readable.from(
      (async function* () {
        yield 'start';
        throw new Error('private internal detail');
      })(),
    );
    await expect(scope.catalog.import(failed)).rejects.toThrow('Runtime import failed');
    expect(await readdir(join(await scope.catalog.root(), 'staging'))).toEqual([]);
  });
}
