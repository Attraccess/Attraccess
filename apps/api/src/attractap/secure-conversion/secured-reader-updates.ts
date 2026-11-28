import { Inject, Injectable, Logger } from '@nestjs/common';
import { AttractapFirmwareService } from '../firmware.service';
import { ATTRACTAP_READER_STORE, type AttractapReaderStore } from '../reader-store.port';
import { SecureImageService, type SignedSecureImage } from '../secure-boot/secure-image.service';

export interface SecuredUpdateOffer {
  image: SignedSecureImage;
  version: string;
}

/**
 * Updates for readers on the secure profile: only the secure app, signed with the key whose digest the reader has
 * burned (`signingKeyForReader`), never with a lower secureVersion than the reader reports or the server recorded.
 * Plain readers and the web flasher never get these images.
 */
@Injectable()
export class SecuredReaderUpdates {
  private readonly logger = new Logger(SecuredReaderUpdates.name);

  public constructor(
    @Inject(ATTRACTAP_READER_STORE) private readonly readers: AttractapReaderStore,
    private readonly firmware: AttractapFirmwareService,
    private readonly images: SecureImageService,
  ) {}

  public async prepare(
    readerId: number,
    firmwareName: string,
    variant: string,
    reportedSecureVersion: number | null,
  ): Promise<SecuredUpdateOffer | null> {
    const reader = await this.readers.findById(readerId);
    if (!reader?.secureBootDigest0 && !reader?.secureBootDigest1) return null;
    const catalog = this.firmware.getFirmwareDefinition(firmwareName, variant);
    if (!catalog?.secureImage) return null;
    const floor = Math.max(reportedSecureVersion ?? 0, reader.efuseSecureVersion ?? 0, reader.secureVersion ?? 0);
    try {
      const image = await this.images.getSignedImage(firmwareName, variant, 'app', reader, floor);
      return { image, version: String(catalog.version) };
    } catch (error) {
      // "No signing key for this reader" or anti-rollback: no update; the reader editor shows the key problem.
      this.logger.warn(`No secure update for reader ${readerId}: ${(error as Error).message}`);
      return null;
    }
  }
}
