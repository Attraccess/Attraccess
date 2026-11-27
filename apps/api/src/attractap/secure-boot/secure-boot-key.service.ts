import { BadRequestException, ConflictException, Inject, Injectable } from '@nestjs/common';
import type { AttractapSecureBootKeyRecord, AttractapSecureBootKeyRole } from '@attraccess/application-models';
import { Mutex } from 'async-mutex';
import { createPrivateKey, createPublicKey, generateKeyPair, KeyObject } from 'crypto';
import { promisify } from 'util';
import { UNIT_OF_WORK, type TransactionScope, type UnitOfWork } from '../../database/unit-of-work';
import { EncryptionService } from '../../encryption/encryption.service';
import type { AttractapAuditAction } from '../../audit/policies/attractap';
import { AUDIT_RECORDER, AuditActor, AuditDetails, AuditRecorder } from '../../audit/recorder/audit-event';
import {
  isLabSecureBootKey,
  publicKeyFingerprint,
  SECURE_BOOT_RSA_KEY_BITS,
  secureBootKeyDigest,
} from './secure-boot-signer';
import {
  ATTRACTAP_SECURE_BOOT_KEY_STORE,
  type AttractapSecureBootKeyStore,
  type SecureBootReaderDigests,
} from './secure-boot-key-store.port';
import { SECURE_BOOT_KEY_CHANGE_GUARD, type SecureBootKeyChangeGuard } from './secure-boot-key-change-guard.port';

export const MIN_PASSPHRASE_LENGTH = 12;
/** OpenSSL reads PEM passphrases into a 1 KiB buffer; a longer one would produce a file nothing can open. */
export const MAX_PASSPHRASE_BYTES = 1023;

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
  /**
   * A restore is allowed when the server holds no usable signing key (none, or one that can no longer
   * be decrypted), or while no reader has the current signing key's digest burned.
   */
  restoreAllowed: boolean;
}

export type RestoreSource = 'signing-backup' | 'recovery-file';

const generateRsaKeyPair = promisify(generateKeyPair);

/** Encrypted PKCS#8 (what this server writes) or legacy encrypted PKCS#1; a plain PEM proves no passphrase. */
const ENCRYPTED_PEM = /-----BEGIN ENCRYPTED PRIVATE KEY-----|Proc-Type:\s*4,ENCRYPTED/;

function info(key: AttractapSecureBootKeyRecord): SecureBootKeyInfo {
  return { digest: key.digest, fingerprint: key.fingerprint, restoredAt: key.restoredAt };
}

/** The installation has one Secure Boot key set; audit events use this subject id. */
const INSTALLATION_SUBJECT_ID = 1;

@Injectable()
export class SecureBootKeyService {
  constructor(
    @Inject(ATTRACTAP_SECURE_BOOT_KEY_STORE) private readonly keys: AttractapSecureBootKeyStore,
    @Inject(UNIT_OF_WORK) private readonly unitOfWork: UnitOfWork,
    private readonly encryption: EncryptionService,
    @Inject(AUDIT_RECORDER) private readonly audit: AuditRecorder,
    @Inject(SECURE_BOOT_KEY_CHANGE_GUARD) private readonly changeGuard: SecureBootKeyChangeGuard,
  ) {}

  private async record(
    actor: AuditActor,
    action: Extract<AttractapAuditAction, `reader.${string}`>,
    details: AuditDetails,
    scope?: TransactionScope,
  ): Promise<void> {
    await this.audit.record(
      {
        domain: 'attractap',
        action: `attractap.${action}`,
        actor,
        subject: { type: 'attractap.installation', id: INSTALLATION_SUBJECT_ID },
        details,
      },
      scope,
    );
  }

  /**
   * Key changes check the current rows, then replace them, with slow key generation in between. Two
   * of them at once (a double press, a second tab) would each pass the check and leave two key pairs
   * behind, so they run one at a time. The swap itself runs in a transaction, so a failure never
   * leaves the installation without its keys.
   */
  private readonly mutex = new Mutex();

  private async latest(role: AttractapSecureBootKeyRole): Promise<AttractapSecureBootKeyRecord | null> {
    return await this.keys.latest(role);
  }

  /** Readers with any digest burned, or with the given one (eFuse reports may spell hex in upper case). */
  private async burnedReaderCount(digest?: string): Promise<number> {
    return await this.keys.countReadersWithBurnedDigest(digest);
  }

  private holdsPrivateKey(row: AttractapSecureBootKeyRecord): boolean {
    try {
      this.privateKeyOf(row);
      return true;
    } catch {
      return false;
    }
  }

  private async isRestoreAllowed(signing: AttractapSecureBootKeyRecord | null): Promise<boolean> {
    return !signing || !this.holdsPrivateKey(signing) || (await this.burnedReaderCount(signing.digest)) === 0;
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
      restoreAllowed: await this.isRestoreAllowed(signing),
    };
  }

  /** Server-side gate for every conversion: keys exist and the recovery check passed. */
  async assertReadyForConversion(): Promise<void> {
    if ((await this.getState()).status !== 'ready') {
      throw new ConflictException('The recovery key check has not passed yet');
    }
  }

  createKeys(actor: AuditActor): Promise<{ signingFingerprint: string; recoveryFingerprint: string }> {
    return this.mutex.runExclusive(() => this.replaceKeys(actor));
  }

  /** A running conversion burns the current digests and streams images signed with the current signing key. */
  private async assertNoConversion(): Promise<void> {
    if (await this.changeGuard.conversionActive()) {
      throw new ConflictException('Keys cannot change while a reader is being secured');
    }
  }

  private async replaceKeys(actor: AuditActor): Promise<{ signingFingerprint: string; recoveryFingerprint: string }> {
    await this.assertNoConversion();
    if ((await this.keys.count()) > 0 && (await this.burnedReaderCount()) > 0) {
      throw new ConflictException('Keys cannot be regenerated while readers have digests burned with them');
    }
    const [signingKey, recoveryKey] = await Promise.all([this.generate(), this.generate()]);
    return await this.unitOfWork.run(async (scope) => {
      await this.keys.remove(scope);
      const signing = await this.store(scope, 'signing', signingKey, null);
      const recovery = await this.store(scope, 'recovery', recoveryKey, null);
      const fingerprints = { signingFingerprint: signing.fingerprint, recoveryFingerprint: recovery.fingerprint };
      await this.record(actor, 'reader.secure_keys_created', fingerprints, scope);
      return fingerprints;
    });
  }

  private async generate(): Promise<KeyObject> {
    const { privateKey } = await generateRsaKeyPair('rsa', { modulusLength: SECURE_BOOT_RSA_KEY_BITS });
    return privateKey;
  }

  private async store(
    scope: TransactionScope,
    role: AttractapSecureBootKeyRole,
    privateKey: KeyObject,
    restoredAt: Date | null,
  ) {
    const publicKey = createPublicKey(privateKey);
    return await this.keys.insert(scope, {
      role,
      publicKeyPem: publicKey.export({ type: 'spki', format: 'pem' }) as string,
      digest: secureBootKeyDigest(publicKey),
      fingerprint: publicKeyFingerprint(publicKey),
      privateKeyEncrypted: this.encryption.encrypt(privateKey.export({ type: 'pkcs8', format: 'pem' }) as string),
      verifiedAt: null,
      restoredAt,
    });
  }

  private privateKeyOf(row: AttractapSecureBootKeyRecord): KeyObject {
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
    if (Buffer.byteLength(passphrase, 'utf8') > MAX_PASSPHRASE_BYTES) {
      throw new BadRequestException(`The passphrase may have at most ${MAX_PASSPHRASE_BYTES} bytes`);
    }
  }

  /** Repeatable until the check passes; afterwards the private key is gone. */
  async downloadRecoveryKey(passphrase: string, actor: AuditActor): Promise<{ pem: string; fingerprint: string }> {
    this.assertPassphrase(passphrase);
    const recovery = await this.latest('recovery');
    if (!recovery) throw new ConflictException('No keys have been created yet');
    if (recovery.verifiedAt || !recovery.privateKeyEncrypted) {
      throw new ConflictException('The recovery key was already verified and is no longer held by the server');
    }
    const pem = this.exportEncrypted(this.privateKeyOf(recovery), passphrase);
    await this.record(actor, 'reader.recovery_key_downloaded', { recoveryFingerprint: recovery.fingerprint });
    return { pem, fingerprint: recovery.fingerprint };
  }

  private importKey(pem: unknown, passphrase: unknown): KeyObject {
    if (typeof pem !== 'string' || typeof passphrase !== 'string' || !pem.trim()) {
      throw new BadRequestException('A key file and its passphrase are required');
    }
    if (!ENCRYPTED_PEM.test(pem)) {
      throw new BadRequestException('The key file must be passphrase-protected, as downloaded from this page');
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
    if (isLabSecureBootKey(key)) {
      throw new BadRequestException('The public device-lab keys cannot be used by an installation');
    }
    return key;
  }

  checkRecoveryKey(pem: string, passphrase: string, actor: AuditActor): Promise<{ fingerprint: string }> {
    return this.mutex.runExclusive(() => this.verifyRecoveryKey(pem, passphrase, actor));
  }

  private async verifyRecoveryKey(
    pem: string,
    passphrase: string,
    actor: AuditActor,
  ): Promise<{ fingerprint: string }> {
    const recovery = await this.latest('recovery');
    if (!recovery) throw new ConflictException('No keys have been created yet');
    if (recovery.verifiedAt) throw new ConflictException('The recovery key was already verified');
    const uploaded = this.importKey(pem, passphrase);
    if (publicKeyFingerprint(uploaded) !== recovery.fingerprint) {
      throw new BadRequestException('This file is not the recovery key of this installation');
    }
    await this.keys.markRecoveryVerified(recovery.id, new Date());
    await this.record(actor, 'reader.recovery_key_verified', { recoveryFingerprint: recovery.fingerprint });
    return { fingerprint: recovery.fingerprint };
  }

  async downloadSigningKeyBackup(passphrase: string, actor: AuditActor): Promise<{ pem: string; fingerprint: string }> {
    this.assertPassphrase(passphrase);
    const signing = await this.latest('signing');
    if (!signing?.privateKeyEncrypted) throw new ConflictException('There is no signing key to back up');
    const pem = this.exportEncrypted(this.privateKeyOf(signing), passphrase);
    await this.record(actor, 'reader.signing_key_backup_downloaded', { signingFingerprint: signing.fingerprint });
    return { pem, fingerprint: signing.fingerprint };
  }

  /**
   * Restore from a signing-key backup or from the recovery file. A recovery file becomes the signing
   * key (the readers' KEY1 matches it) and a fresh recovery key is created that must pass the check.
   */
  restore(
    source: RestoreSource,
    pem: string,
    passphrase: string,
    actor: AuditActor,
  ): Promise<{ signingFingerprint: string; recoveryFingerprint: string }> {
    return this.mutex.runExclusive(() => this.restoreKeys(source, pem, passphrase, actor));
  }

  private async restoreKeys(
    source: RestoreSource,
    pem: string,
    passphrase: string,
    actor: AuditActor,
  ): Promise<{ signingFingerprint: string; recoveryFingerprint: string }> {
    await this.assertNoConversion();
    const current = await this.latest('signing');
    if (!(await this.isRestoreAllowed(current))) {
      throw new ConflictException('Keys cannot be restored while readers are secured with the current signing key');
    }
    const key = this.importKey(pem, passphrase);
    const digest = secureBootKeyDigest(key);
    // Readers rely on the current key, which only AUTH_SESSION_SECRET can no longer open: replace it
    // only with a key those readers trust, so a wrong file cannot drop a key a fixed secret would bring back.
    if (current && (await this.burnedReaderCount(current.digest)) > 0 && !(await this.burnedReaderCount(digest))) {
      throw new ConflictException('Readers are secured with the current signing key; restore a key they trust');
    }
    const existing = await this.keys.findByDigest(digest);
    if (existing?.role === 'signing' && this.holdsPrivateKey(existing)) {
      throw new ConflictException('This key is already the signing key of this installation');
    }
    if (existing?.role === 'recovery' && source === 'signing-backup') {
      throw new ConflictException(
        'This file is the recovery key of this installation; restore it as the recovery file',
      );
    }
    const restoredAt = new Date();
    // The recovery file is the former recovery key: it signs now, and a fresh recovery key must pass the
    // check. A signing backup keeps the current recovery key, or gets a fresh one on an empty installation.
    const latestRecovery = source === 'signing-backup' ? await this.latest('recovery') : null;
    // An unchecked recovery key the server can no longer open could never pass the check: replace it.
    const kept =
      latestRecovery && (latestRecovery.verifiedAt || this.holdsPrivateKey(latestRecovery)) ? latestRecovery : null;
    const recoveryKey = kept ?? (await this.generate());
    return await this.unitOfWork.run(async (scope) => {
      const fresh = recoveryKey instanceof KeyObject;
      await (fresh ? this.keys.remove(scope) : this.keys.remove(scope, 'signing'));
      const signing = await this.store(scope, 'signing', key, restoredAt);
      const recovery = fresh ? await this.store(scope, 'recovery', recoveryKey, restoredAt) : recoveryKey;
      const fingerprints = { signingFingerprint: signing.fingerprint, recoveryFingerprint: recovery.fingerprint };
      await this.record(actor, 'reader.secure_keys_restored', { ...fingerprints, source }, scope);
      return fingerprints;
    });
  }

  /**
   * Just before a burn: the keys are still the ones the conversion was started with (KEY0 = signing, KEY1 = recovery)
   * and the server can still open the signing key, so the reader can be updated after the burn.
   */
  async conversionKeysCurrent(digests: { digest0: string; digest1: string }): Promise<boolean> {
    const [signing, recovery] = await Promise.all([this.latest('signing'), this.latest('recovery')]);
    return (
      !!signing &&
      !!recovery &&
      signing.digest.toLowerCase() === digests.digest0.toLowerCase() &&
      recovery.digest.toLowerCase() === digests.digest1.toLowerCase() &&
      this.holdsPrivateKey(signing)
    );
  }

  /**
   * The key to sign a reader's images with: the one recorded for the reader if the server still holds
   * it, otherwise any held private key whose digest the reader has burned. Null shows as "No signing
   * key for this reader".
   */
  async signingKeyForReader(reader: SecureBootReaderDigests): Promise<KeyObject | null> {
    const digests = [reader.secureBootDigest0, reader.secureBootDigest1]
      .filter((d): d is string => Boolean(d))
      .map((d) => d.toLowerCase());
    if (!digests.length) return null;
    const preferred = reader.secureBootSignerDigest?.toLowerCase();
    const candidates = await this.keys.listWithPrivateKey();
    const burned = candidates.filter((row) => digests.includes(row.digest));
    const match = burned.find((row) => row.digest === preferred) ?? burned[0];
    return match ? this.privateKeyOf(match) : null;
  }
}
