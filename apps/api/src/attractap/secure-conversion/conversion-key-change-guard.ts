import { Inject, Injectable } from '@nestjs/common';
import type { SecureBootKeyChangeGuard } from '../secure-boot/secure-boot-key-change-guard.port';
import { ATTRACTAP_SECURE_CONVERSION_STORE, type AttractapSecureConversionStore } from './secure-conversion-store.port';

/** Blocks key replacement and restore while a conversion of any reader is active. */
@Injectable()
export class ConversionKeyChangeGuard implements SecureBootKeyChangeGuard {
  public constructor(
    @Inject(ATTRACTAP_SECURE_CONVERSION_STORE) private readonly conversions: AttractapSecureConversionStore,
  ) {}

  public async conversionActive(): Promise<boolean> {
    return (await this.conversions.findActive()) !== null;
  }
}
