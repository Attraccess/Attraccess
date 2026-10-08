import { Test } from '@nestjs/testing';
import { execFile, spawn } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { once } from 'node:events';
import filesystem, {
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  realpath,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join, resolve } from 'node:path';
import { Readable } from 'node:stream';
import { promisify } from 'node:util';
import { gunzipSync, gzipSync } from 'node:zlib';
import { WagoArtifactsController } from './wago-artifacts.controller';
import { WagoBuildRuntimeCatalog, sameRuntimeImage } from './wago-build-runtime';
import { WagoRuntimeArtifactCatalog, WagoRuntimeArtifactsService } from './wago-runtime-artifacts';
function bundle(value: unknown = manifest, reference = image, extra = Buffer.alloc(0)) {
  return Buffer.concat([
    tarMember('image.tar', 'isolated image fixture'),
    tarMember('image-reference', `${reference}\n`),
    tarMember('manifest.json', JSON.stringify(value)),
    extra,
    Buffer.alloc(1024),
  ]);
}

const image = `ghcr.io/attraccess/wago-cc100-runtime@sha256:${'a'.repeat(64)}`;

const manifest = {
  schemaVersion: 1,
  runtime: 'attraccess-wago-cc100',
  runtimeVersion: '0.1.0',
  protocolVersion: '1.0.0',
  image,
  hardware: {
    model: '751-9301',
    platform: 'linux/arm/v7',
    firmwareBaseline: '31',
    profile: 'cc100-751-9301-fw31-digital-v1',
  },
};

function tarMember(name: string, data: string | Buffer, type = '0') {
  const bytes = Buffer.from(data);
  const header = Buffer.alloc(512);
  header.write(name);
  for (const [offset, width, value] of [
    [100, 8, 420],
    [108, 8, 0],
    [116, 8, 0],
    [124, 12, bytes.length],
    [136, 12, 0],
  ])
    header.write(value.toString(8).padStart(width - 1, '0') + '\0', offset);
  header.fill(32, 148, 156);
  header.write(type, 156);
  header.write('ustar\0', 257);
  header.write('00', 263);
  header.write(
    header
      .reduce((sum, byte) => sum + byte, 0)
      .toString(8)
      .padStart(6, '0') + '\0 ',
    148,
  );
  return Buffer.concat([header, bytes, Buffer.alloc((512 - (bytes.length % 512)) % 512)]);
}

function upload(data = bundle(), checksum = createHash('sha256').update(data).digest('hex')) {
  return { bundle: Readable.from([data]), checksum: Readable.from([checksum]) };
}

describe('runtime artifact catalog (isolated disk)', () => {
  let root: string;
  let catalog: WagoRuntimeArtifactCatalog;
  beforeEach(async () => {
    jest.replaceProperty(process, 'env', { ...process.env });
    root = await mkdtemp(join(tmpdir(), 'wago-artifact-test-'));
    catalog = new WagoRuntimeArtifactCatalog(root);
  });
  afterEach(async () => {
    await catalog.onModuleDestroy();
    await rm(root, { recursive: true, force: true });
    jest.restoreAllMocks();
  });
  it('ignores a legacy imported release when local build assets have not been installed', async () => {
    process.env.STORAGE_ROOT = root;
    delete process.env.WAGO_CC100_BUILD_ASSETS_PATH;
    process.env.NODE_ENV = 'development';
    await catalog.import(upload());
    const service = new WagoRuntimeArtifactsService();
    try {
      expect(await service.current()).toBeNull();
      expect(await service.list()).toEqual([]);
      expect(await service.has()).toBe(false);
      await expect(service.acquire()).rejects.toThrow('Build');
      const source = upload();
      await expect(service.import(source)).rejects.toThrow('server build owns');
      expect(source.bundle.destroyed).toBe(true);
    } finally {
      await service.onModuleDestroy();
    }
  });

  it('requires bundled runtime assets when starting in production', async () => {
    process.env.STORAGE_ROOT = root;
    delete process.env.WAGO_CC100_BUILD_ASSETS_PATH;
    process.env.NODE_ENV = 'production';
    await catalog.import(upload());
    const service = new WagoRuntimeArtifactsService();
    try {
      await expect(service.onModuleInit()).rejects.toThrow();
      expect(await service.has()).toBe(false);
    } finally {
      await service.onModuleDestroy();
    }
  });

  describe('build-owned assets outside the plugin archive', () => {
    const imageId = `sha256:${'b'.repeat(64)}`;
    const buildId = 'c'.repeat(40);
    let owned: WagoBuildRuntimeCatalog;
    let directory: string;
    async function assets(data = bundle(), descriptor: Record<string, unknown> = {}) {
      const digest = createHash('sha256').update(data).digest('hex');
      await writeFile(join(directory, 'wago-cc100-runtime.tar'), data);
      await writeFile(join(directory, 'wago-cc100-runtime.tar.sha256'), digest);
      await writeFile(
        join(directory, 'release.json'),
        JSON.stringify({
          schemaVersion: 1,
          buildId,
          imageId,
          manifest,
          bundleBytes: data.length,
          bundleSha256: digest,
          ...descriptor,
        }),
      );
      return digest;
    }
    beforeEach(async () => {
      directory = await mkdtemp(join(root, 'build-'));
      owned = new WagoBuildRuntimeCatalog(root, directory);
    });
    afterEach(async () => owned.onModuleDestroy());

    it('loads installed local build assets through the same service used by commissioning and updates', async () => {
      process.env.STORAGE_ROOT = root;
      process.env.WAGO_CC100_BUILD_ASSETS_PATH = directory;
      process.env.NODE_ENV = 'development';
      const service = new WagoRuntimeArtifactsService();
      try {
        await service.onModuleInit();
        expect(await service.current()).toBeNull();
        const digest = await assets();
        expect(await service.current()).toMatchObject({ digest, buildId, imageId });
        expect(await service.has()).toBe(true);
        await catalog.import(upload(bundle({ ...manifest, runtimeVersion: '9.0.0' })));
        const snapshot = await service.acquire();
        expect(snapshot).toMatchObject({ digest, buildId, imageId });
        await snapshot.cleanup();
        expect(await service.list()).toHaveLength(1);
      } finally {
        await service.onModuleDestroy();
      }
    });

    it('selects only this build even when another build or a legacy importer changes shared storage', async () => {
      const digest = await assets();
      await owned.onModuleInit();
      await catalog.import(
        upload(
          bundle(
            { ...manifest, image: image.replace(/a{64}/, 'd'.repeat(64)) },
            image.replace(/a{64}/, 'd'.repeat(64)),
          ),
        ),
      );
      expect((await catalog.current())?.digest).not.toBe(digest);
      expect(await owned.current()).toMatchObject({ digest, imageId, buildId });
      expect(await owned.list()).toHaveLength(1);
      const snapshot = await owned.acquire();
      expect(snapshot.imageId).toBe(imageId);
      expect(await readFile(snapshot.path)).toEqual(bundle());
      await snapshot.cleanup();
    });

    it('uses the next server build rather than a persisted old release pointer', async () => {
      const previous = await catalog.import(upload());
      const nextImage = image.replace(/a{64}/, 'e'.repeat(64));
      const nextManifest = { ...manifest, image: nextImage };
      const digest = await assets(bundle(nextManifest, nextImage), { manifest: nextManifest });
      expect(await owned.current()).toMatchObject({ digest, image: nextImage });
      expect((await catalog.current())?.digest).toBe(previous.digest);
    });

    it('rejects importing and acquiring a stale session digest', async () => {
      await assets();
      const source = upload();
      await expect(owned.import(source)).rejects.toThrow('deployed server build owns');
      expect(source.bundle.destroyed).toBe(true);
      await expect(owned.acquire('f'.repeat(64))).rejects.toThrow('does not belong');
    });

    it.each([
      { bundleSha256: 'f'.repeat(64) },
      { bundleBytes: 1 },
      { imageId: 'mutable:latest' },
      { buildId: 'main' },
      { manifest: { ...manifest, protocolVersion: '2.0.0' } },
    ])('fails closed for mismatched/incompatible build metadata %j', async (descriptor) => {
      await assets(bundle(), descriptor);
      await expect(owned.onModuleInit()).rejects.toThrow();
      expect(await owned.has()).toBe(false);
    });

    it('fails closed with missing assets and retries after they are made available', async () => {
      expect(await owned.has()).toBe(false);
      await assets();
      expect(await owned.has()).toBe(true);
    });

    it('does not treat a changed tar, tag, or build ID as a new Docker image', () => {
      expect(
        sameRuntimeImage({ image, imageId }, { image: image.replace('runtime@', 'runtime:other@'), imageId }),
      ).toBe(true);
      expect(sameRuntimeImage({ image }, { image: image.replace('runtime@', 'runtime:other@') })).toBe(true);
      expect(sameRuntimeImage({ image, imageId }, { image, imageId: `sha256:${'d'.repeat(64)}` })).toBe(false);
    });
  });

  it('uses exactly cwd/storage when the existing application setting is absent', async () => {
    const previous = process.env.STORAGE_ROOT;
    delete process.env.STORAGE_ROOT;
    const cwd = jest.spyOn(process, 'cwd').mockReturnValue(root);
    try {
      const service = new WagoRuntimeArtifactsService();
      expect(await service.root()).toBe(await realpath(join(root, 'storage', 'wago-runtime-artifacts')));
      await service.onModuleDestroy();
    } finally {
      cwd.mockRestore();
      if (previous !== undefined) process.env.STORAGE_ROOT = previous;
    }
  });

  it('reconciles killed owners on access while retaining active owners, immutable objects, and unknown entries', async () => {
    const metadata = await catalog.import(upload());
    const snapshot = await catalog.acquire();
    const activeUpload = await catalog.createUploadDirectory();
    const catalogRoot = await catalog.root();
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
      const restarted = new WagoRuntimeArtifactCatalog(root);
      await restarted.current();
      await restarted.onModuleDestroy();
      expect((await lstat(abandonedUpload)).isDirectory()).toBe(true);
      expect((await lstat(abandonedSnapshot)).isDirectory()).toBe(true);
      expect(await readFile(pointer, 'utf8')).toBe(metadata.digest);
      const exited = once(owner, 'exit');
      owner.kill('SIGKILL');
      await exited;
      await catalog.current();
      for (const path of [abandonedUpload, abandonedSnapshot, pointer])
        await expect(lstat(path)).rejects.toMatchObject({ code: 'ENOENT' });
      expect((await lstat(activeUpload)).isDirectory()).toBe(true);
      expect((await lstat(unknown)).isDirectory()).toBe(true);
      expect(await readFile(snapshot.path)).toEqual(bundle());
      expect(await catalog.current()).toEqual(metadata);
      expect(await catalog.list()).toEqual([metadata]);
      // Dead-owner names still cannot authorize following a symlink.
      await symlink(snapshot.directory, abandonedUpload);
      await symlink(snapshot.path, pointer);
      await catalog.current();
      expect((await lstat(abandonedUpload)).isSymbolicLink()).toBe(true);
      expect((await lstat(pointer)).isSymbolicLink()).toBe(true);
      expect(await readFile(snapshot.path)).toEqual(bundle());
    } finally {
      if (owner.exitCode === null && owner.signalCode === null) owner.kill('SIGKILL');
      await snapshot.cleanup();
    }
  });

  it('bounds startup reconciliation and continues beyond retained entries on later accesses', async () => {
    const active = await catalog.createUploadDirectory();
    const staging = join(await catalog.root(), 'staging');
    const owner = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore' });
    await once(owner, 'spawn');
    const restarted = new WagoRuntimeArtifactCatalog(root);
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

  it('retains remote owners and malformed ownership markers', async () => {
    const active = await catalog.createUploadDirectory();
    const staging = join(await catalog.root(), 'staging');
    const remote = basename(active).replace(/-v1-[a-f0-9]{64}-/, `-v1-${'0'.repeat(64)}-`);
    const malformed = basename(active).replace('-v1-', '-v0-');
    await mkdir(join(staging, remote));
    await mkdir(join(staging, malformed));
    await catalog.root();
    expect(await readdir(staging)).toEqual(expect.arrayContaining([basename(active), remote, malformed]));
  });

  it('does not let the manifest-copy task cache and restore stale runtime/frontend bundles', async () => {
    const project = JSON.parse(await readFile(join(__dirname, '../project.json'), 'utf8'));
    expect(project.targets.build.outputs).toEqual([
      '{projectRoot}/package/package.json',
      '{projectRoot}/package/plugin.json',
    ]);
  });

  it('always packages and verifies the fresh generated outputs instead of restoring cached archives', async () => {
    const project = JSON.parse(await readFile(join(__dirname, '../project.json'), 'utf8'));
    for (const target of ['pack', 'pack-test', 'zip']) expect(project.targets[target].cache).toBe(false);
  });

  it('uses existing STORAGE_ROOT without accessing the plugin context or host ModuleRef', async () => {
    const previous = process.env.STORAGE_ROOT;
    process.env.STORAGE_ROOT = root;
    const get = jest.fn(() => {
      throw new Error('Host ModuleRef is not ready');
    });
    try {
      const module = await Test.createTestingModule({
        providers: [
          WagoRuntimeArtifactsService,
          { provide: Symbol.for('attraccess.plugin.context'), useValue: { get } },
        ],
      }).compile();
      expect(await module.get(WagoRuntimeArtifactsService).has()).toBe(false);
      expect(get).not.toHaveBeenCalled();
      expect(await readdir(root)).toEqual([]);
      await module.close();
    } finally {
      if (previous === undefined) delete process.env.STORAGE_ROOT;
      else process.env.STORAGE_ROOT = previous;
    }
  });

  it('persists immutable verified metadata and exposes only nonsecret API metadata', async () => {
    expect(await catalog.has()).toBe(false);
    const imported = await catalog.import(upload());
    expect(imported.manifest).toEqual(manifest);
    expect(Object.isFrozen(imported.manifest.hardware)).toBe(true);
    expect(Object.keys(imported).sort()).toEqual(['bytes', 'digest', 'image', 'manifest']);
    const restarted = new WagoRuntimeArtifactCatalog(root);
    expect(await restarted.current()).toEqual(imported);
    expect(await restarted.has()).toBe(true);
  });

  it('verifiedly backfills metadata for catalog objects written before metadata persistence', async () => {
    const imported = await catalog.import(upload());
    const metadataPath = join(await catalog.root(), 'objects', imported.digest, 'metadata.json');
    await rm(metadataPath);

    // Reimporting the same release must repair the existing object rather than discard staged metadata.
    await catalog.import(upload());
    const restarted = new WagoRuntimeArtifactCatalog(root);
    expect(await restarted.current()).toEqual(imported);
    expect(await restarted.list()).toEqual([imported]);
    expect(await restarted.has()).toBe(true);
    expect(JSON.parse(await readFile(metadataPath, 'utf8'))).toEqual(imported);
    await restarted.onModuleDestroy();
  });

  it('atomically backfills metadata for concurrent readers', async () => {
    const imported = await catalog.import(upload());
    const directory = join(await catalog.root(), 'objects', imported.digest);
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
      await expect(Promise.all([catalog.current(), catalog.list()])).resolves.toEqual([imported, [imported]]);
      expect(metadataRenames).toBe(2);
      expect(JSON.parse(await readFile(metadataPath, 'utf8'))).toEqual(imported);
    } finally {
      rename.mockRestore();
    }
  });

  it('leaves no partial metadata when backfill publication is interrupted', async () => {
    const imported = await catalog.import(upload());
    const directory = join(await catalog.root(), 'objects', imported.digest);
    const metadataPath = join(directory, 'metadata.json');
    await rm(metadataPath);
    const originalRename = filesystem.rename;
    const rename = jest.spyOn(filesystem, 'rename').mockImplementation(async (from, to) => {
      if (to === metadataPath) throw new Error('interrupted publication');
      return originalRename(from, to);
    });
    try {
      await expect(catalog.current()).rejects.toThrow('interrupted publication');
      await expect(lstat(metadataPath)).rejects.toMatchObject({ code: 'ENOENT' });
      expect((await readdir(directory)).some((name) => name.startsWith('.metadata-'))).toBe(false);
    } finally {
      rename.mockRestore();
    }
    await expect(catalog.current()).resolves.toEqual(imported);
  });

  it('retains old bundles across concurrent imports and snapshots survive activation', async () => {
    const first = await catalog.import(upload());
    const snapshot = await catalog.acquire();
    const second = bundle({ ...manifest, runtimeVersion: '0.2.0' });
    await Promise.all([catalog.import(upload(second)), catalog.import(upload(second))]);
    expect(await readFile(snapshot.path)).toEqual(bundle());
    expect(snapshot.digest).toBe(first.digest);
    expect(await catalog.list()).toHaveLength(2);
    expect((await catalog.current())?.manifest.runtimeVersion).toBe('0.2.0');
    const old = await catalog.acquire(first.digest);
    await old.cleanup();
    await snapshot.cleanup();
    await snapshot.cleanup();
    expect(await readdir(join(await catalog.root(), 'snapshots'))).toEqual([]);
    expect(await readdir(join(await catalog.root(), 'staging'))).toEqual([]);
  });

  it('validates a selected catalog artifact without creating a delivery snapshot', async () => {
    const imported = await catalog.import(upload());

    expect(await catalog.get(imported.digest)).toEqual(imported);
    expect(await readdir(join(await catalog.root(), 'snapshots'))).toEqual([]);
    await rm(join(await catalog.root(), 'objects', imported.digest, 'runtime.tar'));
    await expect(catalog.get(imported.digest)).rejects.toThrow();
  });

  it('lists bounded metadata without revalidating retained bundles', async () => {
    const imported = await catalog.import(upload());
    await rm(join(await catalog.root(), 'objects', imported.digest, 'runtime.tar'));
    expect(await catalog.list()).toEqual([imported]);
    await expect(catalog.acquire()).rejects.toThrow();
  });

  it('bounds concurrent imports and releases rejected input streams', async () => {
    const first = catalog.import(upload());
    const second = catalog.import(upload());
    const rejected = upload();
    await expect(catalog.import(rejected)).rejects.toThrow('Another runtime import');
    expect(Object.values(rejected).every((stream) => stream.destroyed)).toBe(true);
    await Promise.all([first, second]);
    expect(await catalog.list()).toHaveLength(1);
  });

  it.each([
    ['checksum', () => upload(bundle(), '0'.repeat(64))],
    ['manifest schema', () => upload(bundle({ ...manifest, schemaVersion: 2 }))],
    ['mutable image', () => upload(bundle({ ...manifest, image: 'latest' }))],
    ['hardware', () => upload(bundle({ ...manifest, hardware: { ...manifest.hardware, model: 'other' } }))],
    ['hardware profile', () => upload(bundle({ ...manifest, hardware: { ...manifest.hardware, profile: 'other' } }))],
    ['image mismatch', () => upload(bundle(manifest, image.replace('aaaa', 'bbbb')))],
    ['traversal', () => upload(bundle(manifest, image, tarMember('../escape', 'evil')))],
    ['symlink', () => upload(bundle(manifest, image, tarMember('evil', 'target', '2')))],
    ['duplicate', () => upload(bundle(manifest, image, tarMember('image.tar', 'duplicate')))],
    [
      'missing manifest',
      () =>
        upload(Buffer.concat([tarMember('image.tar', 'x'), tarMember('image-reference', image), Buffer.alloc(1024)])),
    ],
    [
      'malformed JSON',
      () =>
        upload(
          Buffer.concat([
            tarMember('image.tar', 'x'),
            tarMember('image-reference', image),
            tarMember('manifest.json', '{'),
            Buffer.alloc(1024),
          ]),
        ),
    ],
    ['truncated tar', () => upload(bundle().subarray(0, -512))],
  ])('rejects %s without changing current or leaving temporary files', async (_name, fixture) => {
    const previous = await catalog.import(upload());
    await expect(catalog.import(fixture())).rejects.toThrow('Runtime import failed');
    expect(await catalog.current()).toEqual(previous);
    expect(await readdir(join(await catalog.root(), 'staging'))).toEqual([]);
  });

  it('bounds tar and sidecar writes and cleans up stream errors', async () => {
    await expect(new WagoRuntimeArtifactCatalog(root, 100).import(upload())).rejects.toThrow();
    await expect(catalog.import(upload(bundle(), 'x'.repeat(4097)))).rejects.toThrow();
    const failed = upload();
    failed.bundle = Readable.from(
      (async function* () {
        yield 'start';
        throw new Error('private internal detail');
      })(),
    );
    await expect(catalog.import(failed)).rejects.toThrow('Runtime import failed');
    expect(await readdir(join(await catalog.root(), 'staging'))).toEqual([]);
  });

  it('rejects symlink storage traversal and altered persisted data', async () => {
    await symlink(root, join(root, 'wago-runtime-artifacts'));
    await expect(catalog.root()).rejects.toThrow('Invalid artifact storage');
    await rm(join(root, 'wago-runtime-artifacts'));
    const imported = await catalog.import(upload());
    const path = join(await catalog.root(), 'objects', imported.digest, 'runtime.tar');
    await rm(path);
    await symlink(join(root, 'outside'), path);
    await writeFile(join(root, 'outside'), bundle());
    await expect(catalog.acquire()).rejects.toThrow();
    expect(await catalog.has()).toBe(false);
    await expect(catalog.acquire('../outside')).rejects.toThrow();
  });

  it.each(['cc100-751-9301-fw31-digital-v1', 'cc100-751-9301-fw31-digital-rtu-v1'])(
    'round-trips the compressed packaging CLI, checksum and catalog import for %s',
    async (hardwareProfile) => {
      const exec = promisify(execFile);
      const inner = Buffer.concat([tarMember('fixture', 'isolated image fixture'), Buffer.alloc(1024)]);
      await writeFile(join(root, 'image.tar'), inner);
      await exec(process.execPath, [
        resolve(__dirname, '../scripts/package-runtime-artifact.mjs'),
        '--image-archive',
        join(root, 'image.tar'),
        '--image',
        image,
        '--version',
        '0.3.0',
        '--hardware-profile',
        hardwareProfile,
        '--out',
        join(root, 'releases'),
      ]);
      const release = join(root, 'releases', (await readdir(join(root, 'releases')))[0]);
      expect((await readdir(release)).sort()).toEqual(['wago-cc100-runtime.tar', 'wago-cc100-runtime.tar.sha256']);
      const data = await readFile(join(release, 'wago-cc100-runtime.tar'));
      const imageHeader = data.subarray(0, 512);
      const compressedBytes = parseInt(imageHeader.subarray(124, 136).toString('ascii'), 8);
      const compressedImage = data.subarray(512, 512 + compressedBytes);
      expect(compressedImage.subarray(0, 2)).toEqual(Buffer.from([0x1f, 0x8b]));
      expect(compressedImage.subarray(4, 8)).toEqual(Buffer.alloc(4)); // no gzip timestamp
      expect(gunzipSync(compressedImage)).toEqual(inner);
      const fixtureCatalog = new WagoRuntimeArtifactCatalog(root);
      const result = await fixtureCatalog.import(
        upload(data, await readFile(join(release, 'wago-cc100-runtime.tar.sha256'), 'utf8')),
      );
      expect(result.manifest.runtimeVersion).toBe('0.3.0');
      expect(result.manifest.hardware.profile).toBe(hardwareProfile);
      await exec(process.execPath, [
        resolve(__dirname, '../scripts/package-runtime-artifact.mjs'),
        '--image-archive',
        join(root, 'image.tar'),
        '--image',
        image,
        '--version',
        '0.3.0',
        '--hardware-profile',
        hardwareProfile,
        '--out',
        join(root, 'releases'),
      ]);
      const releases = await readdir(join(root, 'releases'));
      const secondRelease = releases.find((name) => name !== basename(release));
      expect(secondRelease).toBeDefined();
      expect(await readFile(join(root, 'releases', secondRelease ?? '', 'wago-cc100-runtime.tar'))).toEqual(data);
      await writeFile(join(root, 'compressed-image.tar'), gzipSync(inner));
      await expect(
        exec(process.execPath, [
          resolve(__dirname, '../scripts/package-runtime-artifact.mjs'),
          '--image-archive',
          join(root, 'compressed-image.tar'),
          '--image',
          image,
          '--version',
          '0.3.1',
          '--out',
          join(root, 'releases'),
        ]),
      ).rejects.toThrow();
      expect(await readdir(join(root, 'releases'))).toHaveLength(2);
    },
  );

  it('packages a fixed build-owned descriptor and verifies it without a manual import', async () => {
    const exec = promisify(execFile);
    await writeFile(
      join(root, 'image.tar'),
      Buffer.concat([tarMember('fixture', 'image fixture'), Buffer.alloc(1024)]),
    );
    const args = [
      resolve(__dirname, '../scripts/package-runtime-artifact.mjs'),
      '--image-archive',
      join(root, 'image.tar'),
      '--image',
      image,
      '--version',
      '0.1.0',
      '--build-id',
      'a'.repeat(40),
      '--image-id',
      `sha256:${'b'.repeat(64)}`,
      '--out',
      join(root, 'build-assets'),
    ];
    await exec(process.execPath, args);
    const directory = join(root, 'build-assets/cc100-build');
    const owned = new WagoBuildRuntimeCatalog(root, directory);
    try {
      await owned.onModuleInit();
      expect(await owned.current()).toMatchObject({ buildId: 'a'.repeat(40), imageId: `sha256:${'b'.repeat(64)}` });
      // Explicit rebuilds publish fresh assets, while running catalogs retain
      // their selected release until the server is restarted.
      const nextArgs = [...args];
      nextArgs[nextArgs.indexOf('--version') + 1] = '0.2.0';
      await exec(process.execPath, nextArgs);
      expect((await owned.current()).manifest.runtimeVersion).toBe('0.1.0');
      const restarted = new WagoBuildRuntimeCatalog(root, directory);
      try {
        expect((await restarted.current()).manifest.runtimeVersion).toBe('0.2.0');
      } finally {
        await restarted.onModuleDestroy();
      }
      expect(await readdir(join(root, 'build-assets'))).toEqual(['cc100-build']);
    } finally {
      await owned.onModuleDestroy();
    }
  });

  const dockerImage = process.env.WAGO_DOCKER_TEST_IMAGE;
  (dockerImage ? it : it.skip)(
    'loads the packaged release image member with a real Docker daemon',
    async () => {
      const exec = promisify(execFile);
      const archive = join(root, 'docker-image.tar');
      if (!dockerImage) throw new Error('Set WAGO_DOCKER_TEST_IMAGE to run this integration test');
      await exec('docker', ['save', '-o', archive, dockerImage]);
      await exec(process.execPath, [
        resolve(__dirname, '../scripts/package-runtime-artifact.mjs'),
        '--image-archive',
        archive,
        '--image',
        image,
        '--version',
        '0.4.0',
        '--out',
        join(root, 'releases'),
      ]);
      const release = join(root, 'releases', (await readdir(join(root, 'releases')))[0]);
      const data = await readFile(join(release, 'wago-cc100-runtime.tar'));
      const importedCatalog = new WagoRuntimeArtifactCatalog(root);
      const imported = await importedCatalog.import(
        upload(data, await readFile(join(release, 'wago-cc100-runtime.tar.sha256'), 'utf8')),
      );
      expect(imported.manifest.runtimeVersion).toBe('0.4.0');
      await importedCatalog.onModuleDestroy();
      const size = parseInt(data.subarray(124, 136).toString('ascii'), 8);
      const compressedImage = join(root, 'image-compressed.tar');
      await writeFile(compressedImage, data.subarray(512, 512 + size));
      const { stdout } = await exec('docker', ['load', '-i', compressedImage], { maxBuffer: 1024 * 1024 });
      expect(stdout).toContain('Loaded image:');
    },
    120000,
  );

  it('redacts filesystem failures from the read-only runtime controller', async () => {
    const controller = new WagoArtifactsController(catalog as WagoRuntimeArtifactsService);
    const source = join(root, 'private-source', 'runtime.tar');
    const rawError = new Error(`EACCES: permission denied, open '${source}'`);
    for (const method of ['list', 'current'] as const) {
      const spy = jest.spyOn(catalog, method).mockRejectedValueOnce(rawError);
      await expect(controller[method]()).rejects.toMatchObject({ message: expect.not.stringContaining(root) });
      spy.mockRestore();
    }
  });
});
