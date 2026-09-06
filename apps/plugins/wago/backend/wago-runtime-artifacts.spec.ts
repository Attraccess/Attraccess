import { createHash, generateKeyPairSync, randomUUID, sign } from 'node:crypto';
import { lstat, mkdir, mkdtemp, readFile, readdir, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import filesystem from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join, resolve } from 'node:path';
import { PassThrough, Readable } from 'node:stream';
import { execFile, spawn } from 'node:child_process';
import { once } from 'node:events';
import { ClientRequest, IncomingMessage, request as httpRequest, Server } from 'node:http';
import { promisify } from 'node:util';
import { WagoRuntimeArtifactCatalog, WagoRuntimeArtifactsService } from './wago-runtime-artifacts';
import { WAGO_RUNTIME_RELEASE_KEY } from './wago-runtime-artifacts-verification';
import { CallHandler, ExecutionContext, INestApplication } from '@nestjs/common';
import * as fileFields from '@nestjs/platform-express/multer/interceptors/file-fields.interceptor';
import { Reflector } from '@nestjs/core';
import { DualAuthGuard, EffectivePermissionsGuard } from '@attraccess/plugins-backend-sdk';
import { Test } from '@nestjs/testing';
import { defer, lastValueFrom, of } from 'rxjs';
import { WagoArtifactsController, WagoArtifactUploadInterceptor } from './wago-artifacts.controller';
import request from 'supertest';

const keys = generateKeyPairSync('ed25519');
function sshString(data: Buffer | string) {
  const bytes = Buffer.from(data);
  const size = Buffer.alloc(4);
  size.writeUInt32BE(bytes.length);
  return Buffer.concat([size, bytes]);
}
const publicKey = Buffer.concat([
  sshString('ssh-ed25519'),
  sshString(keys.publicKey.export({ format: 'der', type: 'spki' }).subarray(-32)),
]);
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
function bundle(value: unknown = manifest, reference = image, extra = Buffer.alloc(0)) {
  return Buffer.concat([
    tarMember('image.tar', 'isolated image fixture'),
    tarMember('image-reference', `${reference}\n`),
    tarMember('manifest.json', JSON.stringify(value)),
    extra,
    Buffer.alloc(1024),
  ]);
}
function signature(data: Buffer, namespace = 'attraccess-wago-runtime') {
  const digest = createHash('sha512').update(data).digest();
  const signed = Buffer.concat([
    Buffer.from('SSHSIG'),
    sshString(namespace),
    sshString(''),
    sshString('sha512'),
    sshString(digest),
  ]);
  const version = Buffer.alloc(4);
  version.writeUInt32BE(1);
  const packet = Buffer.concat([
    Buffer.from('SSHSIG'),
    version,
    sshString(publicKey),
    sshString(namespace),
    sshString(''),
    sshString('sha512'),
    sshString(Buffer.concat([sshString('ssh-ed25519'), sshString(sign(null, signed, keys.privateKey))])),
  ]);
  return `-----BEGIN SSH SIGNATURE-----\n${packet.toString('base64')}\n-----END SSH SIGNATURE-----\n`;
}
function upload(data = bundle(), checksum = createHash('sha256').update(data).digest('hex'), sig = signature(data)) {
  return { bundle: Readable.from([data]), checksum: Readable.from([checksum]), signature: Readable.from([sig]) };
}

async function waitUntil(assertion: () => Promise<void> | void) {
  const deadline = Date.now() + 2000;
  for (;;) {
    try {
      await assertion();
      return;
    } catch (error) {
      if (Date.now() >= deadline) throw error;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  }
}

function uploadContext(req: Readable): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => req, getResponse: () => ({}) }),
  } as unknown as ExecutionContext;
}

describe('signed runtime artifact catalog (isolated disk and ephemeral keys only)', () => {
  let root: string;
  let catalog: WagoRuntimeArtifactCatalog;
  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'wago-artifact-test-'));
    catalog = new WagoRuntimeArtifactCatalog(root, publicKey.toString('base64'));
  });
  afterEach(async () => {
    await catalog.onModuleDestroy();
    await rm(root, { recursive: true, force: true });
  });
  describe('loopback multipart lifecycle', () => {
    let app: INestApplication;
    let url: string;
    let staging: string;
    let clients: ClientRequest[];
    let incoming: IncomingMessage[];

    function incompleteUpload() {
      const client = httpRequest(`${url}/wago/runtime-artifacts/import`, {
        method: 'POST',
        headers: { 'content-type': 'multipart/form-data; boundary=disconnect-test' },
      });
      client.on('error', () => undefined); // Socket destruction is intentional.
      clients.push(client);
      client.write(
        '--disconnect-test\r\nContent-Disposition: form-data; name="bundle"; filename="runtime.tar"\r\n' +
          'Content-Type: application/octet-stream\r\n\r\npartial runtime file',
      );
      return client;
    }

    async function expectWriting(count: number) {
      await waitUntil(async () => {
        const directories = await readdir(staging);
        expect(directories).toHaveLength(count);
        for (const directory of directories) {
          expect((await lstat(join(staging, directory, 'bundle'))).size).toBeGreaterThan(0);
        }
      });
    }

    function completeUpload(admin = true) {
      const data = bundle();
      return request(url)
        .post('/wago/runtime-artifacts/import')
        .set('x-test-admin', String(admin))
        .attach('bundle', data, 'runtime.tar')
        .attach('checksum', Buffer.from(createHash('sha256').update(data).digest('hex')), 'runtime.tar.sha256')
        .attach('signature', Buffer.from(signature(data)), 'runtime.tar.sig');
    }

    beforeEach(async () => {
      clients = [];
      incoming = [];
      const module = await Test.createTestingModule({
        controllers: [WagoArtifactsController],
        providers: [WagoArtifactUploadInterceptor, { provide: WagoRuntimeArtifactsService, useValue: catalog }],
      })
        .overrideGuard(DualAuthGuard)
        .useValue({
          canActivate(context: ExecutionContext) {
            const req = context.switchToHttp().getRequest();
            incoming.push(req);
            req.user = {
              id: 1,
              effectivePermissions: new Set(req.headers['x-test-admin'] === 'false' ? [] : ['system.settings.manage']),
            };
            return true;
          },
        })
        .compile();
      app = module.createNestApplication({ logger: false });
      await app.listen(0, '127.0.0.1');
      url = await app.getUrl();
      staging = join(await catalog.root(), 'staging');
    });

    afterEach(async () => {
      for (const client of clients) client.destroy();
      (app.getHttpServer() as Server).closeAllConnections();
      await app.close();
      jest.restoreAllMocks();
    });

    it('removes a disconnected first file and accepts both replacement upload slots', async () => {
      const first = incompleteUpload();
      const second = incompleteUpload();
      await expectWriting(2);
      await completeUpload().expect(409);
      first.destroy();
      second.destroy();
      await waitUntil(async () => expect(await readdir(staging)).toEqual([]));

      const replacements = [incompleteUpload(), incompleteUpload()];
      await expectWriting(2);
      await completeUpload().expect(409);
      for (const replacement of replacements) replacement.destroy();
      await waitUntil(async () => expect(await readdir(staging)).toEqual([]));
      const response = await completeUpload().expect(201);
      expect(response.body.manifest).toEqual(manifest);
      expect(JSON.stringify(response.body)).not.toContain(root);
      expect(await readdir(staging)).toEqual([]);
    });

    it('removes a directory created after the incoming request has already aborted', async () => {
      let release!: () => void;
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      const create = catalog.createUploadDirectory.bind(catalog);
      const allocation = jest.spyOn(catalog, 'createUploadDirectory').mockImplementationOnce(async () => {
        await gate;
        return create();
      });
      const client = incompleteUpload();
      try {
        await waitUntil(() => expect(allocation).toHaveBeenCalledTimes(1));
        client.destroy();
        await waitUntil(() => expect(incoming[0].aborted).toBe(true));
      } finally {
        release();
      }
      await allocation.mock.results[0].value;
      await waitUntil(async () => expect(await readdir(staging)).toEqual([]));
      await completeUpload().expect(201);
      expect(await readdir(staging)).toEqual([]);
    });

    it('runs the real admin guard before allocating upload storage', async () => {
      const allocation = jest.spyOn(catalog, 'createUploadDirectory');
      await completeUpload(false).expect(403);
      expect(allocation).not.toHaveBeenCalled();
      expect(await readdir(staging)).toEqual([]);
    });
  });
  describe('upload cancellation lifecycle', () => {
    let interceptor: WagoArtifactUploadInterceptor;
    let staging: string;
    let sources: PassThrough[];

    function startUpload() {
      const source = Object.assign(new PassThrough(), {
        headers: {
          'content-type': 'multipart/form-data; boundary=cancellation-test',
          'transfer-encoding': 'chunked',
        },
      });
      sources.push(source);
      const handle = jest.fn();
      const result = interceptor.intercept(uploadContext(source), { handle }).then(
        () => undefined,
        (error: Error) => error,
      );
      source.write(
        '--cancellation-test\r\nContent-Disposition: form-data; name="bundle"; filename="runtime.tar"\r\n' +
          'Content-Type: application/octet-stream\r\n\r\npartial runtime file',
      );
      return { source, result, handle };
    }

    beforeEach(async () => {
      interceptor = new WagoArtifactUploadInterceptor(catalog as WagoRuntimeArtifactsService);
      staging = join(await catalog.root(), 'staging');
      sources = [];
    });

    afterEach(() => {
      for (const source of sources) {
        source.emit('aborted');
        source.destroy();
      }
      jest.restoreAllMocks();
    });

    it('destroys active multipart files at the whole-upload deadline and clears the timer', async () => {
      const timers = jest.spyOn(global, 'setTimeout');
      const clear = jest.spyOn(global, 'clearTimeout');
      const pending = startUpload();
      await waitUntil(async () => {
        const [directory] = await readdir(staging);
        expect(directory).toBeDefined();
        expect((await lstat(join(staging, directory, 'bundle'))).size).toBeGreaterThan(0);
      });
      const index = timers.mock.calls.findIndex(([, delay]) => delay === 10 * 60 * 1000);
      expect(index).toBeGreaterThanOrEqual(0);
      const timer = timers.mock.results[index].value as NodeJS.Timeout;
      expect(timer.hasRef()).toBe(false);
      timers.mock.calls[index][0]();
      expect(await pending.result).toMatchObject({
        message: 'Runtime upload timed out. Retry with the signed release files.',
      });
      expect(pending.source.destroyed).toBe(true);
      expect(pending.handle).not.toHaveBeenCalled();
      expect(clear).toHaveBeenCalledWith(timer);
      expect(await readdir(staging)).toEqual([]);
      const replacements = [startUpload(), startUpload()];
      await waitUntil(async () => expect(await readdir(staging)).toHaveLength(2));
      for (const replacement of replacements) replacement.source.emit('aborted');
      await Promise.all(replacements.map(({ result }) => result));
      expect(await readdir(staging)).toEqual([]);
    });

    it('releases capacity once during directory creation and removes the late directory', async () => {
      let release!: () => void;
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      const create = catalog.createUploadDirectory.bind(catalog);
      const allocation = jest.spyOn(catalog, 'createUploadDirectory').mockImplementationOnce(async () => {
        await gate;
        return create();
      });
      const pending = startUpload();
      try {
        await waitUntil(() => expect(allocation).toHaveBeenCalledTimes(1));
        pending.source.emit('aborted');
        const replacements = [startUpload(), startUpload()];
        await waitUntil(async () => expect(await readdir(staging)).toHaveLength(2));
        expect(await startUpload().result).toMatchObject({ message: 'Two runtime uploads are already in progress' });
        // The old request finishing cleanup must not release another upload's slot.
        release();
        expect(await pending.result).toMatchObject({ message: expect.stringContaining('interrupted') });
        expect(pending.handle).not.toHaveBeenCalled();
        expect(await readdir(staging)).toHaveLength(2);
        expect(await startUpload().result).toMatchObject({ message: 'Two runtime uploads are already in progress' });
        for (const replacement of replacements) replacement.source.emit('aborted');
        await Promise.all(replacements.map(({ result }) => result));
        expect(await readdir(staging)).toEqual([]);
      } finally {
        release();
      }
    });

    it('settles cancellation before Multer settles and prevents late controller execution', async () => {
      let finishMulter!: () => void;
      const gate = new Promise<void>((resolve) => {
        finishMulter = resolve;
      });
      const parser = jest.spyOn(fileFields, 'FileFieldsInterceptor').mockReturnValueOnce(
        class {
          async intercept(_context: ExecutionContext, next: CallHandler) {
            await gate;
            return next.handle();
          }
        },
      );
      const pending = startUpload();
      try {
        await waitUntil(() => expect(parser).toHaveBeenCalledTimes(1));
        pending.source.emit('aborted');
        expect(await pending.result).toMatchObject({ message: expect.stringContaining('interrupted') });
        expect(await readdir(staging)).toEqual([]);
        const replacements = [startUpload(), startUpload()];
        await waitUntil(async () => expect(await readdir(staging)).toHaveLength(2));
        finishMulter();
        await new Promise((resolve) => setImmediate(resolve));
        expect(pending.handle).not.toHaveBeenCalled();
        expect(await startUpload().result).toMatchObject({ message: 'Two runtime uploads are already in progress' });
        for (const replacement of replacements) replacement.source.emit('aborted');
        await Promise.all(replacements.map(({ result }) => result));
        expect(await readdir(staging)).toEqual([]);
      } finally {
        finishMulter();
      }
    });

    it('sanitizes success-finalization failures and clears its timer and abort listener', async () => {
      const timers = jest.spyOn(global, 'setTimeout');
      const clear = jest.spyOn(global, 'clearTimeout');
      const source = new PassThrough();
      sources.push(source);
      // A non-multipart request finishes Multer immediately, isolating response finalization.
      Object.assign(source, { headers: {} });
      const response = await interceptor.intercept(uploadContext(source), { handle: () => of({ success: true }) });
      const remove = jest.spyOn(filesystem, 'rm').mockRejectedValueOnce(new Error(`EACCES: ${root}/private`));
      try {
        await expect(lastValueFrom(response)).rejects.toMatchObject({
          message: 'Runtime upload cleanup could not be completed. Retry shortly.',
          status: 503,
        });
        expect(remove).toHaveBeenCalledTimes(1);
        expect(source.listenerCount('aborted')).toBe(0);
        const index = timers.mock.calls.findIndex(([, delay]) => delay === 10 * 60 * 1000);
        expect(index).toBeGreaterThanOrEqual(0);
        expect(clear).toHaveBeenCalledWith(timers.mock.results[index].value);
      } finally {
        remove.mockRestore();
      }
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
      const restarted = new WagoRuntimeArtifactCatalog(root, publicKey.toString('base64'));
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
  it('keeps the release anchor equal to the packaged public key', async () => {
    expect((await readFile(resolve(__dirname, '../cc100-runtime/signing-public-key.pub'), 'utf8')).trim()).toBe(
      `ssh-ed25519 ${WAGO_RUNTIME_RELEASE_KEY}`,
    );
  });

  it('does not let the manifest-copy task cache and restore stale runtime/frontend bundles', async () => {
    const project = JSON.parse(await readFile(join(__dirname, '../project.json'), 'utf8'));
    expect(project.targets.build.outputs).toEqual(['{projectRoot}/package/package.json', '{projectRoot}/package/plugin.json']);
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
      expect(await readdir(root)).toEqual(['wago-runtime-artifacts']);
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
    const restarted = new WagoRuntimeArtifactCatalog(root, publicKey.toString('base64'));
    expect(await restarted.current()).toEqual(imported);
    expect(await restarted.has()).toBe(true);
  });
  it('verifiedly backfills metadata for catalog objects written before metadata persistence', async () => {
    const imported = await catalog.import(upload());
    const metadataPath = join(await catalog.root(), 'objects', imported.digest, 'metadata.json');
    await rm(metadataPath);

    // Reimporting the same release must repair the existing object rather than discard staged metadata.
    await catalog.import(upload());
    const restarted = new WagoRuntimeArtifactCatalog(root, publicKey.toString('base64'));
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
    ['signature', () => upload(bundle(), undefined, signature(Buffer.from('other')))],
    ['namespace', () => upload(bundle(), undefined, signature(bundle(), 'wrong'))],
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
  it('rejects uploads signed with an untrusted fixture key', async () => {
    await expect(new WagoRuntimeArtifactCatalog(root).import(upload())).rejects.toThrow('Runtime import failed');
  });
  it('bounds tar and sidecar writes and cleans up stream errors', async () => {
    await expect(
      new WagoRuntimeArtifactCatalog(root, publicKey.toString('base64'), 100).import(upload()),
    ).rejects.toThrow();
    await expect(catalog.import(upload(bundle(), 'x'.repeat(4097)))).rejects.toThrow();
    await expect(catalog.import(upload(bundle(), undefined, 'x'.repeat(16385)))).rejects.toThrow();
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
  it('round-trips the packaging CLI and real OpenSSH signatures without exposing signing stderr', async () => {
    const exec = promisify(execFile);
    const privateKey = join(root, 'fixture-key');
    await exec('ssh-keygen', ['-q', '-t', 'ed25519', '-N', '', '-f', privateKey]);
    await writeFile(join(root, 'image.tar'), 'isolated fake docker image');
    await exec(process.execPath, [
      resolve(__dirname, '../scripts/package-runtime-artifact.mjs'),
      '--image-archive',
      join(root, 'image.tar'),
      '--image',
      image,
      '--version',
      '0.3.0',
      '--signing-key',
      privateKey,
      '--out',
      join(root, 'releases'),
    ]);
    const release = join(root, 'releases', (await readdir(join(root, 'releases')))[0]);
    const data = await readFile(join(release, 'wago-cc100-runtime.tar'));
    const trusted = (await readFile(`${privateKey}.pub`, 'utf8')).split(' ')[1];
    const fixtureCatalog = new WagoRuntimeArtifactCatalog(root, trusted);
    const result = await fixtureCatalog.import(
      upload(
        data,
        await readFile(join(release, 'wago-cc100-runtime.tar.sha256'), 'utf8'),
        await readFile(join(release, 'wago-cc100-runtime.tar.sig'), 'utf8'),
      ),
    );
    expect(result.manifest.runtimeVersion).toBe('0.3.0');
    expect(result.manifest.hardware.profile).toBe(manifest.hardware.profile);
  });
  it('redacts filesystem failures from controller and upload interceptor errors', async () => {
    const controller = new WagoArtifactsController(catalog as WagoRuntimeArtifactsService);
    const source = join(root, 'private-source', 'runtime.tar');
    const rawError = new Error(`EACCES: permission denied, open '${source}'`);
    for (const method of ['list', 'current'] as const) {
      const spy = jest.spyOn(catalog, method).mockRejectedValueOnce(rawError);
      await expect(controller[method]()).rejects.toMatchObject({ message: expect.not.stringContaining(root) });
      spy.mockRestore();
    }
    await expect(
      controller.import({ bundle: [{ path: source }], checksum: [{ path: source }], signature: [{ path: source }] }),
    ).rejects.toMatchObject({ message: 'Runtime import failed. Check the signed release files and retry.' });
    const spy = jest.spyOn(catalog, 'createUploadDirectory').mockRejectedValueOnce(rawError);
    const interceptor = new WagoArtifactUploadInterceptor(catalog as WagoRuntimeArtifactsService);
    await expect(interceptor.intercept(uploadContext(new PassThrough()), { handle: jest.fn() })).rejects.toMatchObject({
      message: 'Runtime upload could not be completed. Retry with the signed release files.',
    });
    spy.mockRestore();
  });
  it('accepts browser multipart uploads and enforces the real admin permission guard before allocating disk', async () => {
    const controller = new WagoArtifactsController(catalog as WagoRuntimeArtifactsService);
    const interceptor = new WagoArtifactUploadInterceptor(catalog as WagoRuntimeArtifactsService);
    const guard = new EffectivePermissionsGuard(new Reflector());
    // Real multipart parser and permission metadata, in-memory HTTP request stream: no listening socket.
    async function multipart(parts: [string, Buffer][], admin = true) {
      const boundary = 'isolated-artifact-boundary';
      const body = Buffer.concat([
        ...parts.map(([name, data]) =>
          Buffer.concat([
            Buffer.from(
              `--${boundary}\r\nContent-Disposition: form-data; name="${name}"; filename="../../operator-file"\r\nContent-Type: application/octet-stream\r\n\r\n`,
            ),
            data,
            Buffer.from('\r\n'),
          ]),
        ),
        Buffer.from(`--${boundary}--\r\n`),
      ]);
      const req = Object.assign(Readable.from([body]), {
        headers: { 'content-type': `multipart/form-data; boundary=${boundary}`, 'content-length': String(body.length) },
        user: { id: 1, effectivePermissions: new Set(admin ? ['system.settings.manage'] : []) },
        files: {},
      });
      const context = {
        getClass: () => WagoArtifactsController,
        getHandler: () => controller.import,
        switchToHttp: () => ({ getRequest: () => req, getResponse: () => ({}) }),
      } as unknown as ExecutionContext;
      guard.canActivate(context);
      return lastValueFrom(
        await interceptor.intercept(context, { handle: () => defer(() => controller.import(req.files)) }),
      );
    }
    const data = bundle();
    const checksum = createHash('sha256').update(data).digest('hex');
    await expect(multipart([['bundle', data]], false)).rejects.toThrow('Insufficient permissions');
    expect(await readdir(root)).toEqual([]);
    const result = await multipart([
      ['bundle', data],
      ['checksum', Buffer.from(checksum)],
      ['signature', Buffer.from(signature(data))],
    ]);
    expect(result.manifest).toEqual(manifest);
    expect(result).not.toHaveProperty('path');
    expect(Object.keys(result).sort()).toEqual(['bytes', 'digest', 'image', 'manifest']);
    expect(JSON.stringify(result)).not.toContain(root);
    expect(JSON.stringify(result)).not.toContain('operator-file');
    expect(await controller.current()).toEqual(result);
    expect(await controller.list()).toEqual([result]);
    await expect(multipart([['bundle', data]])).rejects.toThrow('Select the runtime');
    await expect(multipart([['key', Buffer.from('not trusted')]])).rejects.toThrow();
    await expect(multipart([['signature', Buffer.alloc(16385)]])).rejects.toThrow();
    await expect(
      multipart([
        ['bundle', data],
        ['bundle', data],
      ]),
    ).rejects.toThrow();
    expect(await readdir(join(await catalog.root(), 'staging'))).toEqual([]);
  });
});
