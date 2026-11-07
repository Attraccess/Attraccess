import { AttractapSecureBootKey } from '@attraccess/database-entities';
import { createPublicKey, generateKeyPairSync } from 'crypto';
import { EncryptionService } from '../../encryption/encryption.service';
import { SecureBootKeyService } from './secure-boot-key.service';
import { signSecureBootImage, verifySecureBootImage } from './secure-boot-signer';

jest.setTimeout(120_000);

class MemoryKeys {
  rows: AttractapSecureBootKey[] = [];
  private nextId = 1;
  create = (value: Partial<AttractapSecureBootKey>) => ({ ...value }) as AttractapSecureBootKey;
  save = async (value: AttractapSecureBootKey) => {
    const row = { ...value, id: this.nextId++, createdAt: new Date() };
    this.rows.push(row);
    return row;
  };
  count = async () => this.rows.length;
  clear = async () => void (this.rows = []);
  delete = async ({ role }: { role: string }) => void (this.rows = this.rows.filter((r) => r.role !== role));
  update = async (id: number, patch: Partial<AttractapSecureBootKey>) =>
    void Object.assign(this.rows.find((r) => r.id === id) ?? {}, patch);
  findOne = async ({ where }: { where: Partial<AttractapSecureBootKey> }) =>
    [...this.rows]
      .reverse()
      .find((r) => Object.entries(where).every(([k, v]) => r[k as keyof AttractapSecureBootKey] === v)) ?? null;
  find = async () => [...this.rows].reverse().filter((r) => r.privateKeyEncrypted);
}

function setup() {
  const keys = new MemoryKeys();
  const readers = { burned: 0, count: async () => readers.burned };
  const encryption = new EncryptionService({ get: () => ({ AUTH_SESSION_SECRET: 'test-secret' }) } as never);
  const service = new SecureBootKeyService(keys as never, readers as never, encryption);
  return { keys, readers, service, encryption };
}

const PASSPHRASE = 'correct horse battery';

describe('SecureBootKeyService', () => {
  it('creates keys, stores private keys encrypted and gates conversions on the recovery check', async () => {
    const { keys, service } = setup();
    expect((await service.getState()).status).toBe('none');
    await expect(service.assertReadyForConversion()).rejects.toThrow('recovery key check');

    await service.createKeys();
    expect((await service.getState()).status).toBe('recovery-check-pending');
    await expect(service.assertReadyForConversion()).rejects.toThrow('recovery key check');
    for (const row of keys.rows) {
      expect(row.privateKeyEncrypted).not.toContain('PRIVATE KEY');
      expect(row.publicKeyPem).toContain('PUBLIC KEY');
    }
    expect(JSON.stringify(await service.getState())).not.toContain('PRIVATE KEY');
  });

  it('checks the recovery file, then deletes the private key', async () => {
    const { keys, service } = setup();
    await service.createKeys();
    await expect(service.downloadRecoveryKey('short')).rejects.toThrow('at least 12');
    const download = await service.downloadRecoveryKey(PASSPHRASE);
    expect(download.pem).toContain('ENCRYPTED PRIVATE KEY');
    // repeatable until the check passes
    await service.downloadRecoveryKey(PASSPHRASE);

    await expect(service.checkRecoveryKey(download.pem, 'wrong passphrase!!')).rejects.toThrow('passphrase');
    const signingBackup = await service.downloadSigningKeyBackup(PASSPHRASE);
    await expect(service.checkRecoveryKey(signingBackup.pem, PASSPHRASE)).rejects.toThrow('not the recovery key');
    expect((await service.getState()).status).toBe('recovery-check-pending');

    await service.checkRecoveryKey(download.pem, PASSPHRASE);
    const state = await service.getState();
    expect(state.status).toBe('ready');
    expect(state.recoveryKey?.verifiedAt).toBeInstanceOf(Date);
    expect(keys.rows.find((r) => r.role === 'recovery')?.privateKeyEncrypted).toBeNull();
    await expect(service.downloadRecoveryKey(PASSPHRASE)).rejects.toThrow('no longer held');
    await expect(service.assertReadyForConversion()).resolves.toBeUndefined();
  });

  it('refuses to regenerate once readers have digests burned', async () => {
    const { readers, service } = setup();
    await service.createKeys();
    const before = (await service.getState()).signingKey?.digest;
    readers.burned = 1;
    await expect(service.createKeys()).rejects.toThrow('digests burned');
    expect((await service.getState()).signingKey?.digest).toBe(before);
    readers.burned = 0;
    await service.createKeys();
    expect((await service.getState()).signingKey?.digest).not.toBe(before);
  });

  it('round-trips a signing key backup through a restore on a fresh installation', async () => {
    const first = setup();
    await first.service.createKeys();
    const { pem } = await first.service.downloadSigningKeyBackup(PASSPHRASE);
    const digest = (await first.service.getState()).signingKey?.digest;

    const second = setup();
    await second.service.restore('signing-backup', pem, PASSPHRASE);
    const state = await second.service.getState();
    expect(state.signingKey?.digest).toBe(digest);
    expect(state.restored).toBe(true);
    expect(state.status).toBe('recovery-check-pending');
    await expect(second.service.restore('signing-backup', pem, PASSPHRASE)).rejects.toThrow('already');
    await expect(second.service.restore('signing-backup', pem, 'wrong passphrase!!')).rejects.toThrow('passphrase');
  });

  it('turns the recovery file into the signing key and creates a fresh recovery key', async () => {
    const first = setup();
    await first.service.createKeys();
    const recovery = await first.service.downloadRecoveryKey(PASSPHRASE);
    const recoveryDigest = (await first.service.getState()).recoveryKey?.digest ?? null;
    await first.service.checkRecoveryKey(recovery.pem, PASSPHRASE);

    const reader = { secureBootDigest0: 'f'.repeat(64), secureBootDigest1: recoveryDigest };
    const lost = setup(); // database lost
    await lost.service.restore('recovery-file', recovery.pem, PASSPHRASE);
    const state = await lost.service.getState();
    expect(state.signingKey?.digest).toBe(recoveryDigest);
    expect(state.recoveryKey?.digest).not.toBe(recoveryDigest);
    expect(state.status).toBe('recovery-check-pending');
    await expect(lost.service.assertReadyForConversion()).rejects.toThrow();

    const signer = await lost.service.signingKeyForReader(reader);
    if (!signer) throw new Error('expected a signing key');
    expect(signer).not.toBeNull();
    const image = Buffer.alloc(5000, 7);
    const signed = signSecureBootImage(image, signer);
    expect(verifySecureBootImage(signed, createPublicKey(signer)).keyDigest).toBe(recoveryDigest);
    expect(
      await lost.service.signingKeyForReader({ secureBootDigest0: null, secureBootDigest1: 'a'.repeat(64) }),
    ).toBeNull();
    expect(await lost.service.signingKeyForReader({ secureBootDigest0: null, secureBootDigest1: null })).toBeNull();
  });

  it('only restores while no reader is secured with the current signing key', async () => {
    const { readers, service } = setup();
    await service.createKeys();
    const { pem } = await service.downloadSigningKeyBackup(PASSPHRASE);
    readers.burned = 2;
    expect((await service.getState()).restoreAllowed).toBe(false);
    await expect(service.restore('signing-backup', pem, PASSPHRASE)).rejects.toThrow('secured');
  });

  it('rejects keys that are not RSA-3072', async () => {
    const { service } = setup();
    const weak = generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey.export({
      type: 'pkcs8',
      format: 'pem',
      cipher: 'aes-256-cbc',
      passphrase: PASSPHRASE,
    }) as string;
    await expect(service.restore('signing-backup', weak, PASSPHRASE)).rejects.toThrow('RSA-3072');
  });
});
