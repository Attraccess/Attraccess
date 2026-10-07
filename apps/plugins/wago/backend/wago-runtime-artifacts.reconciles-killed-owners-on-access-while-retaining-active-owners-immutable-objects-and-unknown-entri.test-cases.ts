import { lstat } from 'node:fs/promises';
import { mkdir } from 'node:fs/promises';
import { readFile } from 'node:fs/promises';
import { symlink } from 'node:fs/promises';
import { writeFile } from 'node:fs/promises';
import { basename } from 'node:path';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { WagoRuntimeArtifactCatalog } from './wago-runtime-artifacts';
import type { RuntimeArtifactCatalogIsolatedDiskTestScope } from './wago-runtime-artifacts.spec';
import { WagoRuntimeArtifactsService } from './wago-runtime-artifacts';
import { WagoArtifactsController } from './wago-artifacts.controller';
import { readdir } from 'node:fs/promises';
import { rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { gunzipSync } from 'node:zlib';
import { gzipSync } from 'node:zlib';

export function registerReconcilesKilledOwnersOnAccessWhileRetainingActiveOwnersImmutableObjectsAndUnknownEntri(
  scope: RuntimeArtifactCatalogIsolatedDiskTestScope,
): void {
  it('reconciles killed owners on access while retaining active owners, immutable objects, and unknown entries', async () => {
    const metadata = await scope.catalog.import(scope.upload());
    const snapshot = await scope.catalog.acquire();
    const activeUpload = await scope.catalog.createUploadDirectory();
    const catalogRoot = await scope.catalog.root();
    const owner = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore' });
    await once(owner, 'spawn');
    const name = (kind: string) =>
      basename(activeUpload).replace('upload-', `${kind}-`).replace(`-${process.pid}-`, `-${owner.pid}-`);
    const abandonedUpload = join(catalogRoot, 'staging', name('upload'));
    const abandonedSnapshot = join(catalogRoot, 'snapshots', name('delivery'));
    const pointer = join(catalogRoot, name('current'));
    const unknown = join(catalogRoot, 'staging', 'upload-unknown');
    try {
      await mkdir(abandonedUpload);
      await writeFile(join(abandonedUpload, 'partial'), 'partial upload');
      await mkdir(abandonedSnapshot);
      await writeFile(pointer, metadata.digest);
      await mkdir(unknown);
      // A live owner must survive regardless of another catalog's startup.
      const restarted = new WagoRuntimeArtifactCatalog(scope.root);
      await restarted.current();
      await restarted.onModuleDestroy();
      expect((await lstat(abandonedUpload)).isDirectory()).toBe(true);
      expect((await lstat(abandonedSnapshot)).isDirectory()).toBe(true);
      expect(await readFile(pointer, 'utf8')).toBe(metadata.digest);
      const exited = once(owner, 'exit');
      owner.kill('SIGKILL');
      await exited;
      await scope.catalog.current();
      for (const path of [abandonedUpload, abandonedSnapshot, pointer])
        await expect(lstat(path)).rejects.toMatchObject({ code: 'ENOENT' });
      expect((await lstat(activeUpload)).isDirectory()).toBe(true);
      expect((await lstat(unknown)).isDirectory()).toBe(true);
      expect(await readFile(snapshot.path)).toEqual(scope.bundle());
      expect(await scope.catalog.current()).toEqual(metadata);
      expect(await scope.catalog.list()).toEqual([metadata]);
      // Dead-owner names still cannot authorize following a symlink.
      await symlink(snapshot.directory, abandonedUpload);
      await symlink(snapshot.path, pointer);
      await scope.catalog.current();
      expect((await lstat(abandonedUpload)).isSymbolicLink()).toBe(true);
      expect((await lstat(pointer)).isSymbolicLink()).toBe(true);
      expect(await readFile(snapshot.path)).toEqual(scope.bundle());
    } finally {
      if (owner.exitCode === null && owner.signalCode === null) owner.kill('SIGKILL');
      await snapshot.cleanup();
    }
  });
}

export function registerRedactsFilesystemFailuresFromTheReadOnlyRuntimeController(
  scope: RuntimeArtifactCatalogIsolatedDiskTestScope,
): void {
  it('redacts filesystem failures from the read-only runtime controller', async () => {
    const controller = new WagoArtifactsController(scope.catalog as WagoRuntimeArtifactsService);
    const source = join(scope.root, 'private-source', 'runtime.tar');
    const rawError = new Error(`EACCES: permission denied, open '${source}'`);
    for (const method of ['list', 'current'] as const) {
      const spy = jest.spyOn(scope.catalog, method).mockRejectedValueOnce(rawError);
      await expect(controller[method]()).rejects.toMatchObject({ message: expect.not.stringContaining(scope.root) });
      spy.mockRestore();
    }
  });
}

export function registerRejectsSWithoutChangingCurrentOrLeavingTemporaryFiles(
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

export function registerRejectsSymlinkStorageTraversalAndAlteredPersistedData(
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

export function registerRequiresBundledRuntimeAssetsWhenStartingInProduction(
  scope: RuntimeArtifactCatalogIsolatedDiskTestScope,
): void {
  it('requires bundled runtime assets when starting in production', async () => {
    process.env.STORAGE_ROOT = scope.root;
    delete process.env.WAGO_CC100_BUILD_ASSETS_PATH;
    process.env.NODE_ENV = 'production';
    await scope.catalog.import(scope.upload());
    const service = new WagoRuntimeArtifactsService();
    try {
      await expect(service.onModuleInit()).rejects.toThrow();
      expect(await service.has()).toBe(false);
    } finally {
      await service.onModuleDestroy();
    }
  });
}

export function registerRetainsOldBundlesAcrossConcurrentImportsAndSnapshotsSurviveActivation(
  scope: RuntimeArtifactCatalogIsolatedDiskTestScope,
): void {
  it('retains old bundles across concurrent imports and snapshots survive activation', async () => {
    const first = await scope.catalog.import(scope.upload());
    const snapshot = await scope.catalog.acquire();
    const second = scope.bundle({ ...scope.manifest, runtimeVersion: '0.2.0' });
    await Promise.all([scope.catalog.import(scope.upload(second)), scope.catalog.import(scope.upload(second))]);
    expect(await readFile(snapshot.path)).toEqual(scope.bundle());
    expect(snapshot.digest).toBe(first.digest);
    expect(await scope.catalog.list()).toHaveLength(2);
    expect((await scope.catalog.current())?.manifest.runtimeVersion).toBe('0.2.0');
    const old = await scope.catalog.acquire(first.digest);
    await old.cleanup();
    await snapshot.cleanup();
    await snapshot.cleanup();
    expect(await readdir(join(await scope.catalog.root(), 'snapshots'))).toEqual([]);
    expect(await readdir(join(await scope.catalog.root(), 'staging'))).toEqual([]);
  });
}

export function registerRetainsRemoteOwnersAndMalformedOwnershipMarkers(
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

export function registerRoundTripsTheCompressedPackagingCliChecksumAndCatalogImport(
  scope: RuntimeArtifactCatalogIsolatedDiskTestScope,
): void {
  it('round-trips the compressed packaging CLI, checksum and catalog import', async () => {
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
    expect(result.manifest.hardware.profile).toBe(scope.manifest.hardware.profile);
    await exec(process.execPath, [
      resolve(__dirname, '../scripts/package-runtime-artifact.mjs'),
      '--image-archive',
      join(scope.root, 'image.tar'),
      '--image',
      scope.image,
      '--version',
      '0.3.0',
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
  });
}
