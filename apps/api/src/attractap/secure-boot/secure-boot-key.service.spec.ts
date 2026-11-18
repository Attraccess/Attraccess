import { generateKeyPair, KeyObject } from 'crypto';
import { promisify } from 'util';
import type { TransactionScope } from '../../database/unit-of-work';
import { EncryptionService } from '../../encryption/encryption.service';
import type { AuditEvent } from '../../audit/recorder/audit-event';
import { FakeSecureBootKeyStore, FakeUnitOfWork } from '../attractap-fake-stores.test-fixture';
import { SecureBootKeyService } from './secure-boot-key.service';

jest.setTimeout(120_000);

const PASSPHRASE = 'correct horse battery';
const ACTOR = { id: 7, authenticationMethod: 'session' as const };

// RSA-3072 generation takes seconds per key; the tests draw from a pool made once, in rotation.
const pool: KeyObject[] = [];
let next = 0;
beforeAll(async () => {
  const generate = promisify(generateKeyPair);
  const pairs = await Promise.all(Array.from({ length: 4 }, () => generate('rsa', { modulusLength: 3072 })));
  pool.push(...pairs.map((pair) => pair.privateKey));
  jest
    .spyOn(SecureBootKeyService.prototype as unknown as { generate: () => Promise<KeyObject> }, 'generate')
    .mockImplementation(async () => pool[next++ % pool.length]);
});

function setup() {
  const store = new FakeSecureBootKeyStore();
  const unitOfWork = new FakeUnitOfWork();
  const events: Array<{ event: AuditEvent; scope?: TransactionScope }> = [];
  const audit = {
    record: jest.fn(async (event: AuditEvent, scope?: TransactionScope) => void events.push({ event, scope })),
  };
  const encryption = new EncryptionService({ get: () => ({ AUTH_SESSION_SECRET: 'test-secret' }) } as never);
  const service = new SecureBootKeyService(store, unitOfWork, encryption, audit as never);
  return { store, unitOfWork, events, service, audit };
}

describe('SecureBootKeyService (against the key store port)', () => {
  it('creates both keys, stores the private parts encrypted and gates conversions on the recovery check', async () => {
    const { store, service } = setup();
    expect((await service.getState()).status).toBe('none');
    await expect(service.assertReadyForConversion()).rejects.toThrow('recovery key check');

    await service.createKeys(ACTOR);
    expect((await service.getState()).status).toBe('recovery-check-pending');
    expect(store.keys.map((key) => key.role).sort()).toEqual(['recovery', 'signing']);
    for (const key of store.keys) expect(key.privateKeyEncrypted).not.toContain('PRIVATE KEY');
    expect(JSON.stringify(await service.getState())).not.toContain('PRIVATE KEY');
  });

  it('records the key replacement inside the unit of work that swaps the keys', async () => {
    const { service, events } = setup();
    await service.createKeys(ACTOR);
    await service.downloadRecoveryKey(PASSPHRASE, ACTOR);

    // The replacement is audited with the transaction scope (it commits or rolls back with the swap); a download
    // changes nothing and is recorded without one.
    expect(events.map(({ event, scope }) => [event.action, scope?.isOpen ?? false])).toEqual([
      ['attractap.reader.secure_keys_created', true],
      ['attractap.reader.recovery_key_downloaded', false],
    ]);
    for (const { event } of events) expect(JSON.stringify(event)).not.toMatch(/PRIVATE KEY|correct horse/);
  });

  it('refuses to regenerate once a reader has a digest burned, and records nothing', async () => {
    const { store, service, events } = setup();
    await service.createKeys(ACTOR);
    events.length = 0;
    store.burned.push('a'.repeat(64)); // any burned digest blocks, even only KEY1

    await expect(service.createKeys(ACTOR)).rejects.toThrow('digests burned');
    expect(events).toEqual([]);
    expect(store.keys).toHaveLength(2);
  });

  it('keeps exactly one key pair when key creation is requested concurrently', async () => {
    const { store, service } = setup();
    await Promise.all([service.createKeys(ACTOR), service.createKeys(ACTOR), service.createKeys(ACTOR)]);
    expect(store.keys.filter((key) => key.role === 'signing')).toHaveLength(1);
    expect(store.keys.filter((key) => key.role === 'recovery')).toHaveLength(1);
  });

  it('drops the private part of the recovery key once the check passed', async () => {
    const { store, service } = setup();
    await service.createKeys(ACTOR);
    const download = await service.downloadRecoveryKey(PASSPHRASE, ACTOR);
    await service.checkRecoveryKey(download.pem, PASSPHRASE, ACTOR);

    const state = await service.getState();
    expect(state.status).toBe('ready');
    expect(store.keys.find((key) => key.role === 'recovery')?.privateKeyEncrypted).toBeNull();
    await expect(service.downloadRecoveryKey(PASSPHRASE, ACTOR)).rejects.toThrow('no longer held');
  });

  it('restores a signing key backup into an empty installation and blocks restoring it twice', async () => {
    const first = setup();
    await first.service.createKeys(ACTOR);
    const { pem } = await first.service.downloadSigningKeyBackup(PASSPHRASE, ACTOR);

    const second = setup();
    await second.service.restore('signing-backup', pem, PASSPHRASE, ACTOR);
    const state = await second.service.getState();
    expect(state.restored).toBe(true);
    expect(state.signingKey?.digest).toBe((await first.service.getState()).signingKey?.digest);
    await expect(second.service.restore('signing-backup', pem, PASSPHRASE, ACTOR)).rejects.toThrow('already');
    expect(second.events.at(-1)?.event.action).toBe('attractap.reader.secure_keys_restored');
  });

  it('only restores while no reader is secured with the current signing key', async () => {
    const { store, service } = setup();
    await service.createKeys(ACTOR);
    const { pem } = await service.downloadSigningKeyBackup(PASSPHRASE, ACTOR);
    store.burned.push((await service.getState()).signingKey?.digest ?? '');

    expect((await service.getState()).restoreAllowed).toBe(false);
    await expect(service.restore('signing-backup', pem, PASSPHRASE, ACTOR)).rejects.toThrow('secured');
  });

  it('selects the signing key of the digest a reader has burned, in any letter case', async () => {
    const { service } = setup();
    await service.createKeys(ACTOR);
    const state = await service.getState();
    const reader = {
      secureBootDigest0: state.signingKey?.digest.toUpperCase(),
      secureBootDigest1: null,
      secureBootSignerDigest: null,
    };
    expect(await service.signingKeyForReader(reader)).not.toBeNull();
    expect(await service.signingKeyForReader({ ...reader, secureBootDigest0: 'f'.repeat(64) })).toBeNull();
    expect(await service.signingKeyForReader({ ...reader, secureBootDigest0: null })).toBeNull();
  });
});
