import { Injectable, NotFoundException } from '@nestjs/common';
import { createHash } from 'crypto';
import { createReadStream } from 'fs';
import { open } from 'fs/promises';
import type { AttractapConversionTarget } from '@attraccess/application-models';
import { SecureImageService, type SecureImageKind, type SignedSecureImage } from '../secure-boot/secure-image.service';

export interface ConversionDigests {
  digest0: string;
  digest1: string;
}

async function sha256File(path: string): Promise<string> {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path)) hash.update(chunk as Buffer);
  return hash.digest('hex');
}

/** Largest chunk a reader may ask for (the session's TLS record limit). */
export const CONVERSION_CHUNK_BYTES = 4096;

/**
 * The signed app and bootloader a conversion streams. They are signed with the key whose digest becomes KEY0; the
 * reader has nothing burned yet, so the target digests stand in for the reader's recorded ones.
 */
@Injectable()
export class ConversionImages {
  private readonly hashes = new Map<string, string>();

  public constructor(private readonly images: SecureImageService) {}

  public async signed(
    firmwareName: string,
    variant: string,
    kind: SecureImageKind,
    digests: ConversionDigests,
  ): Promise<SignedSecureImage> {
    const reader = {
      secureBootDigest0: digests.digest0,
      secureBootDigest1: digests.digest1,
      secureBootSignerDigest: digests.digest0,
    };
    // A plain reader has no SECURE_VERSION burned yet: 0 is the floor the image is compared with.
    return await this.images.getSignedImage(firmwareName, variant, kind, reader, 0);
  }

  public async sha256(image: SignedSecureImage): Promise<string> {
    const cached = this.hashes.get(image.path);
    if (cached) return cached;
    const hash = await sha256File(image.path);
    this.hashes.set(image.path, hash);
    return hash;
  }

  /** Signs (or reads from the cache) both images and describes them. Throws NotFound without a key or image. */
  public async target(
    firmwareName: string,
    variant: string,
    version: string,
    digests: ConversionDigests,
  ): Promise<AttractapConversionTarget> {
    const app = await this.signed(firmwareName, variant, 'app', digests);
    const bootloader = await this.signed(firmwareName, variant, 'bootloader', digests);
    return {
      firmwareName,
      variant,
      version,
      secureVersion: app.secureVersion,
      appSha256: await this.sha256(app),
      appSize: app.size,
      bootloaderSha256: await this.sha256(bootloader),
      bootloaderSize: bootloader.size,
    };
  }

  /** One chunk of a signed image; empty past its end. */
  public async read(image: SignedSecureImage, offset: number, length: number): Promise<Buffer> {
    if (offset >= image.size) return Buffer.alloc(0);
    const size = Math.min(length, CONVERSION_CHUNK_BYTES, image.size - offset);
    const handle = await open(image.path, 'r');
    try {
      const buffer = Buffer.alloc(size);
      const { bytesRead } = await handle.read(buffer, 0, size, offset);
      return buffer.subarray(0, bytesRead);
    } finally {
      await handle.close();
    }
  }
}

export const isMissingKeyOrImage = (error: unknown) => error instanceof NotFoundException;
