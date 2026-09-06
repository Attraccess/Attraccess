import { createHash, generateKeyPairSync, sign } from 'node:crypto';

// A new, untrusted Ed25519 key exists only in this process. Never read release keys.
export function signingFixture() {
  const keys = generateKeyPairSync('ed25519');
  function sshString(value: string | Buffer) {
    const bytes = Buffer.from(value);
    const length = Buffer.alloc(4);
    length.writeUInt32BE(bytes.length);
    return Buffer.concat([length, bytes]);
  }
  const publicKey = Buffer.concat([
    sshString('ssh-ed25519'),
    sshString(keys.publicKey.export({ format: 'der', type: 'spki' }).subarray(-32)),
  ]);
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
    const namespace = 'attraccess-wago-runtime';
    const signed = Buffer.concat([
      Buffer.from('SSHSIG'),
      sshString(namespace),
      sshString(''),
      sshString('sha512'),
      sshString(createHash('sha512').update(bundle).digest()),
    ]);
    const versionBytes = Buffer.alloc(4);
    versionBytes.writeUInt32BE(1);
    const packet = Buffer.concat([
      Buffer.from('SSHSIG'),
      versionBytes,
      sshString(publicKey),
      sshString(namespace),
      sshString(''),
      sshString('sha512'),
      sshString(Buffer.concat([sshString('ssh-ed25519'), sshString(sign(null, signed, keys.privateKey))])),
    ]);
    return {
      bundle,
      checksum: Buffer.from(digest),
      signature: Buffer.from(
        `-----BEGIN SSH SIGNATURE-----\n${packet.toString('base64')}\n-----END SSH SIGNATURE-----\n`,
      ),
      digest,
      manifest,
    };
  }
  return { trustedKey: publicKey.toString('base64'), release };
}
