#!/usr/bin/env node
// Build-owned offline assets; the server supplies these outside the npm plugin archive.
// node scripts/package-runtime-artifact.mjs --image-archive image.tar --image ghcr.io/attraccess/wago-cc100-runtime@sha256:… --version 0.1.0 --out ./release
import { constants, createReadStream, createWriteStream } from 'node:fs';
import { open, mkdir, mkdtemp, rename, rm, writeFile, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { pipeline } from 'node:stream/promises';
import { Transform } from 'node:stream';

const { values } = parseArgs({
  options: Object.fromEntries(
    ['image-archive', 'image', 'version', 'out', 'hardware-profile', 'build-id', 'image-id'].map((name) => [
      name,
      { type: 'string' },
    ]),
  ),
});
const hardwareProfile = values['hardware-profile'] ?? 'cc100-751-9301-fw31-digital-v1';
if (
  (values['build-id'] || values['image-id']) &&
  (!/^[a-f0-9]{40}$/.test(values['build-id'] ?? '') || !/^sha256:[a-f0-9]{64}$/.test(values['image-id'] ?? ''))
) {
  throw new Error('Build-owned assets require a commit --build-id and Docker config digest --image-id');
}
if (
  !['image-archive', 'image', 'version', 'out'].every((name) => values[name]) ||
  !['cc100-751-9301-fw31-digital-v1', 'cc100-751-9301-fw31-digital-rtu-v1'].includes(hardwareProfile) ||
  !/^ghcr\.io\/attraccess\/wago-cc100-runtime(?::[A-Za-z0-9_.-]+)?@sha256:[a-f0-9]{64}$/.test(values.image) ||
  values.image.length > 300 ||
  !/^\d+\.\d+\.\d+(?:-[A-Za-z0-9.-]+)?$/.test(values.version) ||
  values.version.length > 80
) {
  throw new Error('Supply --image-archive, digest-pinned --image, --version, and --out');
}
const manifest = {
  schemaVersion: 1,
  runtime: 'attraccess-wago-cc100',
  runtimeVersion: values.version,
  protocolVersion: '1.0.0',
  image: values.image,
  hardware: {
    model: '751-9301',
    platform: 'linux/arm/v7',
    firmwareBaseline: '31',
    profile: hardwareProfile,
  },
};
const output = resolve(values.out);
await mkdir(output, { recursive: true });
const stage = await mkdtemp(join(output, '.packaging-'));
const filename = 'wago-cc100-runtime.tar';
function header(name, bytes) {
  const result = Buffer.alloc(512);
  result.write(name, 0);
  for (const [offset, width, value] of [
    [100, 8, 0o644],
    [108, 8, 0],
    [116, 8, 0],
    [124, 12, bytes],
    [136, 12, 0],
  ]) {
    const field = value.toString(8).padStart(width - 1, '0') + '\0';
    if (field.length !== width) throw new Error('Runtime image is too large');
    result.write(field, offset);
  }
  result.fill(32, 148, 156);
  result[156] = 48;
  result.write('ustar\0', 257);
  result.write('00', 263);
  const sum = result.reduce((total, byte) => total + byte, 0);
  result.write(sum.toString(8).padStart(6, '0') + '\0 ', 148);
  return result;
}
try {
  const archive = await open(values['image-archive'], constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const info = await archive.stat();
    if (!info.isFile() || !info.size || info.size > 512 * 1024 * 1024 - 32768)
      throw new Error('Invalid or oversized image archive');
    const magic = Buffer.alloc(2);
    await archive.read(magic, 0, magic.length, 0);
    if (magic.equals(Buffer.from([0x1f, 0x8b]))) throw new Error('Supply an uncompressed Docker image archive');
    // Compress before writing the outer header, whose size must be exact. gzip
    // -n omits source filename and timestamp; the CLI's -9 output is smaller
    // than Node's zlib output for this image and fits the controller's preflight.
    const compressedPath = join(stage, 'compressed-image');
    let sourceBytes = 0;
    const gzip = spawn('gzip', ['-n', '-9', '-c'], { stdio: ['pipe', 'pipe', 'ignore'] });
    const finished = new Promise((resolvePromise, reject) => {
      gzip.once('error', () => reject(new Error('Runtime compression could not start')));
      gzip.once('exit', (code) => (code === 0 ? resolvePromise() : reject(new Error('Runtime compression failed'))));
    });
    try {
      await Promise.all([
        pipeline(
          archive.createReadStream({ autoClose: false }),
          new Transform({
            transform(chunk, _encoding, callback) {
              sourceBytes += chunk.length;
              callback(sourceBytes <= info.size ? null : new Error('Image changed during packaging'), chunk);
            },
          }),
          gzip.stdin,
        ),
        pipeline(gzip.stdout, createWriteStream(compressedPath, { flags: 'wx', mode: 0o600 })),
        finished,
      ]);
    } catch (error) {
      gzip.kill();
      throw error;
    }
    if (sourceBytes !== info.size || (await archive.stat()).size !== info.size)
      throw new Error('Image changed during packaging');
    const compressed = await open(compressedPath, constants.O_RDONLY | constants.O_NOFOLLOW);
    try {
      const compressedInfo = await compressed.stat();
      if (!compressedInfo.size || compressedInfo.size > 512 * 1024 * 1024 - 32768)
        throw new Error('Invalid or oversized compressed image archive');
      const tar = await open(join(stage, filename), 'wx', 0o600);
      try {
        async function write(data) {
          let offset = 0;
          while (offset < data.length) offset += (await tar.write(data, offset, data.length - offset)).bytesWritten;
        }
        await write(header('image.tar', compressedInfo.size));
        let bytes = 0;
        for await (const chunk of compressed.createReadStream({ autoClose: false })) {
          bytes += chunk.length;
          if (bytes > compressedInfo.size) throw new Error('Compressed image changed during packaging');
          await write(chunk);
        }
        if (bytes !== compressedInfo.size) throw new Error('Compressed image changed during packaging');
        await write(Buffer.alloc((512 - (compressedInfo.size % 512)) % 512));
        for (const [name, text] of [
          ['image-reference', `${values.image}\n`],
          ['manifest.json', `${JSON.stringify(manifest)}\n`],
        ]) {
          const data = Buffer.from(text);
          await write(header(name, data.length));
          await write(data);
          await write(Buffer.alloc((512 - (data.length % 512)) % 512));
        }
        await write(Buffer.alloc(1024));
        await tar.sync();
      } finally {
        await tar.close();
      }
    } finally {
      await compressed.close();
    }
    await rm(compressedPath);
  } finally {
    await archive.close();
  }
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(join(stage, filename))) hash.update(chunk);
  const digest = hash.digest('hex');
  const checksum = await open(join(stage, `${filename}.sha256`), 'wx', 0o600);
  try {
    await checksum.writeFile(`${digest}  ${filename}\n`);
    await checksum.sync();
  } finally {
    await checksum.close();
  }
  if (values['build-id']) {
    await writeFile(
      join(stage, 'release.json'),
      JSON.stringify({
        schemaVersion: 1,
        buildId: values['build-id'],
        imageId: values['image-id'],
        bundleBytes: (await stat(join(stage, filename))).size,
        bundleSha256: digest,
        manifest,
      }) + '\n',
      { flag: 'wx', mode: 0o644 },
    );
    // CI and local dev use the same fixed directory. Never replace assets in place
    // while a server is running; a deployed build owns them for its lifetime.
    const target = join(output, 'cc100-build');
    const backup = await mkdtemp(join(output, '.previous-build-'));
    const previous = join(backup, 'assets');
    let replaced = false;
    let published = false;
    try {
      try {
        await rename(target, previous);
        replaced = true;
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
      }
      try {
        await rename(stage, target);
        published = true;
      } catch (error) {
        if (replaced) {
          await rename(previous, target);
          replaced = false;
        }
        throw error;
      }
    } finally {
      if (published || !replaced) await rm(backup, { recursive: true, force: true });
    }
  } else {
    await rename(stage, join(output, `cc100-${values.version}-${Date.now()}`));
  }
  process.stdout.write('Runtime release packaged successfully.\n');
} finally {
  await rm(stage, { recursive: true, force: true });
}
