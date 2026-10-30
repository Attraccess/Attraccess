import { X509Certificate } from 'crypto';
import {
  INSTALLATION_URI_PREFIX,
  READER_URI_PREFIX,
  createCaCertificate,
  generateKeyPair,
  issueLeaf,
  spkiFingerprint,
  uriSanValue,
  x509,
} from './pki';

describe('pki', () => {
  it('issues leaf certificates that chain to the CA and carry the URI SANs', async () => {
    const ca = await createCaCertificate('inst-1');
    const keys = await generateKeyPair();
    const leaf = await issueLeaf({
      caCert: ca.cert,
      caKey: ca.keys.privateKey,
      subjectPublicKey: keys.publicKey,
      commonName: 'x',
      uri: `${READER_URI_PREFIX}7`,
      usage: 'client',
      validityMs: 1000 * 60 * 60,
    });

    expect(await leaf.verify({ publicKey: ca.cert.publicKey })).toBe(true);
    expect(uriSanValue(leaf, READER_URI_PREFIX)).toBe('7');
    expect(uriSanValue(leaf, INSTALLATION_URI_PREFIX)).toBeNull();

    // Node's own X.509 parser agrees about the chain.
    const nodeCa = new X509Certificate(ca.cert.toString('pem'));
    const nodeLeaf = new X509Certificate(leaf.toString('pem'));
    expect(nodeLeaf.checkIssued(nodeCa)).toBe(true);
    expect(nodeLeaf.verify(nodeCa.publicKey)).toBe(true);
  });

  it('fingerprints the SPKI DER', async () => {
    const keys = await generateKeyPair();
    const spki = Buffer.from(await x509.PublicKey.create(keys.publicKey).then((k) => k.rawData));
    expect(spkiFingerprint(spki)).toMatch(/^[0-9a-f]{64}$/);
  });
});
