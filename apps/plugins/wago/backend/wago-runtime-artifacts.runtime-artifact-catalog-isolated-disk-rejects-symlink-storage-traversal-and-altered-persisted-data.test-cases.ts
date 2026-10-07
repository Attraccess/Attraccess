import { rm, symlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { RuntimeArtifactCatalogIsolatedDiskTestScope } from './wago-runtime-artifacts.spec';
export function registerRuntimeArtifactCatalogIsolatedDiskRejectsSymlinkStorageTraversalAndAlteredPersistedData(
  scope: RuntimeArtifactCatalogIsolatedDiskTestScope,
): void {
  it('rejects symlink storage traversal and altered persisted data', async () => {
    await symlink(scope.root, join(scope.root, 'wago-runtime-artifacts'));
    await expect(scope.catalog.root()).rejects.toThrow('Invalid artifact storage');
    await rm(join(scope.root, 'wago-runtime-artifacts'));
    const imported = await scope.catalog.import(scope.upload());
    const path = join(await scope.catalog.root(), 'objects', imported.digest, 'runtime.tar');
    await rm(path);
    await symlink(join(scope.root, 'outside'), path);
    await writeFile(join(scope.root, 'outside'), scope.bundle());
    await expect(scope.catalog.acquire()).rejects.toThrow();
    expect(await scope.catalog.has()).toBe(false);
    await expect(scope.catalog.acquire('../outside')).rejects.toThrow();
  });
}
