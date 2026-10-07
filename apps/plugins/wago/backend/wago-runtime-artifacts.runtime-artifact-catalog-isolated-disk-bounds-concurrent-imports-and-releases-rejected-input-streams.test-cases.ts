import { RuntimeArtifactCatalogIsolatedDiskTestScope } from './wago-runtime-artifacts.spec';
export function registerRuntimeArtifactCatalogIsolatedDiskBoundsConcurrentImportsAndReleasesRejectedInputStreams(
  scope: RuntimeArtifactCatalogIsolatedDiskTestScope,
): void {
  it('bounds concurrent imports and releases rejected input streams', async () => {
    const first = scope.catalog.import(scope.upload());
    const second = scope.catalog.import(scope.upload());
    const rejected = scope.upload();
    await expect(scope.catalog.import(rejected)).rejects.toThrow('Another runtime import');
    expect(Object.values(rejected).every((stream) => stream.destroyed)).toBe(true);
    await Promise.all([first, second]);
    expect(await scope.catalog.list()).toHaveLength(1);
  });
}
