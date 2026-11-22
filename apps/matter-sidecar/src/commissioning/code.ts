import type { VendorId } from '@matter/main';
import {
  DiscoveryCapabilitiesSchema,
  ManualPairingCodeCodec,
  QrPairingCodeCodec,
  isValidPasscode,
  statedIdentifier,
} from '@matter/main/types';

/** What matter.js needs to find and pair with the device a setup code names. */
export type DecodedSetupCode = {
  passcode: number;
  discriminator?: number;
  shortDiscriminator?: number;
  vendorId?: VendorId;
  productId?: number;
};

/**
 * Decodes a setup code: an `MT:` QR payload or an 11- or 21-digit manual code (check digit verified), and checks that
 * the passcode is an allowed one. Returns undefined for anything else. Never throws, never logs, never keeps the code.
 */
export function decodeSetupCode(code: string): DecodedSetupCode | undefined {
  try {
    if (code.startsWith('MT:')) {
      const payloads = QrPairingCodeCodec.decode(code);
      // A device that is already on the network advertises itself over mDNS; a payload that offers only BLE cannot be used.
      const payload =
        payloads.find(
          (entry) =>
            entry.discoveryCapabilities === undefined ||
            DiscoveryCapabilitiesSchema.decode(entry.discoveryCapabilities).onIpNetwork,
        ) ?? payloads[0];
      if (!payload || !isValidPasscode(payload.passcode) || payload.discriminator === undefined) return undefined;
      return {
        passcode: payload.passcode,
        discriminator: payload.discriminator,
        vendorId: statedIdentifier(payload.vendorId) as VendorId | undefined,
        productId: statedIdentifier(payload.productId),
      };
    }
    const manual = ManualPairingCodeCodec.decode(code);
    if (!isValidPasscode(manual.passcode)) return undefined;
    return {
      passcode: manual.passcode,
      discriminator: manual.discriminator,
      shortDiscriminator: manual.shortDiscriminator,
      vendorId: statedIdentifier(manual.vendorId) as VendorId | undefined,
      productId: statedIdentifier(manual.productId),
    };
  } catch {
    return undefined;
  }
}
