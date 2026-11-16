import * as x509 from '@peculiar/x509';
import { webcrypto } from 'node:crypto';

const RSA = {
  name: 'RSASSA-PKCS1-v1_5',
  modulusLength: 2048,
  publicExponent: new Uint8Array([1, 0, 1]),
  hash: 'SHA-256',
};

/**
 * Creates a one-day self-signed RSA certificate in process, so tests do not depend on an
 * `openssl` binary (absent on Nix shells, LibreSSL with different flags on macOS).
 */
export async function selfSignedCertificate(commonName: string, dnsNames: string[] = []) {
  x509.cryptoProvider.set(webcrypto as unknown as Crypto);
  const keys = (await webcrypto.subtle.generateKey(RSA, true, ['sign', 'verify'])) as unknown as CryptoKeyPair;
  const notBefore = new Date(Date.now() - 60_000);
  const certificate = await x509.X509CertificateGenerator.createSelfSigned({
    serialNumber: '01',
    name: `CN=${commonName}`,
    notBefore,
    notAfter: new Date(notBefore.getTime() + 24 * 60 * 60 * 1000),
    keys,
    signingAlgorithm: RSA,
    extensions: dnsNames.length
      ? [new x509.SubjectAlternativeNameExtension(dnsNames.map((value) => ({ type: 'dns' as const, value })))]
      : [],
  });
  const pkcs8 = Buffer.from(
    await webcrypto.subtle.exportKey('pkcs8', keys.privateKey as unknown as webcrypto.CryptoKey),
  );
  return {
    cert: certificate.toString('pem'),
    key: x509.PemConverter.encode(pkcs8, 'PRIVATE KEY'),
  };
}
