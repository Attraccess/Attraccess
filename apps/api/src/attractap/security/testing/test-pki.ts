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
