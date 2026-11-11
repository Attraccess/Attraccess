import { ConflictException } from '@nestjs/common';
import { Attractap, AttractapSecureBootKey, entities } from '@attraccess/database-entities';
import { createPrivateKey, createPublicKey, generateKeyPair, generateKeyPairSync, KeyObject } from 'crypto';
import { readFileSync } from 'fs';
import { join } from 'path';
import { DataSource } from 'typeorm';
import { promisify } from 'util';
import { EncryptionService } from '../../encryption/encryption.service';
import { SecureBootKeyService } from './secure-boot-key.service';
import type { AuditEvent } from '../../audit/recorder/audit-event';
import { projectAuditRow } from '../../audit/recorder/audit-row';
import { signSecureBootImage, verifySecureBootImage } from './secure-boot-signer';

jest.setTimeout(120_000);

const PASSPHRASE = 'correct horse battery';
const ACTOR = { id: 7, authenticationMethod: 'session' as const };
const LAB_KEYS = join(__dirname, '../../../../attractap/firmware/lab/secure-boot');

// RSA-3072 generation takes up to seconds per key; the tests draw from a pool made once, in rotation.
const pool: KeyObject[] = [];
let next = 0;
beforeAll(async () => {
  const generate = promisify(generateKeyPair);
  const pairs = await Promise.all(Array.from({ length: 7 }, () => generate('rsa', { modulusLength: 3072 })));
  pool.push(...pairs.map((pair) => pair.privateKey));
  jest
    .spyOn(SecureBootKeyService.prototype as unknown as { generate: () => Promise<KeyObject> }, 'generate')
    .mockImplementation(async () => pool[next++ % pool.length]);
});

const databases: DataSource[] = [];
afterAll(async () => {
  await Promise.all(databases.map((database) => database.destroy()));
});

async function setup(secret = 'test-secret', database?: DataSource) {
  if (!database) {
    database = await new DataSource({
      type: 'sqlite',
      database: ':memory:',
      entities: Object.values(entities),
      synchronize: true,
    }).initialize();
    databases.push(database);
  }
  const keys = database.getRepository(AttractapSecureBootKey);
  const readers = database.getRepository(Attractap);
  const encryption = new EncryptionService({ get: () => ({ AUTH_SESSION_SECRET: secret }) } as never);
  const events: AuditEvent[] = [];
  const audit = { record: jest.fn(async (event: AuditEvent) => void events.push(event)) };
  const service = new SecureBootKeyService(keys, readers, encryption, audit as never);
  const addReader = (secureBootDigest0: string | null, secureBootDigest1: string | null) =>
    readers.save(readers.create({ name: 'reader', apiTokenHash: 'hash', secureBootDigest0, secureBootDigest1 }));
  return { database, keys, readers, service, addReader, events };
}

describe('SecureBootKeyService', () => {
  it('creates keys, stores private keys encrypted and gates conversions on the recovery check', async () => {
    const { keys, service } = await setup();
    expect((await service.getState()).status).toBe('none');
    await expect(service.assertReadyForConversion()).rejects.toThrow('recovery key check');

    await service.createKeys(ACTOR);
    expect((await service.getState()).status).toBe('recovery-check-pending');
    await expect(service.assertReadyForConversion()).rejects.toThrow('recovery key check');
    for (const row of await keys.find()) {
      expect(row.privateKeyEncrypted).not.toContain('PRIVATE KEY');
      expect(row.publicKeyPem).toContain('PUBLIC KEY');
    }
    expect(JSON.stringify(await service.getState())).not.toContain('PRIVATE KEY');
  });

  it('audits every key operation for its actor, with fingerprints only, never key material or the passphrase', async () => {
    const first = await setup();
    await first.service.createKeys(ACTOR);
    const recovery = await first.service.downloadRecoveryKey(PASSPHRASE, ACTOR);
    await first.service.checkRecoveryKey(recovery.pem, PASSPHRASE, ACTOR);
    const { pem } = await first.service.downloadSigningKeyBackup(PASSPHRASE, ACTOR);
    const second = await setup();
    await second.service.restore('signing-backup', pem, PASSPHRASE, ACTOR);

    const events = [...first.events, ...second.events];
    expect(events.map((event) => event.action)).toEqual([
      'attractap.reader.secure_keys_created',
      'attractap.reader.recovery_key_downloaded',
      'attractap.reader.recovery_key_verified',
      'attractap.reader.signing_key_backup_downloaded',
      'attractap.reader.secure_keys_restored',
    ]);
    for (const event of events) {
      expect(JSON.stringify(event)).not.toMatch(/PRIVATE KEY|correct horse/);
      expect(event).toMatchObject({ actor: ACTOR, subject: { type: 'attractap.installation', id: 1 } });
      // Survives the attractap policy and stores what the controller recorded before.
      expect(projectAuditRow(event)).toMatchObject({ domain: 'attractap', pluginId: 'core', actorId: 7 });
    }
  });

  it('keeps exactly one key pair when key creation is requested concurrently', async () => {
    const { keys, service } = await setup();

    await Promise.all([service.createKeys(ACTOR), service.createKeys(ACTOR), service.createKeys(ACTOR)]);

    expect(await keys.countBy({ role: 'signing' })).toBe(1);
    expect(await keys.countBy({ role: 'recovery' })).toBe(1);
    const state = await service.getState();
    expect(state.signingKey?.fingerprint).toBe((await keys.findOneBy({ role: 'signing' }))?.fingerprint);
  });

  it('fails cleanly, without key material, when AUTH_SESSION_SECRET is no longer the one the keys were stored with', async () => {
    const { database, service } = await setup();
    await service.createKeys(ACTOR);
    const rotated = (await setup('another-secret', database)).service;

    const failure = await rotated.downloadSigningKeyBackup(PASSPHRASE, ACTOR).catch((error: Error) => error);

    expect(failure).toBeInstanceOf(ConflictException);
    expect((failure as Error).message).toContain('AUTH_SESSION_SECRET');
    expect((failure as Error).message).not.toContain('PRIVATE');
    await expect(rotated.downloadRecoveryKey(PASSPHRASE, ACTOR)).rejects.toThrow('AUTH_SESSION_SECRET');
  });

  it('checks the recovery file, then deletes the private key', async () => {
    const { keys, service } = await setup();
    await service.createKeys(ACTOR);
    await expect(service.downloadRecoveryKey('short', ACTOR)).rejects.toThrow('at least 12');
    await expect(service.downloadRecoveryKey('é'.repeat(600), ACTOR)).rejects.toThrow('at most 1023 bytes');
    const download = await service.downloadRecoveryKey(PASSPHRASE, ACTOR);
    expect(download.pem).toContain('ENCRYPTED PRIVATE KEY');
    // repeatable until the check passes
    await service.downloadRecoveryKey(PASSPHRASE, ACTOR);

    await expect(service.checkRecoveryKey(download.pem, 'wrong passphrase!!', ACTOR)).rejects.toThrow('passphrase');
    const signingBackup = await service.downloadSigningKeyBackup(PASSPHRASE, ACTOR);
    await expect(service.checkRecoveryKey(signingBackup.pem, PASSPHRASE, ACTOR)).rejects.toThrow(
      'not the recovery key',
    );
    expect((await service.getState()).status).toBe('recovery-check-pending');

    await service.checkRecoveryKey(download.pem, PASSPHRASE, ACTOR);
    const state = await service.getState();
    expect(state.status).toBe('ready');
    expect(state.recoveryKey?.verifiedAt).toBeInstanceOf(Date);
    expect((await keys.findOneBy({ role: 'recovery' }))?.privateKeyEncrypted).toBeNull();
    await expect(service.downloadRecoveryKey(PASSPHRASE, ACTOR)).rejects.toThrow('no longer held');
    await expect(service.assertReadyForConversion()).resolves.toBeUndefined();
  });

  it('rejects a plain, unencrypted key file whatever passphrase comes with it', async () => {
    const { service, database } = await setup();
    await service.createKeys(ACTOR);
    const recovery = (await database.getRepository(AttractapSecureBootKey).findOneByOrFail({ role: 'recovery' }))
      .privateKeyEncrypted as string;
    const plain = new EncryptionService({ get: () => ({ AUTH_SESSION_SECRET: 'test-secret' }) } as never).decrypt(
      recovery,
    );

    await expect(service.checkRecoveryKey(plain, 'any passphrase at all', ACTOR)).rejects.toThrow(
      'passphrase-protected',
    );
    expect((await service.getState()).status).toBe('recovery-check-pending');
  });

  it('refuses to regenerate once readers have digests burned', async () => {
    const { service, readers, addReader } = await setup();
    await service.createKeys(ACTOR);
    const before = (await service.getState()).signingKey?.digest ?? null;
    const reader = await addReader(null, 'a'.repeat(64)); // any burned digest blocks, even only KEY1
    await expect(service.createKeys(ACTOR)).rejects.toThrow('digests burned');
    expect((await service.getState()).signingKey?.digest).toBe(before);
    await readers.delete(reader.id);
    await addReader(null, null);
    await service.createKeys(ACTOR);
    expect((await service.getState()).signingKey?.digest).not.toBe(before);
  });

  it('round-trips a signing key backup through a restore on a fresh installation', async () => {
    const first = await setup();
    await first.service.createKeys(ACTOR);
    const { pem } = await first.service.downloadSigningKeyBackup(PASSPHRASE, ACTOR);
    const digest = (await first.service.getState()).signingKey?.digest;

    const second = await setup();
    await second.service.restore('signing-backup', pem, PASSPHRASE, ACTOR);
    const state = await second.service.getState();
    expect(state.signingKey?.digest).toBe(digest);
    expect(state.restored).toBe(true);
    expect(state.status).toBe('recovery-check-pending');
    await expect(second.service.restore('signing-backup', pem, PASSPHRASE, ACTOR)).rejects.toThrow('already');
    await expect(second.service.restore('signing-backup', pem, 'wrong passphrase!!', ACTOR)).rejects.toThrow(
      'passphrase',
    );
  });

  it('keeps the signing key when the recovery file is restored as a signing key backup', async () => {
    const { service } = await setup();
    await service.createKeys(ACTOR);
    const before = await service.getState();
    const recovery = await service.downloadRecoveryKey(PASSPHRASE, ACTOR);

    await expect(service.restore('signing-backup', recovery.pem, PASSPHRASE, ACTOR)).rejects.toThrow('recovery file');

    expect(await service.getState()).toEqual(before);
  });

  it('turns the recovery file into the signing key and creates a fresh recovery key', async () => {
    const first = await setup();
    await first.service.createKeys(ACTOR);
    const recovery = await first.service.downloadRecoveryKey(PASSPHRASE, ACTOR);
    const recoveryDigest = (await first.service.getState()).recoveryKey?.digest ?? null;
    await first.service.checkRecoveryKey(recovery.pem, PASSPHRASE, ACTOR);

    const lost = await setup(); // database lost
    const reader = await lost.addReader('f'.repeat(64), recoveryDigest);
    await lost.service.restore('recovery-file', recovery.pem, PASSPHRASE, ACTOR);
    const state = await lost.service.getState();
    expect(state.signingKey?.digest).toBe(recoveryDigest);
    expect(state.recoveryKey?.digest).not.toBe(recoveryDigest);
    expect(state.status).toBe('recovery-check-pending');
    await expect(lost.service.assertReadyForConversion()).rejects.toThrow();

    const signer = await lost.service.signingKeyForReader(reader);
    if (!signer) throw new Error('expected a signing key');
    const signed = signSecureBootImage(Buffer.alloc(5000, 7), signer);
    expect(verifySecureBootImage(signed, createPublicKey(signer)).keyDigest).toBe(recoveryDigest);
    // eFuse reports may spell digests in upper case
    expect(
      await lost.service.signingKeyForReader({ ...reader, secureBootDigest1: recoveryDigest?.toUpperCase() ?? null }),
    ).not.toBeNull();
    expect(
      await lost.service.signingKeyForReader({ ...reader, secureBootDigest0: null, secureBootDigest1: 'a'.repeat(64) }),
    ).toBeNull();
    expect(
      await lost.service.signingKeyForReader({ ...reader, secureBootDigest0: null, secureBootDigest1: null }),
    ).toBeNull();
  });

  it('only restores while no reader is secured with the current signing key', async () => {
    const { service, addReader } = await setup();
    await service.createKeys(ACTOR);
    const { pem } = await service.downloadSigningKeyBackup(PASSPHRASE, ACTOR);
    await addReader('b'.repeat(64), 'c'.repeat(64)); // burned with keys this installation no longer holds
    expect((await service.getState()).restoreAllowed).toBe(true);

    await addReader((await service.getState()).signingKey?.digest ?? null, null);
    expect((await service.getState()).restoreAllowed).toBe(false);
    await expect(service.restore('signing-backup', pem, PASSPHRASE, ACTOR)).rejects.toThrow('secured');
  });

  it('lets the signing key backup replace a stored key that AUTH_SESSION_SECRET can no longer open', async () => {
    const { database, service, addReader } = await setup();
    await service.createKeys(ACTOR);
    const { pem } = await service.downloadSigningKeyBackup(PASSPHRASE, ACTOR);
    const digest = (await service.getState()).signingKey?.digest ?? null;
    await addReader(digest, null);
    const other = await setup();
    await other.service.createKeys(ACTOR);
    const foreign = (await other.service.downloadSigningKeyBackup(PASSPHRASE, ACTOR)).pem;

    const rotated = (await setup('another-secret', database)).service;
    expect((await rotated.getState()).restoreAllowed).toBe(true);
    // a key the secured reader does not trust must not drop the one a corrected secret would bring back
    await expect(rotated.restore('signing-backup', foreign, PASSPHRASE, ACTOR)).rejects.toThrow('trust');
    expect((await rotated.getState()).signingKey?.digest).toBe(digest);

    await rotated.restore('signing-backup', pem, PASSPHRASE, ACTOR);
    expect((await rotated.getState()).signingKey?.digest).toBe(digest);
    expect((await rotated.getState()).restoreAllowed).toBe(false);
    await expect(rotated.downloadSigningKeyBackup(PASSPHRASE, ACTOR)).resolves.toBeDefined();
    // the unchecked recovery key could not be opened any more: a fresh one replaced it, so the check can pass
    await expect(rotated.downloadRecoveryKey(PASSPHRASE, ACTOR)).resolves.toBeDefined();
  });

  it('prefers the signer recorded for a reader when it holds several burned keys', async () => {
    const { service, addReader } = await setup();
    await service.createKeys(ACTOR);
    const state = await service.getState();
    const reader = await addReader(state.signingKey?.digest ?? null, state.recoveryKey?.digest ?? null);
    const recoverySigner = await service.signingKeyForReader({
      ...reader,
      secureBootSignerDigest: state.recoveryKey?.digest ?? null,
    });
    expect(
      recoverySigner &&
        verifySecureBootImage(signSecureBootImage(Buffer.alloc(10), recoverySigner), recoverySigner).keyDigest,
    ).toBe(state.recoveryKey?.digest);
  });

  it('rejects keys that are not RSA-3072 and the public device-lab keys', async () => {
    const { service } = await setup();
    const weak = generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey.export({
      type: 'pkcs8',
      format: 'pem',
      cipher: 'aes-256-cbc',
      passphrase: PASSPHRASE,
    }) as string;
    await expect(service.restore('signing-backup', weak, PASSPHRASE, ACTOR)).rejects.toThrow('RSA-3072');

    for (const file of ['lab-signing-key.pem', 'lab-recovery-key.pem']) {
      const lab = encryptedLabKey(file);
      for (const source of ['signing-backup', 'recovery-file'] as const) {
        await expect(service.restore(source, lab, PASSPHRASE, ACTOR)).rejects.toThrow('device-lab');
      }
    }
    expect((await service.getState()).status).toBe('none');
  });
});

/** The lab keys ship unencrypted; wrap them the way this page's downloads are. */
function encryptedLabKey(file: string): string {
  return createPrivateKey(readFileSync(join(LAB_KEYS, file), 'utf8')).export({
    type: 'pkcs8',
    format: 'pem',
    cipher: 'aes-256-cbc',
    passphrase: PASSPHRASE,
  }) as string;
}
