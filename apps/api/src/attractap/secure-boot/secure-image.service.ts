import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Attractap } from '@attraccess/database-entities';
import { createHash, KeyObject, randomBytes } from 'crypto';
import { mkdir, readFile, rename, writeFile } from 'fs/promises';
import { dirname, join } from 'path';
import { resolveStorageRoot } from '../../config/storage-path';
import { AttractapSecureImage } from '../dtos/firmware.dto';
import { AttractapFirmwareService } from '../firmware.service';
import { SecureBootKeyService } from './secure-boot-key.service';
import { secureBootKeyDigest, signSecureBootImage, verifySecureBootImage } from './secure-boot-signer';

export type SecureImageKind = 'app' | 'bootloader';

/** A signed image in the cache; streamed from `path` like the plain OTA file. */
export interface SignedSecureImage {
  path: string;
  size: number;
  keyDigest: string;
  secureVersion: number;
  profileMarker: string;
}

const sha256 = (data: Buffer) => createHash('sha256').update(data).digest('hex');

/**
 * Signs the packaged secure-profile images per build and key and caches the result under
 * STORAGE_ROOT, keyed by the unsigned image's hash and the key digest. Signing needs a held key
 * whose digest the reader has burned; secured readers never receive a lower secureVersion than
 * the one they report.
 */
@Injectable()
export class SecureImageService {
  private readonly cacheRoot = join(resolveStorageRoot(), 'attractap-secure-images');

  constructor(
    private readonly firmware: AttractapFirmwareService,
    private readonly keys: SecureBootKeyService,
  ) {}

  /** The image must be the one the build described: matching hash and, for the app, the profile marker. */
  private assertPackagedImage(image: AttractapSecureImage, kind: SecureImageKind, unsigned: Buffer, hash: string) {
    if (hash !== (kind === 'app' ? image.appSha256 : image.bootloaderSha256)) {
      throw new ConflictException(`The packaged secure ${kind} image does not match its manifest`);
    }
    if (kind === 'app' && !unsigned.includes(image.profileMarker)) {
      throw new ConflictException('The secure app does not carry the secure profile marker');
    }
  }

  /** A cache entry counts only if it is this very image, signed by this key. */
  private async readCached(path: string, unsigned: Buffer, key: KeyObject) {
    const cached = await readFile(path).catch(() => null);
    const intact =
      cached !== null &&
      cached.subarray(0, unsigned.length).equals(unsigned) &&
      verifySecureBootImage(cached, key).valid;
    return intact ? cached : null;
  }

  async getSignedImage(
    firmwareName: string,
    variantName: string,
    kind: SecureImageKind,
    reader: Pick<Attractap, 'secureBootDigest0' | 'secureBootDigest1' | 'secureBootSignerDigest'>,
    reportedSecureVersion: number,
  ): Promise<SignedSecureImage> {
    const source = this.firmware.getSecureImageSource(firmwareName, variantName);
    if (!source) throw new NotFoundException('No secure image is packaged for this firmware');
    const { secureVersion, profileMarker } = source.secureImage;
    if (!Number.isInteger(secureVersion) || !Number.isInteger(reportedSecureVersion)) {
      throw new ConflictException('The secure version of the image or the reader is unknown');
    }
    if (secureVersion < reportedSecureVersion) {
      throw new ConflictException('The secure image is older than the version the reader reports (anti-rollback)');
    }
    const key = await this.keys.signingKeyForReader(reader);
    if (!key) throw new NotFoundException('No signing key for this reader');

    const unsigned = await readFile(kind === 'app' ? source.appPath : source.bootloaderPath);
    const unsignedHash = sha256(unsigned);
    this.assertPackagedImage(source.secureImage, kind, unsigned, unsignedHash);
    const keyDigest = secureBootKeyDigest(key);
    const path = join(this.cacheRoot, unsignedHash, keyDigest, `${kind}.signed.bin`);
    const result = { path, keyDigest, secureVersion, profileMarker };
    const cached = await this.readCached(path, unsigned, key);
    if (cached) return { ...result, size: cached.length };

    const data = signSecureBootImage(unsigned, key);
    await mkdir(dirname(path), { recursive: true });
    const temp = `${path}.${process.pid}.${randomBytes(4).toString('hex')}.tmp`;
    await writeFile(temp, data);
    await rename(temp, path);
    return { ...result, size: data.length };
  }
}
