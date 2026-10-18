import * as forge from 'node-forge';
import { createPrivateKey, createPublicKey, randomBytes, X509Certificate } from 'node:crypto';

export interface ReaderIssuerConfiguration {
  caCertificateFile: string;
  caKeyFile: string;
}

type ProtectedRead = (path: string, maximum?: number) => Buffer;

/** No cached signing material. Buffers are cleared; managed-memory copies are best effort only. */
export function withReaderIssuer<T>(
  configuration: ReaderIssuerConfiguration,
  activeRoots: string[],
  read: ProtectedRead,
  operation: (issuer: forge.pki.Certificate, key: forge.pki.rsa.PrivateKey, native: X509Certificate) => T,
): T {
  const buffers: Buffer[] = [];
  try {
    if (
      !configuration ||
      Object.keys(configuration).sort().join(',') !== 'caCertificateFile,caKeyFile' ||
      ![configuration.caCertificateFile, configuration.caKeyFile].every(
        (path) => typeof path === 'string' && path.startsWith('/'),
      )
    )
      throw new Error();
    const load = (path: string) => {
      const bytes = read(path);
      buffers.push(bytes);
      return bytes;
    };
    const pem = load(configuration.caCertificateFile);
    const native = new X509Certificate(pem);
    const issuer = forge.pki.certificateFromPem(pem.toString('utf8'));
    const usage = issuer.getExtension('keyUsage') as { keyCertSign?: boolean } | null;
    const keyBytes = load(configuration.caKeyFile);
    const key = createPrivateKey(keyBytes);
    // In an overlap the last root is the replacement. Never extend a retiring root.
    const current = new X509Certificate(load(activeRoots[activeRoots.length - 1]));
    const signature = (native as X509Certificate & { signatureAlgorithm?: string }).signatureAlgorithm;
    if (
      !native.ca ||
      !usage?.keyCertSign ||
      native.fingerprint256 !== current.fingerprint256 ||
      Date.parse(native.validFrom) > Date.now() ||
      Date.parse(native.validTo) <= Date.now() ||
      key.asymmetricKeyType !== 'rsa' ||
      (key.asymmetricKeyDetails?.modulusLength ?? 0) < 3072 ||
      !native.checkPrivateKey(key) ||
      !native.verify(native.publicKey) ||
      !['sha256WithRSAEncryption', 'sha384WithRSAEncryption', 'sha512WithRSAEncryption'].includes(signature)
    )
      throw new Error();
    return operation(issuer, forge.pki.privateKeyFromPem(keyBytes.toString('utf8')), native);
  } catch {
    throw new Error('Reader issuer is unavailable');
  } finally {
    buffers.forEach((bytes) => bytes.fill(0));
  }
}

/** Certifies only a supplied public key; creates no registry entry or operational privilege. */
export function issueReaderCertificate(options: {
  readerId: number;
  installationId: string;
  publicKey: Buffer;
  lifetimeSeconds?: number;
  issuer: ReaderIssuerConfiguration;
  activeRoots: string[];
  read: ProtectedRead;
}): string {
  try {
    const lifetime = options.lifetimeSeconds === undefined ? 86400 : options.lifetimeSeconds;
    if (
      !Number.isSafeInteger(options.readerId) ||
      options.readerId <= 0 ||
      !/^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(options.installationId) ||
      !Number.isSafeInteger(lifetime) ||
      lifetime < 1 ||
      lifetime > 31536000
    )
      throw new Error();
    const pem = options.publicKey.toString('ascii');
    if (!/^\s*-----BEGIN (PUBLIC KEY|RSA PUBLIC KEY)-----\r?\n[A-Za-z0-9+/=\r\n]+-----END \1-----\s*$/.test(pem))
      throw new Error();
    const supplied = createPublicKey(pem);
    if (supplied.asymmetricKeyType !== 'rsa' || supplied.asymmetricKeyDetails?.modulusLength !== 3072)
      throw new Error();
    const spki = supplied.export({ type: 'spki', format: 'pem' }).toString();
    return withReaderIssuer(options.issuer, options.activeRoots, options.read, (issuer, key, nativeIssuer) => {
      const certificate = forge.pki.createCertificate();
      certificate.publicKey = forge.pki.publicKeyFromPem(spki);
      // Prefix 01 guarantees a positive 19-octet DER INTEGER while retaining 144 random bits.
      certificate.serialNumber = '01' + randomBytes(18).toString('hex');
      const start = Math.floor(Date.now() / 1000) * 1000;
      const end = Math.min(start + lifetime * 1000, Date.parse(nativeIssuer.validTo));
      if (end <= start) throw new Error();
      certificate.validity.notBefore = new Date(start);
      certificate.validity.notAfter = new Date(end);
      const commonName = `reader-${options.readerId}`;
      const uri = `https://reader.attraccess.invalid/${options.installationId.toLowerCase()}/${options.readerId}`;
      certificate.setSubject([{ name: 'commonName', value: commonName }]);
      certificate.setIssuer(issuer.subject.attributes);
      certificate.setExtensions([
        { name: 'basicConstraints', critical: true, cA: false },
        { name: 'keyUsage', critical: true, digitalSignature: true },
        { name: 'extKeyUsage', clientAuth: true },
        { name: 'subjectAltName', altNames: [{ type: 6, value: uri }] },
      ]);
      certificate.sign(key, forge.md.sha256.create());
      const result = forge.pki.certificateToPem(certificate);
      const native = new X509Certificate(result);
      if (
        !native.publicKey
          .export({ type: 'spki', format: 'der' })
          .equals(supplied.export({ type: 'spki', format: 'der' })) ||
        !native.verify(nativeIssuer.publicKey) ||
        !native.checkIssued(nativeIssuer) ||
        native.ca ||
        native.subject !== `CN=${commonName}` ||
        native.subjectAltName !== `URI:${uri}` ||
        Date.parse(native.validFrom) !== start ||
        Date.parse(native.validTo) !== end ||
        native.keyUsage?.join(',') !== '1.3.6.1.5.5.7.3.2' ||
        Buffer.byteLength(JSON.stringify({ ok: true, result }) + '\n') > 4096
      )
        throw new Error();
      return result;
    });
  } catch {
    throw new Error('Reader certificate issuance denied');
  } finally {
    options.publicKey.fill(0);
  }
}
