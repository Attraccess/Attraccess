import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Attractap, AttractapSecureBootKey, type SecureBootKeyRole } from '@attraccess/database-entities';
import { createPrivateKey, createPublicKey, generateKeyPair, KeyObject } from 'crypto';
import { IsNull, Not, Repository } from 'typeorm';
import { promisify } from 'util';
import { EncryptionService } from '../../encryption/encryption.service';
import { publicKeyFingerprint, SECURE_BOOT_RSA_KEY_BITS, secureBootKeyDigest } from './secure-boot-signer';

export const MIN_PASSPHRASE_LENGTH = 12;

export type SecureBootKeysStatus = 'none' | 'recovery-check-pending' | 'ready';

export interface SecureBootKeyInfo {
  digest: string;
  fingerprint: string;
  restoredAt: Date | null;
}

export interface SecureBootKeysState {
  status: SecureBootKeysStatus;
  /** Latest key restored from a backup or recovery file, so the UI can say so. */
  restored: boolean;
  signingKey: SecureBootKeyInfo | null;
  recoveryKey: (SecureBootKeyInfo & { verifiedAt: Date | null }) | null;
  /** Readers with digests burned: regeneration and some restores are blocked while this is above 0. */
  readersWithBurnedDigests: number;
  /** A restore is allowed with no signing key, or while no reader is secured with the current one. */
  restoreAllowed: boolean;
}

export type RestoreSource = 'signing-backup' | 'recovery-file';

const generateRsaKeyPair = promisify(generateKeyPair);

function info(key: AttractapSecureBootKey): SecureBootKeyInfo {
  return { digest: key.digest, fingerprint: key.fingerprint, restoredAt: key.restoredAt };
}

@Injectable()
export class SecureBootKeyService {
  constructor(
    @InjectRepository(AttractapSecureBootKey) private readonly keys: Repository<AttractapSecureBootKey>,
    @InjectRepository(Attractap) private readonly readers: Repository<Attractap>,
    private readonly encryption: EncryptionService,
  ) {}

  /**
   * Key changes check the current rows, then replace them, with slow key generation in between. Two
   * of them at once (a double press, a second tab) would each pass the check and leave two key pairs
   * behind, so they run one at a time.
   */
  private queue: Promise<unknown> = Promise.resolve();
  private exclusive<T>(task: () => Promise<T>): Promise<T> {
    const run = this.queue.then(task, task);
    this.queue = run.catch(() => undefined);
    return run;
  }

  private async latest(role: SecureBootKeyRole): Promise<AttractapSecureBootKey | null> {
    return await this.keys.findOne({ where: { role }, order: { id: 'DESC' } });
  }

  private async burnedReaderCount(): Promise<number> {
    return await this.readers.count({
      where: [{ secureBootDigest0: Not(IsNull()) }, { secureBootDigest1: Not(IsNull()) }],
    });
  }

  async getState(): Promise<SecureBootKeysState> {
    const [signing, recovery, burned] = await Promise.all([
      this.latest('signing'),
      this.latest('recovery'),
      this.burnedReaderCount(),
    ]);
    const status: SecureBootKeysStatus =
      !signing || !recovery ? 'none' : recovery.verifiedAt ? 'ready' : 'recovery-check-pending';
    return {
      status,
      restored: Boolean(signing?.restoredAt),
      signingKey: signing ? info(signing) : null,
      recoveryKey: recovery ? { ...info(recovery), verifiedAt: recovery.verifiedAt } : null,
      readersWithBurnedDigests: burned,
      restoreAllowed: !signing || burned === 0,
    };
  }

  /** Server-side gate for every conversion: keys exist and the recovery check passed. */
  async assertReadyForConversion(): Promise<void> {
    if ((await this.getState()).status !== 'ready') {
      throw new ConflictException('The recovery key check has not passed yet');
    }
  }

  createKeys(): Promise<{ signingFingerprint: string; recoveryFingerprint: string }> {
    return this.exclusive(() => this.replaceKeys());
  }

  private async replaceKeys(): Promise<{ signingFingerprint: string; recoveryFingerprint: string }> {
    if ((await this.keys.count()) > 0) {
      if ((await this.burnedReaderCount()) > 0) {
        throw new ConflictException('Keys cannot be regenerated while readers have digests burned with them');
      }
      await this.keys.clear();
    }
    const signing = await this.store('signing', await this.generate(), null);
    const recovery = await this.store('recovery', await this.generate(), null);
    return { signingFingerprint: signing.fingerprint, recoveryFingerprint: recovery.fingerprint };
  }

  private async generate(): Promise<KeyObject> {
    const { privateKey } = await generateRsaKeyPair('rsa', { modulusLength: SECURE_BOOT_RSA_KEY_BITS });
    return privateKey;
  }

  private async store(role: SecureBootKeyRole, privateKey: KeyObject, restoredAt: Date | null) {
    const publicKey = createPublicKey(privateKey);
    return await this.keys.save(
      this.keys.create({
        role,
        publicKeyPem: publicKey.export({ type: 'spki', format: 'pem' }) as string,
        digest: secureBootKeyDigest(publicKey),
        fingerprint: publicKeyFingerprint(publicKey),
        privateKeyEncrypted: this.encryption.encrypt(privateKey.export({ type: 'pkcs8', format: 'pem' }) as string),
        verifiedAt: null,
        restoredAt,
      }),
    );
  }

  private privateKeyOf(row: AttractapSecureBootKey): KeyObject {
    if (!row.privateKeyEncrypted) throw new ConflictException('The private key is no longer held by the server');
    let pem: string;
    try {
      pem = this.encryption.decrypt(row.privateKeyEncrypted);
    } catch {
      throw new ConflictException('The stored key cannot be decrypted. Was AUTH_SESSION_SECRET changed?');
    }
    return createPrivateKey(pem);
  }

  private exportEncrypted(key: KeyObject, passphrase: string): string {
    return key.export({ type: 'pkcs8', format: 'pem', cipher: 'aes-256-cbc', passphrase }) as string;
  }

  private assertPassphrase(passphrase: unknown): asserts passphrase is string {
    if (typeof passphrase !== 'string' || passphrase.length < MIN_PASSPHRASE_LENGTH) {
      throw new BadRequestException(`The passphrase needs at least ${MIN_PASSPHRASE_LENGTH} characters`);
    }
  }

  /** Repeatable until the check passes; afterwards the private key is gone. */
  async downloadRecoveryKey(passphrase: string): Promise<{ pem: string; fingerprint: string }> {
    this.assertPassphrase(passphrase);
    const recovery = await this.latest('recovery');
    if (!recovery) throw new ConflictException('No keys have been created yet');
    if (recovery.verifiedAt || !recovery.privateKeyEncrypted) {
      throw new ConflictException('The recovery key was already verified and is no longer held by the server');
    }
    return { pem: this.exportEncrypted(this.privateKeyOf(recovery), passphrase), fingerprint: recovery.fingerprint };
  }

  private importKey(pem: unknown, passphrase: unknown): KeyObject {
    if (typeof pem !== 'string' || typeof passphrase !== 'string' || !pem.trim()) {
      throw new BadRequestException('A key file and its passphrase are required');
    }
    let key: KeyObject;
    try {
      key = createPrivateKey({ key: pem, format: 'pem', passphrase });
    } catch {
      throw new BadRequestException('The key file could not be read with this passphrase');
    }
    try {
      secureBootKeyDigest(key); // rejects anything that is not RSA-3072
    } catch {
      throw new BadRequestException(`The key must be an RSA-${SECURE_BOOT_RSA_KEY_BITS} private key`);
    }
    return key;
  }

  checkRecoveryKey(pem: string, passphrase: string): Promise<{ fingerprint: string }> {
    return this.exclusive(() => this.verifyRecoveryKey(pem, passphrase));
  }

  private async verifyRecoveryKey(pem: string, passphrase: string): Promise<{ fingerprint: string }> {
    const recovery = await this.latest('recovery');
    if (!recovery) throw new ConflictException('No keys have been created yet');
    if (recovery.verifiedAt) throw new ConflictException('The recovery key was already verified');
    const uploaded = this.importKey(pem, passphrase);
    if (publicKeyFingerprint(uploaded) !== recovery.fingerprint) {
      throw new BadRequestException('This file is not the recovery key of this installation');
    }
    await this.keys.update(recovery.id, { privateKeyEncrypted: null, verifiedAt: new Date() });
    return { fingerprint: recovery.fingerprint };
  }

  async downloadSigningKeyBackup(passphrase: string): Promise<{ pem: string; fingerprint: string }> {
    this.assertPassphrase(passphrase);
    const signing = await this.latest('signing');
    if (!signing?.privateKeyEncrypted) throw new ConflictException('There is no signing key to back up');
    return { pem: this.exportEncrypted(this.privateKeyOf(signing), passphrase), fingerprint: signing.fingerprint };
  }

  /**
   * Restore from a signing-key backup or from the recovery file. A recovery file becomes the signing
   * key (the readers' KEY1 matches it) and a fresh recovery key is created that must pass the check.
   */
  restore(
    source: RestoreSource,
    pem: string,
    passphrase: string,
  ): Promise<{ signingFingerprint: string; recoveryFingerprint: string }> {
    return this.exclusive(() => this.restoreKeys(source, pem, passphrase));
  }

  private async restoreKeys(
    source: RestoreSource,
    pem: string,
    passphrase: string,
  ): Promise<{ signingFingerprint: string; recoveryFingerprint: string }> {
    const state = await this.getState();
    if (!state.restoreAllowed) {
      throw new ConflictException('Keys cannot be restored while readers are secured with the current signing key');
    }
    const key = this.importKey(pem, passphrase);
    const digest = secureBootKeyDigest(key);
    if (state.signingKey?.digest === digest || (await this.keys.findOne({ where: { digest, role: 'signing' } }))) {
      throw new ConflictException('This key is already the signing key of this installation');
    }
    const restoredAt = new Date();
    let recovery = await this.latest('recovery');
    if (source === 'recovery-file') {
      // The file is the former recovery key: it signs now, and a fresh recovery key must pass the check.
      await this.keys.clear();
      recovery = null;
    } else {
      await this.keys.delete({ role: 'signing' });
    }
    const signing = await this.store('signing', key, restoredAt);
    recovery ??= await this.store('recovery', await this.generate(), restoredAt);
    return { signingFingerprint: signing.fingerprint, recoveryFingerprint: recovery.fingerprint };
  }

  /**
   * The key to sign a reader's images with: any held private key whose digest the reader has burned.
   * Null shows as "No signing key for this reader".
   */
  async signingKeyForReader(
    reader: Pick<Attractap, 'secureBootDigest0' | 'secureBootDigest1'>,
  ): Promise<KeyObject | null> {
    const digests = [reader.secureBootDigest0, reader.secureBootDigest1].filter((d): d is string => Boolean(d));
    if (!digests.length) return null;
    const candidates = await this.keys.find({ where: { privateKeyEncrypted: Not(IsNull()) }, order: { id: 'DESC' } });
    const match = candidates.find((row) => digests.includes(row.digest));
    return match ? this.privateKeyOf(match) : null;
  }
}
