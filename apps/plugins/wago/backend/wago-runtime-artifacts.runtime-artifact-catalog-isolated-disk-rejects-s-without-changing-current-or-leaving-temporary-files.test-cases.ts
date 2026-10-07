import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { RuntimeArtifactCatalogIsolatedDiskTestScope } from './wago-runtime-artifacts.spec';
export function registerRuntimeArtifactCatalogIsolatedDiskRejectsSWithoutChangingCurrentOrLeavingTemporaryFiles(
  scope: RuntimeArtifactCatalogIsolatedDiskTestScope,
): void {
  it.each([
    ['checksum', () => scope.upload(scope.bundle(), '0'.repeat(64))],
    ['manifest schema', () => scope.upload(scope.bundle({ ...scope.manifest, schemaVersion: 2 }))],
    ['mutable image', () => scope.upload(scope.bundle({ ...scope.manifest, image: 'latest' }))],
    [
      'hardware',
      () => scope.upload(scope.bundle({ ...scope.manifest, hardware: { ...scope.manifest.hardware, model: 'other' } })),
    ],
    [
      'hardware profile',
      () =>
        scope.upload(scope.bundle({ ...scope.manifest, hardware: { ...scope.manifest.hardware, profile: 'other' } })),
    ],
    ['image mismatch', () => scope.upload(scope.bundle(scope.manifest, scope.image.replace('aaaa', 'bbbb')))],
    ['traversal', () => scope.upload(scope.bundle(scope.manifest, scope.image, scope.tarMember('../escape', 'evil')))],
    ['symlink', () => scope.upload(scope.bundle(scope.manifest, scope.image, scope.tarMember('evil', 'target', '2')))],
    [
      'duplicate',
      () => scope.upload(scope.bundle(scope.manifest, scope.image, scope.tarMember('image.tar', 'duplicate'))),
    ],
    [
      'missing manifest',
      () =>
        scope.upload(
          Buffer.concat([
            scope.tarMember('image.tar', 'x'),
            scope.tarMember('image-reference', scope.image),
            Buffer.alloc(1024),
          ]),
        ),
    ],
    [
      'malformed JSON',
      () =>
        scope.upload(
          Buffer.concat([
            scope.tarMember('image.tar', 'x'),
            scope.tarMember('image-reference', scope.image),
            scope.tarMember('manifest.json', '{'),
            Buffer.alloc(1024),
          ]),
        ),
    ],
    ['truncated tar', () => scope.upload(scope.bundle().subarray(0, -512))],
  ])('rejects %s without changing current or leaving temporary files', async (_name, fixture) => {
    const previous = await scope.catalog.import(scope.upload());
    await expect(scope.catalog.import(fixture())).rejects.toThrow('Runtime import failed');
    expect(await scope.catalog.current()).toEqual(previous);
    expect(await readdir(join(await scope.catalog.root(), 'staging'))).toEqual([]);
  });
}
