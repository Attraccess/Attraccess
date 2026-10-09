import { createHash } from 'node:crypto';
import { Readable } from 'node:stream';
export const image = `ghcr.io/attraccess/wago-cc100-runtime@sha256:${'a'.repeat(64)}`;
export const manifest = {
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
export function tarMember(name: string, data: string | Buffer, type = '0') {
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
export function bundle(value: unknown = manifest, reference = image, extra = Buffer.alloc(0)) {
  return Buffer.concat([
    tarMember('image.tar', 'isolated image fixture'),
    tarMember('image-reference', `${reference}\n`),
    tarMember('manifest.json', JSON.stringify(value)),
    extra,
    Buffer.alloc(1024),
  ]);
}
export function upload(data = bundle(), checksum = createHash('sha256').update(data).digest('hex')) {
  return { bundle: Readable.from([data]), checksum: Readable.from([checksum]) };
}
