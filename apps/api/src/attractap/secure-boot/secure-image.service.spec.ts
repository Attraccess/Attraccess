import { createHash, generateKeyPairSync } from 'crypto';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { SecureImageService } from './secure-image.service';
import { secureBootKeyDigest, signSecureBootImage, verifySecureBootImage } from './secure-boot-signer';

jest.setTimeout(60_000);

const MARKER = 'attractap-secure-profile-v1';
const sha = (data: Buffer) => createHash('sha256').update(data).digest('hex');

describe('SecureImageService', () => {
  const appContent = Buffer.concat([Buffer.alloc(9000, 1), Buffer.from(MARKER)]);
  const bootloaderContent = Buffer.alloc(3000, 2);
  const root = mkdtempSync(join(tmpdir(), 'secure-image-'));
  const previousRoot = process.env.STORAGE_ROOT;
  const [privateKey, otherKey] = [0, 1].map(() => generateKeyPairSync('rsa', { modulusLength: 3072 }).privateKey);
  const digest = secureBootKeyDigest(privateKey);
  const otherDigest = secureBootKeyDigest(otherKey);
  const reader = { secureBootDigest0: digest, secureBootDigest1: null, secureBootSignerDigest: null };
  let secureVersion: number;
  let packaged: boolean;
  let manifestAppSha: string;

  const source = () => ({
    firmware: {},
    secureImage: {
      secureVersion,
      profileMarker: MARKER,
      appSha256: manifestAppSha,
      bootloaderSha256: sha(bootloaderContent),
    },
    appPath: join(root, 'app.bin'),
    bootloaderPath: join(root, 'bootloader.bin'),
  });
  const firmware = { getSecureImageSource: () => (packaged ? source() : undefined) };
  const keys = {
    signingKeyForReader: async (r: { secureBootDigest0: string | null }) =>
      r.secureBootDigest0 === digest ? privateKey : r.secureBootDigest0 === otherDigest ? otherKey : null,
  };

  beforeAll(() => {
    process.env.STORAGE_ROOT = join(root, 'storage');
    mkdirSync(root, { recursive: true });
  });
  beforeEach(() => {
    secureVersion = 2;
    packaged = true;
    manifestAppSha = sha(appContent);
    writeFileSync(join(root, 'app.bin'), appContent);
    writeFileSync(join(root, 'bootloader.bin'), bootloaderContent);
  });
  afterAll(() => {
    if (previousRoot === undefined) delete process.env.STORAGE_ROOT;
    else process.env.STORAGE_ROOT = previousRoot;
    rmSync(root, { recursive: true, force: true });
  });

  const service = () => new SecureImageService(firmware as never, keys as never);
  const cacheRoot = () => join(root, 'storage', 'attractap-secure-images');
  const signed = (path: string) => readFileSync(path);

  it('signs per build and key, caches under STORAGE_ROOT and regenerates a missing or damaged entry', async () => {
    const first = await service().getSignedImage('attractap', 'touch-v2', 'app', reader, 0);
    expect(first.path).toBe(join(cacheRoot(), sha(appContent), digest, 'app.signed.bin'));
    expect(verifySecureBootImage(signed(first.path), privateKey)).toEqual({ valid: true, keyDigest: digest });
    expect(first.size).toBe(signed(first.path).length);
    expect(first.secureVersion).toBe(2);

    const cachedBytes = signed(first.path);
    await service().getSignedImage('attractap', 'touch-v2', 'app', reader, 0);
    expect(signed(first.path).equals(cachedBytes)).toBe(true); // served from the cache, not re-signed

    writeFileSync(first.path, Buffer.from('damaged'));
    await service().getSignedImage('attractap', 'touch-v2', 'app', reader, 0);
    expect(verifySecureBootImage(signed(first.path), privateKey).valid).toBe(true);
    rmSync(first.path);
    await service().getSignedImage('attractap', 'touch-v2', 'app', reader, 0);
    expect(verifySecureBootImage(signed(first.path), privateKey).valid).toBe(true);

    const bootloader = await service().getSignedImage('attractap', 'touch-v2', 'bootloader', reader, 0);
    expect(verifySecureBootImage(signed(bootloader.path), privateKey).valid).toBe(true);
  });

  it('keeps one cache entry per key and per build', async () => {
    const mine = await service().getSignedImage('attractap', 'touch-v2', 'app', reader, 0);
    const other = await service().getSignedImage(
      'attractap',
      'touch-v2',
      'app',
      { ...reader, secureBootDigest0: otherDigest },
      0,
    );
    expect(other.path).toBe(join(cacheRoot(), sha(appContent), otherDigest, 'app.signed.bin'));
    expect(other.path).not.toBe(mine.path);

    const nextBuild = Buffer.concat([appContent, Buffer.from('next build')]);
    writeFileSync(join(root, 'app.bin'), nextBuild);
    manifestAppSha = sha(nextBuild);
    const rebuilt = await service().getSignedImage('attractap', 'touch-v2', 'app', reader, 0);
    expect(rebuilt.path).toBe(join(cacheRoot(), sha(nextBuild), digest, 'app.signed.bin'));
    expect(readdirSync(cacheRoot())).toEqual(expect.arrayContaining([sha(appContent), sha(nextBuild)]));
  });

  it('replaces a cached file that is a different image, even when this key signed it', async () => {
    const entry = await service().getSignedImage('attractap', 'touch-v2', 'app', reader, 0);
    writeFileSync(entry.path, signSecureBootImage(Buffer.alloc(9000, 9), privateKey));
    await service().getSignedImage('attractap', 'touch-v2', 'app', reader, 0);
    expect(signed(entry.path).subarray(0, appContent.length).equals(appContent)).toBe(true);
  });

  it('refuses a secureVersion below the reader, an unknown version, a reader without a held key and an unpackaged variant', async () => {
    await expect(service().getSignedImage('attractap', 'touch-v2', 'app', reader, 3)).rejects.toThrow('anti-rollback');
    await expect(service().getSignedImage('attractap', 'touch-v2', 'app', reader, 2)).resolves.toBeDefined();
    await expect(service().getSignedImage('attractap', 'touch-v2', 'app', reader, Number.NaN)).rejects.toThrow(
      'unknown',
    );
    secureVersion = undefined as never; // a manifest without secureVersion must not slip past the floor
    await expect(service().getSignedImage('attractap', 'touch-v2', 'app', reader, 1)).rejects.toThrow('unknown');
    secureVersion = 2;
    await expect(
      service().getSignedImage('attractap', 'touch-v2', 'app', { ...reader, secureBootDigest0: 'x' }, 0),
    ).rejects.toThrow('No signing key for this reader');
    packaged = false;
    await expect(service().getSignedImage('attractap', 'touch-v2', 'app', reader, 0)).rejects.toThrow(
      'No secure image',
    );
  });

  it('checks the manifest hash and the profile marker before signing', async () => {
    writeFileSync(join(root, 'app.bin'), Buffer.concat([appContent, Buffer.from('x')])); // hash differs from the manifest
    await expect(service().getSignedImage('attractap', 'touch-v2', 'app', reader, 0)).rejects.toThrow('does not match');

    const noMarkerContent = Buffer.alloc(9000, 1);
    writeFileSync(join(root, 'app.bin'), noMarkerContent);
    manifestAppSha = sha(noMarkerContent);
    await expect(service().getSignedImage('attractap', 'touch-v2', 'app', reader, 0)).rejects.toThrow('profile marker');
  });
});
