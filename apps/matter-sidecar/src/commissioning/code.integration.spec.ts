import { DiscoveryCapabilitiesSchema, ManualPairingCodeCodec, QrPairingCodeCodec } from '@matter/main/types';
import { decodeSetupCode } from './code';

describe('decodeSetupCode', () => {
  const manual11 = ManualPairingCodeCodec.encode({ discriminator: 3840, passcode: 20202021 });
  const qr = QrPairingCodeCodec.encode([
    {
      version: 0,
      vendorId: 0xfff1,
      productId: 0x8000,
      flowType: 0,
      discoveryCapabilities: DiscoveryCapabilitiesSchema.encode({ onIpNetwork: true }),
      discriminator: 3840,
      passcode: 20202021,
    },
  ]);

  it('decodes an 11-digit manual code, a 21-digit one and a QR payload', () => {
    expect(decodeSetupCode(manual11)).toMatchObject({ passcode: 20202021, shortDiscriminator: 15 });
    const long = ManualPairingCodeCodec.encode({
      discriminator: 3840,
      passcode: 20202021,
      vendorId: 0xfff1 as never,
      productId: 0x8000,
    });
    expect(long).toHaveLength(21);
    expect(decodeSetupCode(long)).toMatchObject({ passcode: 20202021, vendorId: 0xfff1, productId: 0x8000 });
    expect(decodeSetupCode(qr)).toMatchObject({ passcode: 20202021, discriminator: 3840, vendorId: 0xfff1 });
  });

  it('rejects a wrong check digit, and garbage, without throwing', () => {
    expect(decodeSetupCode(`${manual11.slice(0, 10)}${(Number(manual11[10]) + 1) % 10}`)).toBeUndefined();
    expect(decodeSetupCode('MT:not-a-real-payload')).toBeUndefined();
    expect(decodeSetupCode('hello')).toBeUndefined();
  });
});
