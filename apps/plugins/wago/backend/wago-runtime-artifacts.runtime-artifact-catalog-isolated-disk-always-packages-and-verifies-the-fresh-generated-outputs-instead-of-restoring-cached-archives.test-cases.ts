import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { RuntimeArtifactCatalogIsolatedDiskTestScope } from './wago-runtime-artifacts.spec';
export function registerRuntimeArtifactCatalogIsolatedDiskAlwaysPackagesAndVerifiesTheFreshGeneratedOutputsInsteadOfRestoringCachedArchives(
  scope: RuntimeArtifactCatalogIsolatedDiskTestScope,
): void {
  it('always packages and verifies the fresh generated outputs instead of restoring cached archives', async () => {
    const project = JSON.parse(await readFile(join(__dirname, '../project.json'), 'utf8'));
    for (const target of ['pack', 'pack-test', 'zip']) expect(project.targets[target].cache).toBe(false);
  });
}
