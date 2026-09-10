#!/usr/bin/env node
// Release engineering only. Operators import the three output files in the UI.
// node scripts/package-runtime-artifact.mjs --image-archive image.tar --image ghcr.io/attraccess/wago-cc100-runtime@sha256:… --version 0.1.0 --signing-key /release/key --out ./release
import { constants, createReadStream } from 'node:fs';
import { open, mkdir, mkdtemp, rename, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { Readable } from 'node:stream';
import { createGzip } from 'node:zlib';

const { values } = parseArgs({
  options: Object.fromEntries(
    ['image-archive', 'image', 'version', 'signing-key', 'out'].map((name) => [name, { type: 'string' }]),
  ),
});
if (
  !Object.values(values).every(Boolean) ||
  Object.keys(values).length !== 5 ||
  !/^ghcr\.io\/attraccess\/wago-cc100-runtime(?::[A-Za-z0-9_.-]+)?@sha256:[a-f0-9]{64}$/.test(values.image) ||
  values.image.length > 300 ||
  !/^\d+\.\d+\.\d+(?:-[A-Za-z0-9.-]+)?$/.test(values.version) ||
  values.version.length > 80
) {
  throw new Error('Supply --image-archive, digest-pinned --image, --version, --signing-key, and --out');
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
    profile: 'cc100-751-9301-fw31-digital-v1',
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
    const tar = await open(join(stage, filename), 'wx', 0o600);
    try {
      async function write(data) {
        let offset = 0;
        while (offset < data.length) offset += (await tar.write(data, offset, data.length - offset)).bytesWritten;
      }
      // Keep the signed outer archive plain USTAR. Docker load understands gzip
      // inside image.tar, avoiding an uncompressed image on the CC100's small root
      // partition during upload and extraction. Compression happens before signing.
      const magic = Buffer.alloc(2);
      await archive.read(magic, 0, magic.length, 0);
      await write(Buffer.alloc(512));
      async function* imageChunks() {
        let bytes = 0;
        for await (const chunk of archive.createReadStream({ autoClose: false, start: 0 })) {
          bytes += chunk.length;
          if (bytes > info.size) throw new Error('Image changed during packaging');
          yield chunk;
        }
        if (bytes !== info.size) throw new Error('Image changed during packaging');
      }
      const input = Readable.from(imageChunks());
      const payload = magic.equals(Buffer.from([0x1f, 0x8b])) ? input : input.compose(createGzip({ level: 9 }));
      let payloadBytes = 0;
      for await (const chunk of payload) {
        payloadBytes += chunk.length;
        if (payloadBytes > 512 * 1024 * 1024 - 32768) throw new Error('Oversized compressed image archive');
        await write(chunk);
      }
      const imageHeader = header('image.tar', payloadBytes);
      let headerOffset = 0;
      while (headerOffset < imageHeader.length)
        headerOffset += (await tar.write(imageHeader, headerOffset, imageHeader.length - headerOffset, headerOffset))
          .bytesWritten;
      await write(Buffer.alloc((512 - (payloadBytes % 512)) % 512));
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
    await archive.close();
  }
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(join(stage, filename))) hash.update(chunk);
  const checksum = await open(join(stage, `${filename}.sha256`), 'wx', 0o600);
  try {
    await checksum.writeFile(`${hash.digest('hex')}  ${filename}\n`);
    await checksum.sync();
  } finally {
    await checksum.close();
  }
  await new Promise((resolvePromise, reject) => {
    const child = spawn(
      'ssh-keygen',
      ['-Y', 'sign', '-f', resolve(values['signing-key']), '-n', 'attraccess-wago-runtime', join(stage, filename)],
      { stdio: 'ignore' },
    );
    child.once('error', () => reject(new Error('Runtime signing could not start')));
    child.once('exit', (code) => (code === 0 ? resolvePromise() : reject(new Error('Runtime signing failed'))));
  });
  // Publish a whole versioned directory. Never overwrite a previous release.
  await rename(stage, join(output, `cc100-${values.version}-${Date.now()}`));
  process.stdout.write('Signed runtime release packaged successfully. Import its .tar, .sha256 and .sig files.\n');
} finally {
  await rm(stage, { recursive: true, force: true });
}
