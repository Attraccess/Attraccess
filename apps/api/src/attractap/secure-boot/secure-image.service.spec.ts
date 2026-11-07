import { generateKeyPairSync } from 'crypto';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { SecureImageService } from './secure-image.service';
import { secureBootKeyDigest, verifySecureBootImage } from './secure-boot-signer';

jest.setTimeout(60_000);

describe('SecureImageService', () => {
  const root = mkdtempSync(join(tmpdir(), 'secure-image-'));
  const previousRoot = process.env.STORAGE_ROOT;
  const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 3072 });
  const digest = secureBootKeyDigest(privateKey);
  const reader = { secureBootDigest0: digest, secureBootDigest1: null };
  let secureVersion = 2;
  let packaged = true;

  const firmware = {
    getSecureImageSource: () =>
      packaged
        ? {
            firmware: {},
            secureImage: { secureVersion, profileMarker: 'attractap-secure-profile-v1' },
            appPath: join(root, 'app.bin'),
            bootloaderPath: join(root, 'bootloader.bin'),
          }
        : undefined,
  };
  const keys = {
    signingKeyForReader: async (r: { secureBootDigest0: string | null }) =>
      r.secureBootDigest0 === digest ? privateKey : null,
  };

  beforeAll(() => {
    process.env.STORAGE_ROOT = join(root, 'storage');
    mkdirSync(root, { recursive: true });
    writeFileSync(join(root, 'app.bin'), Buffer.alloc(9000, 1));
    writeFileSync(join(root, 'bootloader.bin'), Buffer.alloc(3000, 2));
  });
  afterAll(() => {
    if (previousRoot === undefined) delete process.env.STORAGE_ROOT;
    else process.env.STORAGE_ROOT = previousRoot;
    rmSync(root, { recursive: true, force: true });
  });

  const service = () => new SecureImageService(firmware as never, keys as never);
  const cacheFiles = () => readdirSync(join(root, 'storage', 'attractap-secure-images'), { recursive: true });

  it('signs per build and key, caches under STORAGE_ROOT and regenerates a missing or damaged entry', async () => {
    const first = await service().getSignedImage('attractap', 'touch-v2', 'app', reader);
    expect(verifySecureBootImage(first.data, privateKey)).toEqual({ valid: true, keyDigest: digest });
    expect(first.secureVersion).toBe(2);
    expect(cacheFiles().filter((f) => String(f).endsWith('app.signed.bin'))).toHaveLength(1);

    const [relative] = cacheFiles().filter((f) => String(f).endsWith('app.signed.bin'));
    const path = join(root, 'storage', 'attractap-secure-images', String(relative));
    const second = await service().getSignedImage('attractap', 'touch-v2', 'app', reader);
    expect(second.data.equals(first.data)).toBe(true);

    writeFileSync(path, Buffer.from('damaged'));
    // RSA-PSS is randomized, so a regenerated image differs but verifies.
    const repaired = await service().getSignedImage('attractap', 'touch-v2', 'app', reader);
    expect(verifySecureBootImage(repaired.data, privateKey).valid).toBe(true);
    rmSync(path);
    await service().getSignedImage('attractap', 'touch-v2', 'app', reader);
    expect(existsSync(path)).toBe(true);

    const bootloader = await service().getSignedImage('attractap', 'touch-v2', 'bootloader', reader);
    expect(verifySecureBootImage(bootloader.data, privateKey).valid).toBe(true);
  });

  it('refuses a secureVersion below the reader, a reader without a held key and an unpackaged variant', async () => {
    await expect(service().getSignedImage('attractap', 'touch-v2', 'app', reader, 3)).rejects.toThrow('anti-rollback');
    await expect(service().getSignedImage('attractap', 'touch-v2', 'app', reader, 2)).resolves.toBeDefined();
    await expect(
      service().getSignedImage('attractap', 'touch-v2', 'app', { secureBootDigest0: 'x', secureBootDigest1: null }),
    ).rejects.toThrow('No signing key for this reader');
    packaged = false;
    await expect(service().getSignedImage('attractap', 'touch-v2', 'app', reader)).rejects.toThrow('No secure image');
    packaged = true;
    secureVersion = 1;
  });
});
