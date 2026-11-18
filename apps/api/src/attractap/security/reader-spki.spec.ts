import { generateKeyPairSync } from 'crypto';
import { canonicalReaderSpki, canonicalRsa3072Spki, readerKeyAlgorithm } from './reader-spki';

const rsa = (modulusLength: number, publicExponent = 65537) =>
  generateKeyPairSync('rsa', { modulusLength, publicExponent }).publicKey.export({ type: 'spki', format: 'der' });
const ec = () =>
  generateKeyPairSync('ec', { namedCurve: 'prime256v1' }).publicKey.export({ type: 'spki', format: 'der' });

describe('reader public keys', () => {
  const rsa3072 = rsa(3072);

  it('accepts RSA-3072 with e = 65537 and P-256, nothing else', async () => {
    expect(canonicalRsa3072Spki(rsa3072.toString('base64'))).toEqual(rsa3072);
    expect(readerKeyAlgorithm(rsa3072)).toBe('rsa-3072');
    expect(readerKeyAlgorithm(ec())).toBe('ecdsa-p256');
    expect((await canonicalReaderSpki(rsa3072.toString('base64'))).algorithm).toBe('rsa-3072');
    const p256 = ec();
    expect((await canonicalReaderSpki(p256.toString('base64'))).algorithm).toBe('ecdsa-p256');
  });

  it('refuses other RSA sizes, other exponents, other curves and garbage', async () => {
    for (const bad of [
      rsa(2048),
      rsa(4096),
      rsa(3072, 3),
      generateKeyPairSync('ec', { namedCurve: 'secp384r1' }).publicKey.export({ type: 'spki', format: 'der' }),
    ]) {
      expect(readerKeyAlgorithm(bad)).toBeNull();
      await expect(canonicalReaderSpki(bad.toString('base64'))).rejects.toThrow();
    }
    expect(() => canonicalRsa3072Spki('AAAA')).toThrow();
    expect(() => canonicalRsa3072Spki(5)).toThrow();
    expect(() => canonicalRsa3072Spki(Buffer.concat([rsa3072, Buffer.alloc(3)]).toString('base64'))).toThrow();
  });

  it('refuses an RSASSA-PSS typed key (not the plain rsaEncryption key the DS peripheral makes)', () => {
    const { publicKey } = generateKeyPairSync('rsa-pss', { modulusLength: 3072, publicExponent: 65537 });
    expect(() => canonicalRsa3072Spki(publicKey.export({ type: 'spki', format: 'der' }).toString('base64'))).toThrow();
  });
});
