import { execFileSync } from 'node:child_process';
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { generateKeyPairSync, X509Certificate } from 'node:crypto';
import { AttractapReaderIdentity } from '@attraccess/database-entities';
import { publicKeyFingerprint } from './reader-identity.service';

/** Ephemeral software signing peers only; never a production DS provider. */
export function readerSecurityFixture() {
  const directory = mkdtempSync(join(tmpdir(), 'reader-security-'));
  chmodSync(directory, 0o700);
  const run = (...args: string[]) => execFileSync('openssl', args, { cwd: directory, stdio: 'pipe' });
  run(
    'req',
    '-x509',
    '-newkey',
    'rsa:3072',
    '-nodes',
    '-sha256',
    '-days',
    '2',
    '-subj',
    '/CN=Test CA',
    '-addext',
    'basicConstraints=critical,CA:TRUE',
    '-addext',
    'keyUsage=critical,keyCertSign,cRLSign',
    '-keyout',
    'ca.key',
    '-out',
    'ca.pem',
  );
  for (const name of ['server', 'reader']) {
    writeFileSync(
      join(directory, `${name}.ext`),
      [
        'basicConstraints=critical,CA:FALSE',
        'keyUsage=critical,digitalSignature,keyEncipherment',
        `extendedKeyUsage=${name === 'server' ? 'serverAuth' : 'clientAuth'}`,
        'subjectAltName=DNS:localhost',
      ].join('\n'),
      { mode: 0o600 },
    );
    run(
      'req',
      '-new',
      '-newkey',
      'rsa:3072',
      '-nodes',
      '-sha256',
      '-subj',
      `/CN=${name}`,
      '-keyout',
      `${name}.key`,
      '-out',
      `${name}.csr`,
    );
    run(
      'x509',
      '-req',
      '-in',
      `${name}.csr`,
      '-CA',
      'ca.pem',
      '-CAkey',
      'ca.key',
      '-CAcreateserial',
      '-days',
      '1',
      '-sha256',
      '-extfile',
      `${name}.ext`,
      '-out',
      `${name}.pem`,
    );
    chmodSync(join(directory, `${name}.key`), 0o600);
    chmodSync(join(directory, `${name}.pem`), 0o600);
  }
  chmodSync(join(directory, 'ca.pem'), 0o600);
  chmodSync(join(directory, 'ca.key'), 0o600);
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 3072 });
  writeFileSync(
    join(directory, 'time.json'),
    JSON.stringify({
      active: 1,
      keys: [
        {
          id: 1,
          pem: privateKey.export({ type: 'pkcs8', format: 'pem' }),
          validFrom: Date.now() - 1000,
          validUntil: Date.now() + 86400_000,
          retired: false,
        },
      ],
    }),
    { mode: 0o600 },
  );
  const certificatePem = readFileSync(join(directory, 'reader.pem'), 'utf8');
  const certificate = new X509Certificate(certificatePem);
  const identity = Object.assign(new AttractapReaderIdentity(), {
    id: 1,
    readerId: 17,
    generation: 1,
    installationId: '00000000-0000-4000-8000-000000000001',
    certificatePem,
    certificateFingerprint: certificate.fingerprint256.replace(/:/g, '').toLowerCase(),
    publicKeyFingerprint: publicKeyFingerprint(certificate),
    validFrom: new Date(certificate.validFrom),
    validUntil: new Date(certificate.validTo),
    revokedAt: null,
    retiredAt: null,
    enrollmentClass: 'development',
    manifestDigest: '0'.repeat(64),
  });
  writeFileSync(
    join(directory, 'reader-security.json'),
    JSON.stringify({
      installationId: identity.installationId,
      serverCertificateFile: join(directory, 'server.pem'),
      serverKeyFile: join(directory, 'server.key'),
      readerCaFiles: [join(directory, 'ca.pem')],
      timeKeyFile: join(directory, 'time.json'),
    }),
    { mode: 0o600 },
  );
  const request = () => {
    const bytes = Buffer.alloc(81);
    bytes[0] = 1;
    Buffer.from(identity.installationId.replace(/-/g, ''), 'hex').copy(bytes, 1);
    Buffer.from(identity.publicKeyFingerprint, 'hex').copy(bytes, 17);
    bytes.fill(7, 49);
    return bytes;
  };
  return {
    directory,
    identity,
    publicKey,
    request,
    read: (name: string) => readFileSync(join(directory, name)),
    cleanup: () => rmSync(directory, { recursive: true, force: true }),
  };
}
