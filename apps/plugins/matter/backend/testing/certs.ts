import * as x509 from '@peculiar/x509';
import { webcrypto } from 'node:crypto';

x509.cryptoProvider.set(webcrypto as unknown as Crypto);

export type TestCertificate = { cert: string; key: string };

const toPem = (label: string, der: ArrayBuffer) =>
  `-----BEGIN ${label}-----\n${Buffer.from(der)
    .toString('base64')
    .replace(/(.{64})/g, '$1\n')
    .replace(/\n$/, '')}\n-----END ${label}-----\n`;

/** A throwaway self-signed certificate for `localhost`/`127.0.0.1`, generated per test run. Never a real key. */
export async function selfSignedCertificate(commonName = 'localhost'): Promise<TestCertificate> {
  const alg = { name: 'ECDSA', namedCurve: 'P-256', hash: 'SHA-256' };
  const keys = (await webcrypto.subtle.generateKey(alg, true, ['sign', 'verify'])) as unknown as CryptoKeyPair;
  const cert = await x509.X509CertificateGenerator.createSelfSigned({
    serialNumber: '01',
    name: `CN=${commonName}`,
    notBefore: new Date(Date.now() - 60_000),
    notAfter: new Date(Date.now() + 24 * 3_600_000),
    signingAlgorithm: alg,
    keys,
    extensions: [
      new x509.SubjectAlternativeNameExtension([
        { type: 'dns', value: 'localhost' },
        { type: 'ip', value: '127.0.0.1' },
      ]),
      new x509.BasicConstraintsExtension(true, undefined, true),
    ],
  });
  const key = await webcrypto.subtle.exportKey('pkcs8', keys.privateKey);
  return { cert: cert.toString('pem'), key: toPem('PRIVATE KEY', key) };
}
