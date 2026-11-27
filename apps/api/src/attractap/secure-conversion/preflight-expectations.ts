import { Injectable } from '@nestjs/common';
import { AttractapFirmwareService } from '../firmware.service';
import type { ConversionDigests } from './conversion-images';
import type { PreflightExpectation } from './preflight';

/** What a reader must look like before it may be converted to the catalog's secure image of its variant. */
@Injectable()
export class PreflightExpectations {
  public constructor(private readonly firmware: AttractapFirmwareService) {}

  /** Null when the catalog has no secure image for this variant (any more). */
  public for(firmwareName: string, variant: string, digests: ConversionDigests): PreflightExpectation | null {
    const source = this.firmware.getSecureImageSource(firmwareName, variant);
    if (!source) return null;
    return {
      chip: source.firmware.chip,
      variant,
      partitionTableSha256: source.secureImage.partitionTableSha256,
      digest0: digests.digest0,
      digest1: digests.digest1,
    };
  }
}
