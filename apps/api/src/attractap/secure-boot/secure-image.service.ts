import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Attractap } from '@attraccess/database-entities';
import { createHash } from 'crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { AttractapFirmwareService } from '../firmware.service';
import { SecureBootKeyService } from './secure-boot-key.service';
import { secureBootKeyDigest, signSecureBootImage, verifySecureBootImage } from './secure-boot-signer';

export type SecureImageKind = 'app' | 'bootloader';

export interface SignedSecureImage {
  data: Buffer;
  keyDigest: string;
  secureVersion: number;
  profileMarker: string;
}

/**
 * Signs the packaged secure-profile images per build and key and caches the result under
 * STORAGE_ROOT, keyed by the unsigned image's hash and the key digest. Signing needs a held key
 * whose digest the reader has burned; secured readers never receive a lower secureVersion than
 * the one they report.
 */
@Injectable()
export class SecureImageService {
  private readonly cacheRoot = join(
    process.env.STORAGE_ROOT || join(process.cwd(), 'storage'),
    'attractap-secure-images',
  );

  constructor(
    private readonly firmware: AttractapFirmwareService,
    private readonly keys: SecureBootKeyService,
  ) {}

  async getSignedImage(
    firmwareName: string,
    variantName: string,
    kind: SecureImageKind,
    reader: Pick<Attractap, 'secureBootDigest0' | 'secureBootDigest1'>,
    reportedSecureVersion = 0,
  ): Promise<SignedSecureImage> {
    const source = this.firmware.getSecureImageSource(firmwareName, variantName);
    if (!source) throw new NotFoundException('No secure image is packaged for this firmware');
    const { secureVersion, profileMarker } = source.secureImage;
    if (secureVersion < reportedSecureVersion) {
      throw new ConflictException('The secure image is older than the version the reader reports (anti-rollback)');
    }
    const key = await this.keys.signingKeyForReader(reader);
    if (!key) throw new NotFoundException('No signing key for this reader');

    const unsigned = readFileSync(kind === 'app' ? source.appPath : source.bootloaderPath);
    const keyDigest = secureBootKeyDigest(key);
    const cachePath = join(
      this.cacheRoot,
      createHash('sha256').update(unsigned).digest('hex'),
      keyDigest,
      `${kind}.signed.bin`,
    );
    if (existsSync(cachePath)) {
      const cached = readFileSync(cachePath);
      if (verifySecureBootImage(cached, key).valid) return { data: cached, keyDigest, secureVersion, profileMarker };
    }
    const data = signSecureBootImage(unsigned, key);
    mkdirSync(dirname(cachePath), { recursive: true });
    const temp = `${cachePath}.${process.pid}.tmp`;
    writeFileSync(temp, data);
    renameSync(temp, cachePath);
    return { data, keyDigest, secureVersion, profileMarker };
  }
}
