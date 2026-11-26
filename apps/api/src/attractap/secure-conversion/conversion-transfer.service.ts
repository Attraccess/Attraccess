import { Inject, Injectable, Logger } from '@nestjs/common';
import type { AttractapSecureConversionRecord } from '@attraccess/application-models';
import type { SignedSecureImage } from '../secure-boot/secure-image.service';
import type { SessionSecurityState } from '../security/session-security-state';
import { ConversionImages } from './conversion-images';
import { ConversionProtocolService } from './conversion-protocol.service';
import { ATTRACTAP_SECURE_CONVERSION_STORE, type AttractapSecureConversionStore } from './secure-conversion-store.port';

export type ConversionImageKind = 'app' | 'bootloader';

/** Progress is written at most every this many bytes, and at the end of each image. */
const PROGRESS_WRITE_STEP = 256 * 1024;
const TRANSFER_STATES = ['transferring', 'digests-burned'];

export interface ConversionChunkRequest {
  id: unknown;
  conversion: unknown;
  offset: unknown;
  length: unknown;
}

/**
 * Serves the signed images of the active conversion in chunks, the way OTA does: a chunk answer carries no offset, so
 * a repeated request on the same connection is ignored. Signed images are looked up once per conversion; the caches
 * hold the active conversion only.
 */
@Injectable()
export class ConversionTransferService {
  private readonly logger = new Logger(ConversionTransferService.name);
  /** The conversion the caches below belong to. */
  private cachedFor: number | null = null;
  private readonly signed = new Map<ConversionImageKind, SignedSecureImage>();
  /** Per session: end of the last chunk served, by conversion and image. */
  private readonly served = new WeakMap<SessionSecurityState, Map<string, number>>();
  private persisted = 0;

  public constructor(
    @Inject(ATTRACTAP_SECURE_CONVERSION_STORE) private readonly conversions: AttractapSecureConversionStore,
    private readonly images: ConversionImages,
    private readonly protocol: ConversionProtocolService,
  ) {}

  /** A plain update must not be offered meanwhile: the conversion stages into the same inactive app slot. */
  public async stagingInUse(readerId: number): Promise<boolean> {
    return (await this.conversions.findActive())?.readerId === readerId;
  }

  private cacheFor(conversion: AttractapSecureConversionRecord): void {
    if (this.cachedFor === conversion.id) return;
    this.cachedFor = conversion.id;
    this.signed.clear();
    this.persisted = 0;
  }

  /** The signed image, or null when the catalog changed under the conversion (the conversion then fails). */
  private async image(conversion: AttractapSecureConversionRecord, kind: ConversionImageKind) {
    const known = this.signed.get(kind);
    if (known) return known;
    const { firmwareName, variant } = conversion.target;
    const image = await this.images.signed(firmwareName, variant, kind, conversion);
    const expected = kind === 'app' ? conversion.target.appSha256 : conversion.target.bootloaderSha256;
    // A new build replaced the offered one: the offer no longer describes these bytes, and every later request would
    // sign and hash the same wrong image again.
    if ((await this.images.sha256(image)) !== expected) {
      this.logger.warn(`Conversion ${conversion.id}: the ${kind} image changed since the offer`);
      await this.protocol.fail(conversion, 'image-unavailable');
      return null;
    }
    this.signed.set(kind, image);
    return image;
  }

  /**
   * The bytes to answer a chunk request with, or null when it is not for the active conversion of this reader (or a
   * duplicate). Never throws for a reader's bad input.
   */
  public async chunk(state: SessionSecurityState, request: ConversionChunkRequest): Promise<Buffer | null> {
    const { id, conversion: kind, offset, length } = request;
    if (kind !== 'app' && kind !== 'bootloader') return null;
    if (!Number.isInteger(offset) || !Number.isInteger(length) || (offset as number) < 0 || (length as number) <= 0) {
      return null;
    }
    const conversion = await this.conversions.findActive();
    if (!conversion || conversion.readerId !== state.readerId || conversion.id !== id) return null;
    if (!TRANSFER_STATES.includes(conversion.state)) return null;
    this.cacheFor(conversion);

    const served = this.served.get(state) ?? new Map<string, number>();
    this.served.set(state, served);
    const key = `${conversion.id}:${kind}`;
    if ((offset as number) < (served.get(key) ?? 0)) return null;

    let image: SignedSecureImage | null;
    try {
      image = await this.image(conversion, kind);
    } catch (error) {
      this.logger.warn(`Conversion image unavailable: ${(error as Error).message}`);
      return null;
    }
    if (!image || (offset as number) >= image.size) return null;
    const data = await this.images.read(image, offset as number, length as number);
    const end = (offset as number) + data.length;
    served.set(key, end);
    await this.recordProgress(conversion, kind, end);
    return data;
  }

  private async recordProgress(conversion: AttractapSecureConversionRecord, kind: ConversionImageKind, end: number) {
    if (conversion.state !== 'transferring') return;
    const done = kind === 'app' ? end : conversion.target.appSize + end;
    const imageDone = end === (kind === 'app' ? conversion.target.appSize : conversion.target.bootloaderSize);
    if (done - this.persisted < PROGRESS_WRITE_STEP && !imageDone && done >= this.persisted) return;
    this.persisted = done;
    await this.conversions.update(conversion.id, { bytesDone: done, lastSeenAt: new Date() }, ['transferring']);
  }
}
