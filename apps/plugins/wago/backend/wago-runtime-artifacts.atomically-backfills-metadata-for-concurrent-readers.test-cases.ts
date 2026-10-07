import { readFile } from 'node:fs/promises';
import { rm } from 'node:fs/promises';
import filesystem from 'node:fs/promises';
import { join } from 'node:path';
import { resolve } from 'node:path';
import type { RuntimeArtifactCatalogIsolatedDiskTestScope } from './wago-runtime-artifacts.spec';
import { randomUUID } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import { readdir } from 'node:fs/promises';
import { basename } from 'node:path';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { WagoRuntimeArtifactCatalog } from './wago-runtime-artifacts';
import { Readable } from 'node:stream';
import { WagoRuntimeArtifactsService } from './wago-runtime-artifacts';
import { lstat } from 'node:fs/promises';
import { writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { WagoBuildRuntimeCatalog } from './wago-build-runtime';

export function registerAtomicallyBackfillsMetadataForConcurrentReaders(
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

export function registerBoundsConcurrentImportsAndReleasesRejectedInputStreams(
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

export function registerBoundsStartupReconciliationAndContinuesBeyondRetainedEntriesOnLaterAccesses(
  scope: RuntimeArtifactCatalogIsolatedDiskTestScope,
): void {
  it('bounds startup reconciliation and continues beyond retained entries on later accesses', async () => {
    const active = await scope.catalog.createUploadDirectory();
    const staging = join(await scope.catalog.root(), 'staging');
    const owner = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore' });
    await once(owner, 'spawn');
    const restarted = new WagoRuntimeArtifactCatalog(scope.root);
    try {
      // Force the cursor to encounter more entries than a single bounded pass.
      for (let i = 0; i < 40; i++) await mkdir(join(staging, `unowned-${i}`));
      for (let i = 0; i < 40; i++) {
        const name = basename(active)
          .replace(`-${process.pid}-`, `-${owner.pid}-`)
          .replace(/[a-f0-9-]{36}$/, randomUUID());
        await mkdir(join(staging, name));
      }
      const exited = once(owner, 'exit');
      owner.kill('SIGKILL');
      await exited;
      await restarted.onModuleInit();
      expect((await readdir(staging)).length).toBeGreaterThanOrEqual(49);
      for (let i = 0; i < 4; i++) await restarted.root();
      const retained = await readdir(staging);
      expect(retained).toHaveLength(41);
      expect(retained).toContain(basename(active));
    } finally {
      if (owner.exitCode === null && owner.signalCode === null) owner.kill('SIGKILL');
      await restarted.onModuleDestroy();
    }
  });
}

export function registerBoundsTarAndSidecarWritesAndCleansUpStreamErrors(
  scope: RuntimeArtifactCatalogIsolatedDiskTestScope,
): void {
  it('bounds tar and sidecar writes and cleans up stream errors', async () => {
    await expect(new WagoRuntimeArtifactCatalog(scope.root, 100).import(scope.upload())).rejects.toThrow();
    await expect(scope.catalog.import(scope.upload(scope.bundle(), 'x'.repeat(4097)))).rejects.toThrow();
    const failed = scope.upload();
    failed.bundle = Readable.from(
      (async function* () {
        yield 'start';
        throw new Error('private internal detail');
      })(),
    );
    await expect(scope.catalog.import(failed)).rejects.toThrow('Runtime import failed');
    expect(await readdir(join(await scope.catalog.root(), 'staging'))).toEqual([]);
  });
}

export function registerDoesNotLetTheManifestCopyTaskCacheAndRestoreStaleRuntimeFrontendBundles(
  _scope: RuntimeArtifactCatalogIsolatedDiskTestScope,
): void {
  it('does not let the manifest-copy task cache and restore stale runtime/frontend bundles', async () => {
    const project = JSON.parse(await readFile(join(__dirname, '../project.json'), 'utf8'));
    expect(project.targets.build.outputs).toEqual([
      '{projectRoot}/package/package.json',
      '{projectRoot}/package/plugin.json',
    ]);
  });
}

export function registerIgnoresALegacyImportedReleaseWhenLocalBuildAssetsHaveNotBeenInstalled(
  scope: RuntimeArtifactCatalogIsolatedDiskTestScope,
): void {
  it('ignores a legacy imported release when local build assets have not been installed', async () => {
    process.env.STORAGE_ROOT = scope.root;
    delete process.env.WAGO_CC100_BUILD_ASSETS_PATH;
    process.env.NODE_ENV = 'development';
    await scope.catalog.import(scope.upload());
    const service = new WagoRuntimeArtifactsService();
    try {
      expect(await service.current()).toBeNull();
      expect(await service.list()).toEqual([]);
      expect(await service.has()).toBe(false);
      await expect(service.acquire()).rejects.toThrow('Build');
      const source = scope.upload();
      await expect(service.import(source)).rejects.toThrow('server build owns');
      expect(source.bundle.destroyed).toBe(true);
    } finally {
      await service.onModuleDestroy();
    }
  });
}

export function registerLeavesNoPartialMetadataWhenBackfillPublicationIsInterrupted(
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

export function registerPackagesAFixedBuildOwnedDescriptorAndVerifiesItWithoutAManualImport(
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

export function registerPersistsImmutableVerifiedMetadataAndExposesOnlyNonsecretApiMetadata(
  scope: RuntimeArtifactCatalogIsolatedDiskTestScope,
): void {
  it('persists immutable verified metadata and exposes only nonsecret API metadata', async () => {
    expect(await scope.catalog.has()).toBe(false);
    const imported = await scope.catalog.import(scope.upload());
    expect(imported.manifest).toEqual(scope.manifest);
    expect(Object.isFrozen(imported.manifest.hardware)).toBe(true);
    expect(Object.keys(imported).sort()).toEqual(['bytes', 'digest', 'image', 'manifest']);
    const restarted = new WagoRuntimeArtifactCatalog(scope.root);
    expect(await restarted.current()).toEqual(imported);
    expect(await restarted.has()).toBe(true);
  });
}
