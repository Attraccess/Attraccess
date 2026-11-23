import { Inject, Injectable, Logger } from '@nestjs/common';
import type { AttractapSecureConversionRecord } from '@attraccess/application-models';
import type { SignedSecureImage } from '../secure-boot/secure-image.service';
import type { SessionSecurityState } from '../security/session-security-state';
import { ConversionImages } from './conversion-images';
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
 * a repeated request on the same connection is ignored. Signed images are looked up once per conversion.
 */
@Injectable()
export class ConversionTransferService {
  private readonly logger = new Logger(ConversionTransferService.name);
  private readonly signed = new Map<string, SignedSecureImage>();
  /** Per session: end of the last chunk served, by conversion and image. */
  private readonly served = new WeakMap<SessionSecurityState, Map<string, number>>();
  private readonly persisted = new Map<number, number>();

  public constructor(
    @Inject(ATTRACTAP_SECURE_CONVERSION_STORE) private readonly conversions: AttractapSecureConversionStore,
    private readonly images: ConversionImages,
  ) {}

  private async image(conversion: AttractapSecureConversionRecord, kind: ConversionImageKind) {
    const key = `${conversion.id}:${kind}`;
    const known = this.signed.get(key);
    if (known) return known;
    const { firmwareName, variant } = conversion.target;
    const image = await this.images.signed(firmwareName, variant, kind, conversion);
    const expected = kind === 'app' ? conversion.target.appSha256 : conversion.target.bootloaderSha256;
    // The catalog changed under the conversion (new build): the offer no longer describes these bytes.
    if ((await this.images.sha256(image)) !== expected) return null;
    this.signed.set(key, image);
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
    const last = this.persisted.get(conversion.id) ?? 0;
    const imageDone = end === (kind === 'app' ? conversion.target.appSize : conversion.target.bootloaderSize);
    if (done - last < PROGRESS_WRITE_STEP && !imageDone && done >= last) return;
    this.persisted.set(conversion.id, done);
    await this.conversions.update(conversion.id, { bytesDone: done, lastSeenAt: new Date() }, ['transferring']);
  }
}
