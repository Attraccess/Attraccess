import { readFile, readdir, writeFile } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { gunzipSync, gzipSync } from 'node:zlib';
import { WagoRuntimeArtifactCatalog } from './wago-runtime-artifacts';
import { RuntimeArtifactCatalogIsolatedDiskTestScope } from './wago-runtime-artifacts.spec';
export function registerRuntimeArtifactCatalogIsolatedDiskRoundTripsTheCompressedPackagingCliChecksumAndCatalogImportForS(
  scope: RuntimeArtifactCatalogIsolatedDiskTestScope,
): void {
  it.each(['cc100-751-9301-fw31-digital-v1', 'cc100-751-9301-fw31-digital-rtu-v1'])(
    'round-trips the compressed packaging CLI, checksum and catalog import for %s',
    async (hardwareProfile) => {
      const exec = promisify(execFile);
      const inner = Buffer.concat([scope.tarMember('fixture', 'isolated image fixture'), Buffer.alloc(1024)]);
      await writeFile(join(scope.root, 'image.tar'), inner);
      await exec(process.execPath, [
        resolve(__dirname, '../scripts/package-runtime-artifact.mjs'),
        '--image-archive',
        join(scope.root, 'image.tar'),
        '--image',
        scope.image,
        '--version',
        '0.3.0',
        '--hardware-profile',
        hardwareProfile,
        '--out',
        join(scope.root, 'releases'),
      ]);
      const release = join(scope.root, 'releases', (await readdir(join(scope.root, 'releases')))[0]);
      expect((await readdir(release)).sort()).toEqual(['wago-cc100-runtime.tar', 'wago-cc100-runtime.tar.sha256']);
      const data = await readFile(join(release, 'wago-cc100-runtime.tar'));
      const imageHeader = data.subarray(0, 512);
      const compressedBytes = parseInt(imageHeader.subarray(124, 136).toString('ascii'), 8);
      const compressedImage = data.subarray(512, 512 + compressedBytes);
      expect(compressedImage.subarray(0, 2)).toEqual(Buffer.from([0x1f, 0x8b]));
      expect(compressedImage.subarray(4, 8)).toEqual(Buffer.alloc(4)); // no gzip timestamp
      expect(gunzipSync(compressedImage)).toEqual(inner);
      const fixtureCatalog = new WagoRuntimeArtifactCatalog(scope.root);
      const result = await fixtureCatalog.import(
        scope.upload(data, await readFile(join(release, 'wago-cc100-runtime.tar.sha256'), 'utf8')),
      );
      expect(result.manifest.runtimeVersion).toBe('0.3.0');
      expect(result.manifest.hardware.profile).toBe(hardwareProfile);
      await exec(process.execPath, [
        resolve(__dirname, '../scripts/package-runtime-artifact.mjs'),
        '--image-archive',
        join(scope.root, 'image.tar'),
        '--image',
        scope.image,
        '--version',
        '0.3.0',
        '--hardware-profile',
        hardwareProfile,
        '--out',
        join(scope.root, 'releases'),
      ]);
      const releases = await readdir(join(scope.root, 'releases'));
      const secondRelease = releases.find((name) => name !== basename(release));
      expect(secondRelease).toBeDefined();
      expect(await readFile(join(scope.root, 'releases', secondRelease ?? '', 'wago-cc100-runtime.tar'))).toEqual(data);
      await writeFile(join(scope.root, 'compressed-image.tar'), gzipSync(inner));
      await expect(
        exec(process.execPath, [
          resolve(__dirname, '../scripts/package-runtime-artifact.mjs'),
          '--image-archive',
          join(scope.root, 'compressed-image.tar'),
          '--image',
          scope.image,
          '--version',
          '0.3.1',
          '--out',
          join(scope.root, 'releases'),
        ]),
      ).rejects.toThrow();
      expect(await readdir(join(scope.root, 'releases'))).toHaveLength(2);
    },
  );
}
