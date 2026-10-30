import { X509Certificate } from 'crypto';
import { EncryptionService } from '../../encryption/encryption.service';
import { InstallationIdentityService } from './installation-identity.service';
import { INSTALLATION_URI_PREFIX, READER_URI_PREFIX, generateKeyPair, uriSanValue, x509 } from './pki';

class MemoryRepository {
  public row: Record<string, unknown> | null = null;
  public saves = 0;
  public findOneBy = async () => this.row;
  public findOneByOrFail = async () => this.row as Record<string, unknown>;
  public create = (value: Record<string, unknown>) => value;
  public save = async (value: Record<string, unknown>) => {
    this.saves++;
    this.row = value;
    return value;
  };
}

function makeService(repository: MemoryRepository) {
  const real = new EncryptionService({ get: () => ({ AUTH_SESSION_SECRET: 'test-secret' }) } as never);
  return new InstallationIdentityService(repository as never, real);
}

describe('InstallationIdentityService', () => {
  it('creates one identity, stores the keys encrypted and reuses it', async () => {
    const repository = new MemoryRepository();
    const service = makeService(repository);

    const installationId = await service.getInstallationId();
    expect(await makeService(repository).getInstallationId()).toBe(installationId);
    expect(repository.saves).toBe(1);

    const row = repository.row as Record<string, string>;
    expect(row['caPrivateKeyEncrypted']).not.toContain('PRIVATE KEY');
    expect(row['serverPrivateKeyEncrypted']).not.toContain('PRIVATE KEY');

    const { certificateChainPem } = await service.getServerTlsMaterial();
    const [leafPem] = certificateChainPem.split(/(?<=-----END CERTIFICATE-----)\n/);
    const leaf = new X509Certificate(leafPem);
    const ca = new X509Certificate(await service.getCaCertificatePem());
    expect(leaf.verify(ca.publicKey)).toBe(true);
    expect(uriSanValue(new x509.X509Certificate(leafPem), INSTALLATION_URI_PREFIX)).toBe(installationId);
    // The CA is valid for 20 years, the server certificate for one.
    expect(new Date(ca.validTo).getFullYear() - new Date().getFullYear()).toBeGreaterThanOrEqual(19);
    expect(new Date(leaf.validTo).getTime() - Date.now()).toBeLessThan(366 * 24 * 3600 * 1000);
  });

  it('renews the server certificate before it expires but keeps the CA and installation ID', async () => {
    const repository = new MemoryRepository();
    const first = makeService(repository);
    const id = await first.getInstallationId();
    const before = (await first.getServerTlsMaterial()).certificateChainPem;

    (repository.row as Record<string, unknown>)['serverCertificateNotAfter'] = new Date(
      Date.now() + 5 * 24 * 3600 * 1000,
    );
    const second = makeService(repository);
    const after = (await second.getServerTlsMaterial()).certificateChainPem;

    expect(after).not.toBe(before);
    expect(await second.getInstallationId()).toBe(id);
    expect(await second.getCaCertificatePem()).toBe(await first.getCaCertificatePem());
    expect(repository.saves).toBe(2);
  });

  it('issues reader certificates bound to the reader ID and the submitted key', async () => {
    const service = makeService(new MemoryRepository());
    const keys = await generateKeyPair();
    const spki = Buffer.from((await x509.PublicKey.create(keys.publicKey)).rawData);

    const issued = await service.issueReaderCertificate(42, spki);
    const cert = new x509.X509Certificate(issued.pem);
    expect(uriSanValue(cert, READER_URI_PREFIX)).toBe('42');
    expect(Buffer.from(cert.publicKey.rawData).equals(spki)).toBe(true);
    expect(
      new X509Certificate(issued.pem).verify(new X509Certificate(await service.getCaCertificatePem()).publicKey),
    ).toBe(true);
    // 2 years
    expect(issued.notAfter.getTime() - Date.now()).toBeGreaterThan(700 * 24 * 3600 * 1000);
  });
});
