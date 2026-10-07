import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { RuntimeArtifactCatalogIsolatedDiskTestScope } from './wago-runtime-artifacts.spec';
export function registerRuntimeArtifactCatalogIsolatedDiskDoesNotLetTheManifestCopyTaskCacheAndRestoreStaleRuntimeFrontendBundles(
  scope: RuntimeArtifactCatalogIsolatedDiskTestScope,
): void {
  it('does not let the manifest-copy task cache and restore stale runtime/frontend bundles', async () => {
    const project = JSON.parse(await readFile(join(__dirname, '../project.json'), 'utf8'));
    expect(project.targets.build.outputs).toEqual([
      '{projectRoot}/package/package.json',
      '{projectRoot}/package/plugin.json',
    ]);
  });
}
