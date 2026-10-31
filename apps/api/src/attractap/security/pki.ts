import * as x509 from '@peculiar/x509';
import { createHash, randomBytes, webcrypto } from 'crypto';

const EC = { name: 'ECDSA', namedCurve: 'P-256' } as const;
const SIGN = { name: 'ECDSA', hash: 'SHA-256' } as const;

export const INSTALLATION_URI_PREFIX = 'urn:attraccess:installation:';
export const READER_URI_PREFIX = 'urn:attraccess:reader:';

const DAY_MS = 24 * 60 * 60 * 1000;
export const CA_VALIDITY_MS = 20 * 365 * DAY_MS;
export const SERVER_CERT_VALIDITY_MS = 365 * DAY_MS;
export const READER_CERT_VALIDITY_MS = 2 * 365 * DAY_MS;

x509.cryptoProvider.set(webcrypto as unknown as Crypto);

function serial(): string {
  // 16 random bytes, top bit cleared so the DER integer stays positive.
  const bytes = randomBytes(16);
  bytes[0] &= 0x7f;
  return bytes.toString('hex');
}

export async function generateKeyPair(): Promise<CryptoKeyPair> {
  return (await webcrypto.subtle.generateKey(EC, true, ['sign', 'verify'])) as unknown as CryptoKeyPair;
}

export async function exportPrivateKeyPem(key: CryptoKey): Promise<string> {
  const der = Buffer.from(await webcrypto.subtle.exportKey('pkcs8', key as unknown as webcrypto.CryptoKey));
  return derToPem(der, 'PRIVATE KEY');
}

export async function importPrivateKeyPem(pem: string): Promise<CryptoKey> {
  return (await webcrypto.subtle.importKey('pkcs8', pemToDer(pem) as unknown as NodeJS.BufferSource, EC, true, [
    'sign',
  ])) as unknown as CryptoKey;
}

export function derToPem(der: Buffer, label: string): string {
  const body = (der.toString('base64').match(/.{1,64}/g) ?? []).join('\n');
  return `-----BEGIN ${label}-----\n${body}\n-----END ${label}-----\n`;
}

export function pemToDer(pem: string): Buffer {
  return Buffer.from(pem.replace(/-----[^-]+-----/g, '').replace(/\s+/g, ''), 'base64');
}

/** SHA-256 over the SubjectPublicKeyInfo DER, hex encoded. */
export function spkiFingerprint(spki: Buffer): string {
  return createHash('sha256').update(spki).digest('hex');
}

export async function createCaCertificate(installationId: string, now = new Date()) {
  const keys = await generateKeyPair();
  const cert = await x509.X509CertificateGenerator.createSelfSigned({
    serialNumber: serial(),
    name: `CN=Attraccess Attractap CA ${installationId}`,
    notBefore: new Date(now.getTime() - 5 * 60 * 1000),
    notAfter: new Date(now.getTime() + CA_VALIDITY_MS),
    signingAlgorithm: SIGN,
    keys,
    extensions: [
      new x509.BasicConstraintsExtension(true, 0, true),
      new x509.KeyUsagesExtension(x509.KeyUsageFlags.keyCertSign | x509.KeyUsageFlags.cRLSign, true),
      await x509.SubjectKeyIdentifierExtension.create(keys.publicKey),
    ],
  });
  return { cert, keys };
}

export interface LeafOptions {
  caCert: x509.X509Certificate;
  caKey: CryptoKey;
  subjectPublicKey: CryptoKey | Buffer;
  commonName: string;
  uri: string;
  usage: 'server' | 'client';
  validityMs: number;
  now?: Date;
}

export async function issueLeaf(options: LeafOptions): Promise<x509.X509Certificate> {
  const now = options.now ?? new Date();
  const publicKey =
    options.subjectPublicKey instanceof Buffer
      ? await webcrypto.subtle.importKey('spki', options.subjectPublicKey as unknown as NodeJS.BufferSource, EC, true, [
          'verify',
        ])
      : options.subjectPublicKey;
  return await x509.X509CertificateGenerator.create({
    serialNumber: serial(),
    subject: `CN=${options.commonName}`,
    issuer: options.caCert.subject,
    notBefore: new Date(now.getTime() - 5 * 60 * 1000),
    notAfter: new Date(now.getTime() + options.validityMs),
    signingAlgorithm: SIGN,
    publicKey: publicKey as unknown as CryptoKey,
    signingKey: options.caKey,
    extensions: [
      new x509.BasicConstraintsExtension(false, undefined, true),
      new x509.KeyUsagesExtension(x509.KeyUsageFlags.digitalSignature, true),
      new x509.ExtendedKeyUsageExtension(
        [options.usage === 'server' ? x509.ExtendedKeyUsage.serverAuth : x509.ExtendedKeyUsage.clientAuth],
        true,
      ),
      new x509.SubjectAlternativeNameExtension([{ type: 'url', value: options.uri }]),
      await x509.AuthorityKeyIdentifierExtension.create(options.caCert, false),
    ],
  });
}

/** Extracts the first URI SAN with the given prefix and returns the remainder, or null. */
export function uriSanValue(cert: x509.X509Certificate, prefix: string): string | null {
  const san = cert.getExtension(x509.SubjectAlternativeNameExtension);
  const uri = san?.names.items.find((n) => n.type === 'url' && n.value.startsWith(prefix));
  return uri ? uri.value.slice(prefix.length) : null;
}

export { x509 };
