import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { Readable } from 'node:stream';
import { gunzipSync, gzipSync } from 'node:zlib';
import { generateManagementKey } from './wago-management-key';
import { WagoRuntimeArtifactCatalog } from './wago-runtime-artifacts';

it.each([false, true])(
  'compresses the image payload before signing and preserves the exact Docker archive (already compressed: %p)',
  async (compressed) => {
    const directory = await mkdtemp(join(tmpdir(), 'wago-packaging-'));
    const key = generateManagementKey();
    const catalog = new WagoRuntimeArtifactCatalog(directory, key.publicKey.split(' ')[1]);
    try {
      const image = Buffer.alloc(2 * 1024 * 1024, 'docker-image-fixture');
      await writeFile(join(directory, 'image.tar'), compressed ? gzipSync(image) : image);
      await writeFile(join(directory, 'signing-key'), key.privateKey, { mode: 0o600 });
      execFileSync(
        process.execPath,
        [
          resolve('apps/plugins/wago/scripts/package-runtime-artifact.mjs'),
          '--image-archive',
          join(directory, 'image.tar'),
          '--image',
          `ghcr.io/attraccess/wago-cc100-runtime@sha256:${'a'.repeat(64)}`,
          '--version',
          '0.1.0',
          '--signing-key',
          join(directory, 'signing-key'),
          '--out',
          directory,
        ],
        { timeout: 10_000, stdio: 'pipe' },
      );
      const release = (await readdir(directory)).find((name) => name.startsWith('cc100-'));
      if (!release) throw new Error('Packaged release missing');
      const file = (suffix = '') => readFile(join(directory, release, `wago-cc100-runtime.tar${suffix}`));
      const bundle = await file();
      const metadata = await catalog.import({
        bundle: Readable.from([bundle]),
        checksum: Readable.from([await file('.sha256')]),
        signature: Readable.from([await file('.sig')]),
      });
      const snapshot = await catalog.acquire(metadata.digest);
      expect(await readFile(snapshot.path)).toEqual(bundle);
      expect(bundle.length).toBeLessThan(image.length / 10);
      const payloadSize = parseInt(bundle.subarray(124, 136).toString().replace(/\0.*$/, ''), 8);
      expect(gunzipSync(bundle.subarray(512, 512 + payloadSize))).toEqual(image);
      await snapshot.cleanup();
    } finally {
      await catalog.onModuleDestroy();
      await rm(directory, { recursive: true, force: true });
    }
  },
);
