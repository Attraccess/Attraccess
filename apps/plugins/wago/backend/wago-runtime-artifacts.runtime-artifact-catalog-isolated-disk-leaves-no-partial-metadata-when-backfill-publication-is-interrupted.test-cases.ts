import { lstat, readdir, rm } from 'node:fs/promises';
import filesystem from 'node:fs/promises';
import { join } from 'node:path';
import { RuntimeArtifactCatalogIsolatedDiskTestScope } from './wago-runtime-artifacts.spec';
export function registerRuntimeArtifactCatalogIsolatedDiskLeavesNoPartialMetadataWhenBackfillPublicationIsInterrupted(
  scope: RuntimeArtifactCatalogIsolatedDiskTestScope,
): void {
  it('leaves no partial metadata when backfill publication is interrupted', async () => {
    const imported = await scope.catalog.import(scope.upload());
    const directory = join(await scope.catalog.root(), 'objects', imported.digest);
    const metadataPath = join(directory, 'metadata.json');
    await rm(metadataPath);
    const originalRename = filesystem.rename;
    const rename = jest.spyOn(filesystem, 'rename').mockImplementation(async (from, to) => {
      if (to === metadataPath) throw new Error('interrupted publication');
      return originalRename(from, to);
    });
    try {
      await expect(scope.catalog.current()).rejects.toThrow('interrupted publication');
      await expect(lstat(metadataPath)).rejects.toMatchObject({ code: 'ENOENT' });
      expect((await readdir(directory)).some((name) => name.startsWith('.metadata-'))).toBe(false);
    } finally {
      rename.mockRestore();
    }
    await expect(scope.catalog.current()).resolves.toEqual(imported);
  });
}
