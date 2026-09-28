import { createHash } from 'node:crypto';

export function releaseFixture() {
  function member(name: string, value: string) {
    const bytes = Buffer.from(value);
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
    header.write('0', 156);
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
  function release(version: string) {
    const image = `ghcr.io/attraccess/wago-cc100-runtime@sha256:${'a'.repeat(64)}`;
    const manifest = {
      schemaVersion: 1,
      runtime: 'attraccess-wago-cc100',
      runtimeVersion: version,
      protocolVersion: '1.0.0',
      image,
      hardware: {
        model: '751-9301',
        platform: 'linux/arm/v7',
        firmwareBaseline: '31',
        profile: 'cc100-751-9301-fw31-digital-v1',
      },
    };
    const bundle = Buffer.concat([
      member('image.tar', 'non-executable image fixture'),
      member('image-reference', `${image}\n`),
      member('manifest.json', JSON.stringify(manifest)),
      Buffer.alloc(1024),
    ]);
    const digest = createHash('sha256').update(bundle).digest('hex');
    return {
      bundle,
      checksum: Buffer.from(digest),
      digest,
      manifest,
    };
  }
  return { release };
}
