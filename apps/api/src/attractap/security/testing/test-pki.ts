import { generateKeyPairSync, type KeyObject } from 'crypto';
import { INSTALLATION_URI_PREFIX, READER_CERT_VALIDITY_MS, READER_URI_PREFIX, SERVER_CERT_VALIDITY_MS } from '../pki';
import { createCaCertificate, exportPrivateKeyPem, generateKeyPair, issueLeaf, spkiFingerprint, x509 } from '../pki';
import type { EmulatedReaderIdentity } from './emulated-reader';
import type { SessionTlsMaterial } from '../session-connection';

export interface TestInstallation {
  installationId: string;
  ca: Awaited<ReturnType<typeof createCaCertificate>>;
  caPem: string;
  server: SessionTlsMaterial;
}

export async function createTestInstallation(installationId = 'test-installation'): Promise<TestInstallation> {
  const ca = await createCaCertificate(installationId);
  const caPem = ca.cert.toString('pem');
  const keys = await generateKeyPair();
  const leaf = await issueLeaf({
    caCert: ca.cert,
    caKey: ca.keys.privateKey,
    subjectPublicKey: keys.publicKey,
    commonName: 'server',
    uri: `${INSTALLATION_URI_PREFIX}${installationId}`,
    usage: 'server',
    validityMs: SERVER_CERT_VALIDITY_MS,
  });
  return {
    installationId,
    ca,
    caPem,
    server: {
      certificateChainPem: `${leaf.toString('pem').trim()}\n${caPem}`,
      privateKeyPem: await exportPrivateKeyPem(keys.privateKey),
      caCertificatePem: caPem,
    },
  };
}

export async function createTestReader(
  installation: TestInstallation,
  readerId: number,
  options: { validityMs?: number; now?: Date; signer?: TestInstallation; installationId?: string } = {},
): Promise<EmulatedReaderIdentity & { fingerprint: string }> {
  const signer = options.signer ?? installation;
  const keys = await generateKeyPair();
  const cert = await issueLeaf({
    caCert: signer.ca.cert,
    caKey: signer.ca.keys.privateKey,
    subjectPublicKey: keys.publicKey,
    commonName: `reader ${readerId}`,
    uri: `${READER_URI_PREFIX}${readerId}`,
    usage: 'client',
    validityMs: options.validityMs ?? READER_CERT_VALIDITY_MS,
    now: options.now,
  });
  return {
    privateKeyPem: await exportPrivateKeyPem(keys.privateKey),
    certificatePem: cert.toString('pem'),
    caCertificatePem: installation.caPem,
    installationId: options.installationId ?? installation.installationId,
    fingerprint: spkiFingerprint(Buffer.from(new x509.X509Certificate(cert.toString('pem')).publicKey.rawData)),
  };
}

/** A reader with an RSA-3072 key, like one that holds its identity in the DS peripheral. */
export async function createTestRsaReader(
  installation: TestInstallation,
  readerId: number,
  options: { bits?: number } = {},
): Promise<EmulatedReaderIdentity & { fingerprint: string; spki: Buffer; privateKey: KeyObject }> {
  const { publicKey, privateKey } = generateKeyPairSync('rsa', {
    modulusLength: options.bits ?? 3072,
    publicExponent: 65537,
  });
  const spki = publicKey.export({ type: 'spki', format: 'der' });
  // A foreign key size is never certified by the server; the test signs one with the CA key to prove the
  // TLS layer refuses it by itself.
  const cert = await x509.X509CertificateGenerator.create({
    serialNumber: '0a',
    subject: `CN=reader ${readerId}`,
    issuer: installation.ca.cert.subject,
    notBefore: new Date(Date.now() - 60_000),
    notAfter: new Date(Date.now() + READER_CERT_VALIDITY_MS),
    signingAlgorithm: { name: 'ECDSA', hash: 'SHA-256' },
    publicKey: new x509.PublicKey(spki),
    signingKey: installation.ca.keys.privateKey,
    extensions: [
      new x509.KeyUsagesExtension(x509.KeyUsageFlags.digitalSignature, true),
      new x509.ExtendedKeyUsageExtension([x509.ExtendedKeyUsage.clientAuth], true),
      new x509.SubjectAlternativeNameExtension([{ type: 'url', value: `${READER_URI_PREFIX}${readerId}` }]),
    ],
  });
  return {
    privateKeyPem: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
    certificatePem: cert.toString('pem'),
    caCertificatePem: installation.caPem,
    installationId: installation.installationId,
    fingerprint: spkiFingerprint(spki),
    spki,
    privateKey,
  };
}
