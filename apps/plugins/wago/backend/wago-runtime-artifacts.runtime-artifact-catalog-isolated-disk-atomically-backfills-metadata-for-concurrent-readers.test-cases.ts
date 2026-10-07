import { readFile, rm } from 'node:fs/promises';
import filesystem from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { RuntimeArtifactCatalogIsolatedDiskTestScope } from './wago-runtime-artifacts.spec';
export function registerRuntimeArtifactCatalogIsolatedDiskAtomicallyBackfillsMetadataForConcurrentReaders(
  scope: RuntimeArtifactCatalogIsolatedDiskTestScope,
): void {
  it('atomically backfills metadata for concurrent readers', async () => {
    const imported = await scope.catalog.import(scope.upload());
    const directory = join(await scope.catalog.root(), 'objects', imported.digest);
    const metadataPath = join(directory, 'metadata.json');
    await rm(metadataPath);
    const originalRename = filesystem.rename;
    let metadataRenames = 0;
    let release!: () => void;
    const published = new Promise<void>((resolve) => {
      release = resolve;
    });
    const rename = jest.spyOn(filesystem, 'rename').mockImplementation(async (from, to) => {
      if (to === metadataPath) {
        metadataRenames++;
        if (metadataRenames === 2) release();
        await published;
      }
      return originalRename(from, to);
    });
    try {
      await expect(Promise.all([scope.catalog.current(), scope.catalog.list()])).resolves.toEqual([
        imported,
        [imported],
      ]);
      expect(metadataRenames).toBe(2);
      expect(JSON.parse(await readFile(metadataPath, 'utf8'))).toEqual(imported);
    } finally {
      rename.mockRestore();
    }
  });
}
