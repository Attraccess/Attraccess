import { readdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { WagoBuildRuntimeCatalog } from './wago-build-runtime';
import { RuntimeArtifactCatalogIsolatedDiskTestScope } from './wago-runtime-artifacts.spec';
export function registerRuntimeArtifactCatalogIsolatedDiskPackagesAFixedBuildOwnedDescriptorAndVerifiesItWithoutAManualImport(
  scope: RuntimeArtifactCatalogIsolatedDiskTestScope,
): void {
  it('packages a fixed build-owned descriptor and verifies it without a manual import', async () => {
    const exec = promisify(execFile);
    await writeFile(
      join(scope.root, 'image.tar'),
      Buffer.concat([scope.tarMember('fixture', 'image fixture'), Buffer.alloc(1024)]),
    );
    const args = [
      resolve(__dirname, '../scripts/package-runtime-artifact.mjs'),
      '--image-archive',
      join(scope.root, 'image.tar'),
      '--image',
      scope.image,
      '--version',
      '0.1.0',
      '--build-id',
      'a'.repeat(40),
      '--image-id',
      `sha256:${'b'.repeat(64)}`,
      '--out',
      join(scope.root, 'build-assets'),
    ];
    await exec(process.execPath, args);
    const directory = join(scope.root, 'build-assets/cc100-build');
    const owned = new WagoBuildRuntimeCatalog(scope.root, directory);
    try {
      await owned.onModuleInit();
      expect(await owned.current()).toMatchObject({ buildId: 'a'.repeat(40), imageId: `sha256:${'b'.repeat(64)}` });
      // Explicit rebuilds publish fresh assets, while running catalogs retain
      // their selected release until the server is restarted.
      const nextArgs = [...args];
      nextArgs[nextArgs.indexOf('--version') + 1] = '0.2.0';
      await exec(process.execPath, nextArgs);
      expect((await owned.current()).manifest.runtimeVersion).toBe('0.1.0');
      const restarted = new WagoBuildRuntimeCatalog(scope.root, directory);
      try {
        expect((await restarted.current()).manifest.runtimeVersion).toBe('0.2.0');
      } finally {
        await restarted.onModuleDestroy();
      }
      expect(await readdir(join(scope.root, 'build-assets'))).toEqual(['cc100-build']);
    } finally {
      await owned.onModuleDestroy();
    }
  });
}
