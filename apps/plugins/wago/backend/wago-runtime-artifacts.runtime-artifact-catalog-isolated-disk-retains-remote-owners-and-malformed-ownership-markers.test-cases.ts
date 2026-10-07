import { mkdir, readdir } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { RuntimeArtifactCatalogIsolatedDiskTestScope } from './wago-runtime-artifacts.spec';
export function registerRuntimeArtifactCatalogIsolatedDiskRetainsRemoteOwnersAndMalformedOwnershipMarkers(
  scope: RuntimeArtifactCatalogIsolatedDiskTestScope,
): void {
  it('retains remote owners and malformed ownership markers', async () => {
    const active = await scope.catalog.createUploadDirectory();
    const staging = join(await scope.catalog.root(), 'staging');
    const remote = basename(active).replace(/-v1-[a-f0-9]{64}-/, `-v1-${'0'.repeat(64)}-`);
    const malformed = basename(active).replace('-v1-', '-v0-');
    await mkdir(join(staging, remote));
    await mkdir(join(staging, malformed));
    await scope.catalog.root();
    expect(await readdir(staging)).toEqual(expect.arrayContaining([basename(active), remote, malformed]));
  });
}
