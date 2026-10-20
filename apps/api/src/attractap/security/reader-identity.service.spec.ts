import { AttractapService } from '../attractap.service';
import { ConfigService } from '@nestjs/config';
import { createPublicKey, X509Certificate } from 'node:crypto';
import { chmodSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { DataSource, Repository } from 'typeorm';
import * as migrations from '../../database/migrations';
import { Attractap, AttractapReaderIdentity, entities } from '@attraccess/database-entities';
import { EncryptionService } from '../../encryption/encryption.service';
import { ReaderIdentityService } from './reader-identity.service';
import { VerifiedCardSessionService } from './verified-card-session.service';
import { readerSecurityFixture } from './reader-security.test-fixture';

describe('registered reader identity', () => {
  let fixture: ReturnType<typeof readerSecurityFixture>;
  let identities: ReaderIdentityService;
  beforeAll(() => {
    fixture = readerSecurityFixture();
  });
  afterAll(() => fixture.cleanup());
  beforeEach(() => {
    const repository = {
      find: jest.fn().mockResolvedValue([fixture.identity]),
      findOneBy: jest.fn().mockResolvedValue(fixture.identity),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
      existsBy: jest.fn().mockResolvedValue(true),
    };
    identities = new ReaderIdentityService(
      repository as unknown as Repository<AttractapReaderIdentity>,
      new ConfigService({ app: { READER_SECURITY_DIRECTORY: fixture.directory } }),
      new VerifiedCardSessionService(),
      new EncryptionService(new ConfigService()),
    );
  });
  it('accepts a registered RSA-3072 client credential under current trust', async () => {
    const certificate = new X509Certificate(fixture.identity.certificatePem);
    const root = new X509Certificate(fixture.read('ca.pem'));
    expect((certificate as X509Certificate & { signatureAlgorithm?: string }).signatureAlgorithm).toBe(
      'sha256WithRSAEncryption',
    );
    expect(root.ca).toBe(true);
    expect(certificate.checkIssued(root)).toBe(true);
    expect(certificate.verify(root.publicKey)).toBe(true);
    await expect(identities.validateCertificate(fixture.identity.certificatePem)).resolves.toBe(fixture.identity);
  });
  it('keeps per-frame readiness and periodic validation on installed public trust', async () => {
    await identities.validateCertificate(fixture.identity.certificatePem);
    const verify = jest.spyOn(X509Certificate.prototype, 'verify');
    const paths = ['reader-security.json', 'ca.pem'].map((name) => join(fixture.directory, name));
    paths.forEach((path) => chmodSync(path, 0o000));
    try {
      for (let i = 0; i < 3; i++) {
        expect(identities.connectionActive(fixture.identity)).toBe(true);
        await expect(identities.validateCertificate(fixture.identity.certificatePem)).resolves.toBe(fixture.identity);
      }
      expect(verify).not.toHaveBeenCalled();
      fixture.identity.revokedAt = new Date();
      await expect(identities.validateCertificate(fixture.identity.certificatePem)).rejects.toThrow('not active');
    } finally {
      fixture.identity.revokedAt = null;
      paths.forEach((path) => chmodSync(path, 0o600));
      verify.mockRestore();
    }
  });
  it('denies certificate issuance without protected issuer configuration', async () => {
    await expect(identities.issue({ readerId: 17, publicKeyFile: '/unused/public.pem' })).rejects.toThrow('denied');
  });
  it('does not allow bearer fallback for revoked secured history', async () => {
    await expect(identities.isLegacy(fixture.identity.readerId)).resolves.toBe(false);
  });
});

// Each lifecycle case creates and migrates a real database before exercising issuance.
jest.setTimeout(60_000);

describe('persisted reader lifecycle boundaries', () => {
  let fixture: ReturnType<typeof readerSecurityFixture>;
  let source: DataSource;
  let service: ReaderIdentityService;
  let proofs: VerifiedCardSessionService;
  let originalConfiguration: string;
  const enroll = async (readerId = 17, overlapSeconds = 0) => {
    const pem = await service.issue({ readerId, publicKeyFile: join(fixture.directory, 'public.pem') });
    writeFileSync(join(fixture.directory, 'enroll.pem'), pem, { mode: 0o600 });
    return service.enroll({
      readerId,
      overlapSeconds,
      certificateFile: join(fixture.directory, 'enroll.pem'),
      manifestFile: join(fixture.directory, 'manifest.json'),
      enrollmentClass: 'development',
    });
  };
  beforeAll(() => {
    fixture = readerSecurityFixture();
    const configuration = JSON.parse(fixture.read('reader-security.json').toString());
    configuration.issuer = {
      caCertificateFile: join(fixture.directory, 'ca.pem'),
      caKeyFile: join(fixture.directory, 'ca.key'),
    };
    originalConfiguration = JSON.stringify(configuration);
    writeFileSync(
      join(fixture.directory, 'public.pem'),
      createPublicKey(fixture.read('reader.key')).export({ type: 'spki', format: 'pem' }),
      { mode: 0o600 },
    );
    writeFileSync(join(fixture.directory, 'manifest.json'), '{}', { mode: 0o600 });
  });
  afterAll(() => fixture.cleanup());
  beforeEach(async () => {
    writeFileSync(join(fixture.directory, 'reader-security.json'), originalConfiguration);
    source = await new DataSource({
      type: 'sqlite',
      database: ':memory:',
      entities: Object.values(entities),
      migrations: Object.values(migrations),
      migrationsRun: true,
    }).initialize();
    await source.getRepository(Attractap).save([
      { id: 17, name: 'Original', apiTokenHash: 'test-only' },
      { id: 18, name: 'Replacement', apiTokenHash: 'test-only-2' },
    ]);
    proofs = new VerifiedCardSessionService();
    service = new ReaderIdentityService(
      source.getRepository(AttractapReaderIdentity),
      new ConfigService({ app: { READER_SECURITY_DIRECTORY: fixture.directory } }),
      proofs,
      new EncryptionService(new ConfigService()),
    );
  });
  afterEach(async () => {
    await service.onModuleDestroy();
    await source.destroy();
  });

  it('atomically refuses a legacy firmware write after secure enrollment', async () => {
    const readers = Object.create(AttractapService.prototype) as AttractapService;
    Reflect.set(readers, 'readerRepository', source.getRepository(Attractap));
    const legacy = { name: 'bridge', version: '1', variant: 'wifi', capabilities: {} };
    expect(await readers.updateReaderFirmware(17, legacy, true)).toBe(true);
    await enroll();
    expect(await readers.updateReaderFirmware(17, { ...legacy, version: 'stale' }, true)).toBe(false);
    expect((await source.getRepository(Attractap).findOneByOrFail({ id: 17 })).firmware.version).toBe('1');
  });

  it('enrollment cancels connected and pending legacy authentication before reporting success', async () => {
    const connected = jest.fn(async () => undefined);
    const pending = jest.fn(async () => undefined);
    service.trackLegacy({}, 17, connected);
    service.trackLegacy({}, 17, pending);
    expect(await service.isLegacy(17)).toBe(true);
    await enroll();
    expect(connected).toHaveBeenCalledTimes(1);
    expect(pending).toHaveBeenCalledTimes(1);
    expect(await service.isLegacy(17)).toBe(false);
    await service.cancelReader(17);
    expect(connected).toHaveBeenCalledTimes(1);
  });

  it('bounds renewal overlap, rejects a third active generation and preserves rows on denial', async () => {
    await enroll();
    await enroll(17, 86400);
    const repository = source.getRepository(AttractapReaderIdentity);
    const rows = await repository.find({ order: { generation: 'ASC' } });
    expect(rows[0].retiredAt.getTime()).toBeLessThanOrEqual(rows[1].validUntil.getTime());
    expect(rows[0].retiredAt.getTime()).toBeLessThanOrEqual(rows[0].validUntil.getTime());
    await expect(enroll(17, 1)).rejects.toThrow('At most two');
    expect(await repository.find({ order: { generation: 'ASC' } })).toEqual(rows);
    for (const overlap of [-1, 86401, 0.5])
      await expect(enroll(17, overlap)).rejects.toThrow('Invalid reader enrollment');
    await enroll();
    expect((await service.findForTime(fixture.identity.publicKeyFingerprint))?.generation).toBe(3);
  });

  it('rejects another reader reusing a revoked key and refuses production enrollment without qualification', async () => {
    await enroll();
    await service.revoke(17);
    await expect(enroll(18)).rejects.toThrow('belongs to another reader');
    await expect(
      service.enroll({
        readerId: 18,
        certificateFile: join(fixture.directory, 'enroll.pem'),
        manifestFile: join(fixture.directory, 'manifest.json'),
        enrollmentClass: 'production',
      }),
    ).rejects.toThrow('Production manifest');
    expect(await source.getRepository(AttractapReaderIdentity).count()).toBe(1);
    expect(await service.findForTime(fixture.identity.publicKeyFingerprint)).toBeNull();
  });

  it('waits for connection cancellation before reporting revocation and never restores bearer access', async () => {
    await enroll();
    const identity = await source.getRepository(AttractapReaderIdentity).findOneByOrFail({ readerId: 17 });
    let finish: () => void;
    const close = jest.fn(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    const cancel = jest.spyOn(proofs, 'cancelReader');
    await service.attach('connection', identity, close);
    let completed = false;
    const revocation = service.revoke(17).then(() => {
      completed = true;
    });
    while (!finish) await new Promise((resolve) => setImmediate(resolve));
    expect(completed).toBe(false);
    expect(cancel).toHaveBeenCalledWith(17);
    await expect(service.validateCertificate(identity.certificatePem)).rejects.toThrow('not active');
    finish();
    await revocation;
    expect(service.status(17)).toEqual([]);
    expect(await service.isLegacy(17)).toBe(false);
  });

  it('replaces hardware with a distinct key and closes the old reader before returning', async () => {
    await enroll();
    const repository = source.getRepository(AttractapReaderIdentity);
    const original = await repository.findOneByOrFail({ readerId: 17 });
    const close = jest.fn().mockResolvedValue(undefined);
    await service.attach('old-hardware', original, close);
    const publicKeyFile = join(fixture.directory, 'replacement-public.pem');
    writeFileSync(publicKeyFile, createPublicKey(fixture.read('server.key')).export({ type: 'spki', format: 'pem' }), {
      mode: 0o600,
    });
    const pem = await service.issue({ readerId: 18, publicKeyFile });
    writeFileSync(join(fixture.directory, 'replacement.pem'), pem, { mode: 0o600 });
    await service.enroll({
      readerId: 18,
      replaceReaderId: 17,
      certificateFile: join(fixture.directory, 'replacement.pem'),
      manifestFile: join(fixture.directory, 'manifest.json'),
      enrollmentClass: 'development',
    });
    expect(close).toHaveBeenCalledTimes(1);
    expect((await repository.findOneByOrFail({ readerId: 17 })).revokedAt).toBeInstanceOf(Date);
    const replacement = await repository.findOneByOrFail({ readerId: 18 });
    expect(replacement.publicKeyFingerprint).not.toBe(original.publicKeyFingerprint);
    await expect(service.validateCertificate(original.certificatePem)).rejects.toThrow('not active');
    await expect(service.validateCertificate(pem)).resolves.toMatchObject({ readerId: 18 });
  });

  it('closes active sessions when protected trust configuration is replaced', async () => {
    await enroll();
    const identity = await source.getRepository(AttractapReaderIdentity).findOneByOrFail({ readerId: 17 });
    const close = jest.fn().mockResolvedValue(undefined);
    await service.attach('old-trust', identity, close);
    const candidate = join(fixture.directory, 'accepted-configuration.json');
    writeFileSync(candidate, originalConfiguration, { mode: 0o600 });
    await service.installConfiguration(candidate);
    expect(close).toHaveBeenCalledTimes(1);
    expect(service.status(17)).toEqual([]);
    const verify = jest.spyOn(X509Certificate.prototype, 'verify');
    try {
      await service.validateCertificate(identity.certificatePem);
      expect(verify).toHaveBeenCalledTimes(1);
      await service.validateCertificate(identity.certificatePem);
      expect(verify).toHaveBeenCalledTimes(1);
    } finally {
      verify.mockRestore();
    }
  });

  it('rejects installation changes, invalid time trust and excessive root overlap without replacing configuration', async () => {
    const candidatePath = join(fixture.directory, 'candidate.json');
    const current = JSON.parse(originalConfiguration);
    const ring = JSON.parse(fixture.read('time.json').toString());
    writeFileSync(
      join(fixture.directory, 'three-time-keys.json'),
      JSON.stringify({ active: 1, keys: [1, 2, 3].map((id) => ({ ...ring.keys[0], id })) }),
      { mode: 0o600 },
    );
    for (const candidate of [
      { ...current, installationId: '00000000-0000-4000-8000-000000000002' },
      { ...current, timeKeyFile: join(fixture.directory, 'three-time-keys.json') },
      {
        ...current,
        readerCaFiles: [current.readerCaFiles[0], current.readerCaFiles[0]],
        readerCaOverlap: { startedAt: Date.now() - 100, endsAt: Date.now() + 86400_000 },
      },
    ]) {
      writeFileSync(candidatePath, JSON.stringify(candidate), { mode: 0o600 });
      await expect(service.installConfiguration(candidatePath)).rejects.toThrow();
      expect(fixture.read('reader-security.json').toString()).toBe(originalConfiguration);
    }
  });
});
