import { EncryptionService } from '../../encryption/encryption.service';
import { ConfigService } from '@nestjs/config';
import { constants, generateKeyPairSync, verify } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { performance } from 'node:perf_hooks';
import { Repository } from 'typeorm';
import { AttractapReaderIdentity } from '@attraccess/database-entities';
import { ReaderIdentityService } from './reader-identity.service';
import { ReaderTimeService, encodeSignedReaderTime } from './reader-time.service';
import { VerifiedCardSessionService } from './verified-card-session.service';
import { readerSecurityFixture } from './reader-security.test-fixture';

describe('automatic reader signed time', () => {
  let fixture: ReturnType<typeof readerSecurityFixture>;
  let service: ReaderTimeService;
  let identity: ReaderIdentityService;
  beforeAll(() => {
    fixture = readerSecurityFixture();
  });
  afterAll(() => fixture.cleanup());
  beforeEach(() => {
    const repository = {
      find: jest.fn().mockResolvedValue([fixture.identity]),
      findOneBy: jest.fn().mockResolvedValue(fixture.identity),
    };
    identity = new ReaderIdentityService(
      repository as unknown as Repository<AttractapReaderIdentity>,
      new ConfigService({ app: { READER_SECURITY_DIRECTORY: fixture.directory } }),
      new VerifiedCardSessionService(),
      new EncryptionService(new ConfigService()),
    );
    service = new ReaderTimeService(identity);
  });
  it('returns exactly 109 canonical bytes and a 384-byte PSS signature with 32-byte salt', async () => {
    const reply = await service.reply(fixture.request(), '127.0.0.1');
    expect(reply.length).toBe(493);
    expect(reply.subarray(0, 16)).toEqual(Buffer.concat([Buffer.from('ATTR-TIME-V1'), Buffer.alloc(4)]));
    const message = encodeSignedReaderTime({
      keyId: 1,
      installationId: fixture.identity.installationId,
      fingerprint: fixture.identity.publicKeyFingerprint,
      challenge: fixture.request().subarray(49),
      seconds: reply.readBigUInt64BE(101),
    });
    expect(reply.subarray(0, 109)).toEqual(message);
    const options = { key: fixture.publicKey, padding: constants.RSA_PKCS1_PSS_PADDING, saltLength: 32 };
    expect(verify('sha256', message, options, reply.subarray(109))).toBe(true);
    for (const position of [0, 16, 17, 21, 37, 69, 101]) {
      const altered = Buffer.from(message);
      altered[position] ^= 1;
      expect(verify('sha256', altered, options, reply.subarray(109))).toBe(false);
    }
    expect(verify('sha256', message, { ...options, saltLength: 20 }, reply.subarray(109))).toBe(false);
  });
  it('bounds peer state and reclaims only buckets older than 60 seconds before admission', async () => {
    let now = 0;
    const clock = jest.spyOn(performance, 'now').mockImplementation(() => now);
    const lookup = jest.spyOn(identity, 'findForTime').mockResolvedValue(null);
    try {
      for (let index = 0; index < 1024; index++)
        await expect(service.reply(fixture.request(), `peer-${index}`)).rejects.toThrow('denied');
      expect(lookup).toHaveBeenCalledTimes(1024);
      await expect(service.reply(fixture.request(), 'peer-1024')).rejects.toThrow('denied');
      expect(lookup).toHaveBeenCalledTimes(1024);
      now = 60000;
      await expect(service.reply(fixture.request(), 'peer-1024')).rejects.toThrow('denied');
      expect(lookup).toHaveBeenCalledTimes(1024);
      lookup.mockRestore();
      await expect(service.reply(fixture.request(), 'peer-0')).resolves.toHaveLength(493);
      now = 60001;
      await expect(service.reply(fixture.request(), 'peer-1024')).resolves.toHaveLength(493);
      expect((service as unknown as { peers: Map<string, unknown> }).peers.size).toBe(2);
    } finally {
      lookup.mockRestore();
      clock.mockRestore();
    }
  });
  it('limits actual peers to burst two and isolates other peers', async () => {
    await service.reply(fixture.request(), 'peer-a');
    await service.reply(fixture.request(), 'peer-a');
    await expect(service.reply(fixture.request(), 'peer-a')).rejects.toThrow('denied');
    await expect(service.reply(fixture.request(), 'peer-b')).resolves.toHaveLength(493);
  });
  it.each([0, 80, 82, 640, 641])('rejects noncanonical input size %s before signing', async (size) => {
    await expect(service.reply(Buffer.alloc(size), 'peer')).rejects.toThrow('denied');
  });
  it('rejects wrong installation and revoked identities', async () => {
    const wrong = fixture.request();
    wrong[1] ^= 1;
    await expect(service.reply(wrong, 'peer-a')).rejects.toThrow('denied');
    fixture.identity.revokedAt = new Date();
    try {
      await expect(service.reply(fixture.request(), 'peer-b')).rejects.toThrow('denied');
    } finally {
      fixture.identity.revokedAt = null;
    }
  });

  it('rotates through two protected time keys, rejects retirement and a third key, and recovers automatically', async () => {
    const original = fixture.read('time.json');
    const ring = JSON.parse(original.toString());
    const replacement = generateKeyPairSync('rsa', { modulusLength: 3072 });
    ring.keys.push({ ...ring.keys[0], id: 2, pem: replacement.privateKey.export({ type: 'pkcs8', format: 'pem' }) });
    ring.active = 2;
    const file = join(fixture.directory, 'time.json');
    const save = () => writeFileSync(file, JSON.stringify(ring), { mode: 0o600 });
    try {
      save();
      const reply = await service.reply(fixture.request(), 'rotation');
      expect(reply.readUInt32BE(17)).toBe(2);
      expect(
        verify(
          'sha256',
          reply.subarray(0, 109),
          { key: replacement.publicKey, padding: constants.RSA_PKCS1_PSS_PADDING, saltLength: 32 },
          reply.subarray(109),
        ),
      ).toBe(true);
      ring.keys[1].retired = true;
      save();
      await expect(service.reply(fixture.request(), 'retired')).rejects.toThrow('unavailable');
      ring.keys[1].retired = false;
      ring.keys.push({ ...ring.keys[0], id: 3 });
      save();
      await expect(service.reply(fixture.request(), 'third')).rejects.toThrow('keyring');
      ring.keys.pop();
      ring.keys[1].validUntil = Date.now() - 1;
      ring.keys[1].validFrom = Date.now() - 10000;
      save();
      await expect(service.reply(fixture.request(), 'expired')).rejects.toThrow('unavailable');
      ring.active = 1;
      save();
      const recovered = await service.reply(fixture.request(), 'recovery');
      expect(recovered.readUInt32BE(17)).toBe(1);
      expect(
        verify(
          'sha256',
          recovered.subarray(0, 109),
          { key: fixture.publicKey, padding: constants.RSA_PKCS1_PSS_PADDING, saltLength: 32 },
          recovered.subarray(109),
        ),
      ).toBe(true);
    } finally {
      writeFileSync(file, original);
    }
  });
});
