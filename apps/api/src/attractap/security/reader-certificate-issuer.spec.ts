import { createPublicKey, generateKeyPairSync, X509Certificate } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { chmodSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import * as forge from 'node-forge';
import { issueReaderCertificate, withReaderIssuer } from './reader-certificate-issuer';
import { readProtectedReaderFile } from './reader-identity.service';
import { readerSecurityFixture } from './reader-security.test-fixture';

describe('supplied-key reader certificate issuer', () => {
  let fixture: ReturnType<typeof readerSecurityFixture>;
  let publicPem: Buffer;
  beforeAll(() => {
    fixture = readerSecurityFixture();
    publicPem = Buffer.from(createPublicKey(fixture.read('reader.key')).export({ type: 'spki', format: 'pem' }));
  });
  afterAll(() => fixture.cleanup());
  const issuer = () => ({
    caCertificateFile: join(fixture.directory, 'ca.pem'),
    caKeyFile: join(fixture.directory, 'ca.key'),
  });
  const issue = (lifetimeSeconds?: number, publicKey = Buffer.from(publicPem)) =>
    issueReaderCertificate({
      readerId: 17,
      installationId: fixture.identity.installationId,
      publicKey,
      lifetimeSeconds,
      issuer: issuer(),
      activeRoots: [join(fixture.directory, 'ca.pem')],
      read: readProtectedReaderFile,
    });
  it('certifies exactly the existing key and independently passes native and OpenSSL client verification', () => {
    const result = issue();
    const certificate = new X509Certificate(result);
    const root = new X509Certificate(fixture.read('ca.pem'));
    expect(certificate.verify(root.publicKey)).toBe(true);
    expect(certificate.publicKey.export({ type: 'spki', format: 'pem' })).toEqual(publicPem.toString());
    expect(certificate.subject).toBe('CN=reader-17');
    expect(certificate.subjectAltName).toBe(
      `URI:https://reader.attraccess.invalid/${fixture.identity.installationId}/17`,
    );
    expect(certificate.ca).toBe(false);
    expect(certificate.keyUsage).toEqual(['1.3.6.1.5.5.7.3.2']);
    expect(Date.parse(certificate.validTo) - Date.parse(certificate.validFrom)).toBe(86400_000);
    expect(certificate.serialNumber).toMatch(/^01[0-9A-F]{36}$/);
    expect(new X509Certificate(issue()).serialNumber).not.toBe(certificate.serialNumber);
    expect(Buffer.byteLength(JSON.stringify({ ok: true, result }) + '\n')).toBeLessThanOrEqual(4096);
    writeFileSync(join(fixture.directory, 'issued.pem'), result, { mode: 0o600 });
    expect(
      execFileSync(
        'openssl',
        [
          'verify',
          '-purpose',
          'sslclient',
          '-CAfile',
          join(fixture.directory, 'ca.pem'),
          join(fixture.directory, 'issued.pem'),
        ],
        { encoding: 'utf8' },
      ),
    ).toContain(': OK');
    expect(() =>
      execFileSync(
        'openssl',
        [
          'verify',
          '-purpose',
          'sslserver',
          '-CAfile',
          join(fixture.directory, 'ca.pem'),
          join(fixture.directory, 'issued.pem'),
        ],
        { stdio: 'pipe' },
      ),
    ).toThrow();
    const details = execFileSync('openssl', ['x509', '-in', join(fixture.directory, 'issued.pem'), '-noout', '-text'], {
      encoding: 'utf8',
    });
    expect(details).toContain('sha256WithRSAEncryption');
    expect(details).toContain('X509v3 Basic Constraints: critical');
    expect(details).toContain('CA:FALSE');
    expect(details).toContain('X509v3 Key Usage: critical');
    expect(details).toContain('Digital Signature');
    expect(details).not.toContain('Key Encipherment');
    expect(details).not.toContain('Certificate Sign');
  });
  it('honors minimum lifetime and clips maximum lifetime to issuer expiry', () => {
    const minimum = new X509Certificate(issue(1));
    expect(Date.parse(minimum.validTo) - Date.parse(minimum.validFrom)).toBe(1000);
    const maximum = new X509Certificate(issue(31536000));
    expect(maximum.validTo).toBe(new X509Certificate(fixture.read('ca.pem')).validTo);
  });
  it.each([0, -1, 1.1, 31536001, NaN, Infinity, null, '60'])('rejects invalid lifetime %s', (seconds) => {
    expect(() => issue(seconds as number)).toThrow('denied');
  });
  it('rejects private, multiple, malformed, non-RSA and wrong-size keys and clears input', () => {
    const weak = generateKeyPairSync('rsa', { modulusLength: 2048 }).publicKey;
    const ec = generateKeyPairSync('ec', { namedCurve: 'prime256v1' }).publicKey;
    for (const input of [
      fixture.read('reader.key'),
      Buffer.concat([publicPem, publicPem]),
      Buffer.from('malformed'),
      Buffer.from(weak.export({ type: 'spki', format: 'pem' })),
      Buffer.from(ec.export({ type: 'spki', format: 'pem' })),
    ]) {
      expect(() => issue(undefined, input)).toThrow('denied');
      expect(input.every((byte) => byte === 0)).toBe(true);
    }
  });
  it('rejects unsafe issuer files, mismatched keys and retiring roots with redacted errors', () => {
    const path = join(fixture.directory, 'ca.key');
    const original = readFileSync(path);
    try {
      chmodSync(path, 0o644);
      expect(() => issue()).toThrow('denied');
      chmodSync(path, 0o600);
      writeFileSync(path, fixture.read('reader.key'));
      expect(() => issue()).toThrow('denied');
      writeFileSync(path, original);
      expect(() =>
        withReaderIssuer(issuer(), [join(fixture.directory, 'server.pem')], readProtectedReaderFile, () => true),
      ).toThrow('unavailable');
    } finally {
      chmodSync(path, 0o600);
      writeFileSync(path, original);
      original.fill(0);
    }
  });

  it('rejects expired, future, weak and non-signing issuers even when installed as active trust', () => {
    const certificatePath = join(fixture.directory, 'candidate-ca.pem');
    const keyPath = join(fixture.directory, 'candidate-ca.key');
    const originalKey = fixture.read('ca.key');
    try {
      for (const state of ['expired', 'future', 'not-ca', 'no-signing-usage', 'weak-key', 'weak-signature']) {
        const certificate = forge.pki.certificateFromPem(fixture.read('ca.pem').toString());
        let keyPem = originalKey.toString();
        if (state === 'expired') {
          certificate.validity.notBefore = new Date(Date.now() - 86400_000);
          certificate.validity.notAfter = new Date(Date.now() - 1000);
        }
        if (state === 'future') {
          certificate.validity.notBefore = new Date(Date.now() + 86400_000);
          certificate.validity.notAfter = new Date(Date.now() + 172800_000);
        }
        if (state === 'not-ca' || state === 'no-signing-usage')
          certificate.setExtensions([
            { name: 'basicConstraints', critical: true, cA: state !== 'not-ca' },
            { name: 'keyUsage', critical: true, keyCertSign: state !== 'no-signing-usage', digitalSignature: true },
          ]);
        if (state === 'weak-key') {
          const weak = generateKeyPairSync('rsa', { modulusLength: 2048 });
          keyPem = weak.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
          certificate.publicKey = forge.pki.publicKeyFromPem(
            weak.publicKey.export({ type: 'spki', format: 'pem' }).toString(),
          );
        }
        certificate.sign(
          forge.pki.privateKeyFromPem(keyPem),
          state === 'weak-signature' ? forge.md.sha1.create() : forge.md.sha256.create(),
        );
        writeFileSync(certificatePath, forge.pki.certificateToPem(certificate), { mode: 0o600 });
        writeFileSync(keyPath, keyPem, { mode: 0o600 });
        const use = jest.fn();
        expect(() =>
          withReaderIssuer(
            { caCertificateFile: certificatePath, caKeyFile: keyPath },
            [certificatePath],
            readProtectedReaderFile,
            use,
          ),
        ).toThrow('unavailable');
        expect(use).not.toHaveBeenCalled();
      }
    } finally {
      originalKey.fill(0);
    }
  });
});
