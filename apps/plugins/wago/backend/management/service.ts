import { type PluginSecretsContext } from '@attraccess/plugins-backend-sdk';

import { generateManagementKey, restoreManagementKey, assertManagementKey } from './key';

import {
  type ManagementAdapter,
  type ManagementKey,
  type ManagementStore,
  type ManagementRecord,
  type ManagementState,
  type ManagementPublicStatus,
  type SessionCredential,
  type ManagementException,
  type ManagementMode,
  type ManagementTarget,
} from './model';

import { ManagementOwner } from './model';

import { validId, publicStatus, validateCredential, exactKeys, cleanInspection, validateTarget } from './model';

import { identifier, LEASE_MS, exceptionNames } from './model';

import { ManagementError } from './model';

export { ManagementError } from './model';

export class WagoManagementService {
  public constructor(
    protected readonly store: ManagementStore,
    protected readonly secrets: PluginSecretsContext,
    protected readonly adapter: ManagementAdapter,
    protected readonly now = Date.now,
    protected readonly createKey: () => ManagementKey = generateManagementKey,
  ) {}

  protected async locked<T>(
    controllerId: number,
    action: (owner: ManagementOwner) => Promise<T>,
    assertOwned: () => Promise<void> = async () => undefined,
  ): Promise<T> {
    validId(controllerId);
    const owner = identifier();
    let acquired = false;
    try {
      await assertOwned();
      acquired = await this.store.acquire(controllerId, owner, this.now(), this.now() + LEASE_MS);
      if (!acquired) throw new ManagementError('busy');
      await assertOwned();
      return await action({ id: owner, assertOwned });
    } catch (error) {
      if (error instanceof ManagementError) throw error;
      throw new ManagementError('operation_failed');
    } finally {
      if (acquired) await this.store.release(controllerId, owner).catch(() => undefined);
    }
  }

  protected async required(controllerId: number): Promise<ManagementRecord> {
    const record = await this.store.load(controllerId);
    if (!record) throw new ManagementError('inspect_required');
    return record;
  }

  protected async save(record: ManagementRecord, owner: ManagementOwner) {
    await owner.assertOwned();
    await this.store.save(record.target.controllerId, owner.id, record, this.now());
    await owner.assertOwned();
  }

  protected async step(record: ManagementRecord, owner: ManagementOwner, state: ManagementState): Promise<void> {
    if (this.now() + 15000 >= record.transaction!.deadline) throw new Error('deadline');
    record.state = state;
    await this.save(record, owner);
  }

  protected async rollback(
    record: ManagementRecord,
    owner: ManagementOwner,
    credential: SessionCredential,
    failure: ManagementRecord['failure'],
  ): Promise<ManagementPublicStatus> {
    record.state = 'recovering';
    record.failure = failure;
    let retainedKey: string | undefined;
    try {
      await this.save(record, owner);
      if (record.encryptedPrivateKey) {
        // A committed baseline may no longer accept passwords. The trusted adapter can restore
        // access with the retained generated key after restart; it never leaves this server seam.
        // If the envelope is unavailable, fresh session credentials may still permit recovery.
        try {
          retainedKey = restoreManagementKey(
            this.secrets.decrypt(record.encryptedPrivateKey),
            record.keyFingerprint ?? '',
          ).privateKey;
        } catch {
          retainedKey = undefined;
        }
      }
      await this.adapter.rollback(record.transaction!, credential, retainedKey);
      const recovered: ManagementRecord = {
        ...record,
        state: 'recovered',
        transaction: null,
        encryptedPrivateKey: null,
        keyFingerprint: null,
        reviewToken: null,
        support: 'qualification_required',
      };
      await this.save(recovered, owner);
      return publicStatus(recovered);
    } catch {
      record.state = 'recovery_required';
      record.failure = 'rollback_failed';
      await this.save(record, owner);
    } finally {
      retainedKey = undefined;
    }
    return publicStatus(record);
  }

  protected async verify(record: ManagementRecord, privateKey: string): Promise<void> {
    const nonce = identifier(),
      tx = record.transaction!;
    const proof = await this.adapter.verifyKey(tx, privateKey, nonce);
    if (
      proof.nonce !== nonce ||
      !proof.keyOnly ||
      proof.hostKeyFingerprint !== tx.target.hostKeyFingerprint ||
      proof.keyFingerprint !== record.keyFingerprint ||
      !Number.isSafeInteger(proof.uid) ||
      proof.uid <= 0 ||
      proof.uid !== record.inspection!.uid ||
      !proof.managementOperationSucceeded
    )
      throw new Error('verification_failed');
  }

  async recover(
    controllerId: number,
    input: { confirm: true; temporarySsh: SessionCredential },
    assertOwned?: () => Promise<void>,
  ): Promise<ManagementPublicStatus> {
    exactKeys(input, ['confirm', 'temporarySsh']);
    if (input.confirm !== true) throw new ManagementError('invalid_request');
    validateCredential(input.temporarySsh);
    return this.locked(
      controllerId,
      async (owner) => {
        const record = await this.required(controllerId);
        if (record.state === 'recovered') return publicStatus(record);
        if (!record.transaction) throw new ManagementError('invalid_request');
        if (input.temporarySsh.username !== record.transaction.username)
          throw new ManagementError('credentials_required');
        return this.rollback(record, owner, input.temporarySsh, null);
      },
      assertOwned,
    );
  }

  protected async enforceBaseline(
    record: ManagementRecord,
    owner: ManagementOwner,
    credential: SessionCredential,
    privateKey: string,
  ): Promise<void> {
    const tx = record.transaction!;
    await this.step(record, owner, 'restricting_access');
    await this.adapter.restrictAccess(tx, credential, privateKey);
    await this.step(record, owner, 'verifying_baseline');
    // Verify a THIRD fresh key connection after changing policy/reloading the service.
    await this.verify(record, privateKey);
    const result = await this.adapter.verifyBaseline(tx, privateKey);
    if (
      !result.passwordDisabled ||
      !result.defaultAccessDisabled ||
      !result.minimumPrivileges ||
      (!result.wbmSecure && !record.exceptions.includes('wbm_exposed')) ||
      (!result.otherManagementSecure && !record.exceptions.includes('other_services_exposed'))
    )
      throw new Error();
  }

  async apply(
    controllerId: number,
    input: { reviewToken: string; confirm: true; temporarySsh: SessionCredential },
    assertOwned?: () => Promise<void>,
  ): Promise<ManagementPublicStatus> {
    exactKeys(input, ['reviewToken', 'confirm', 'temporarySsh']);
    if (input.confirm !== true || typeof input.reviewToken !== 'string' || !/^[a-f0-9]{32}$/.test(input.reviewToken))
      throw new ManagementError('invalid_request');
    validateCredential(input.temporarySsh);
    return this.locked(
      controllerId,
      async (owner) => {
        const record = await this.required(controllerId);
        if (record.transaction) throw new ManagementError('recovery_required');
        if (
          record.state !== 'reviewed' ||
          record.reviewToken !== input.reviewToken ||
          record.reviewedAt === null ||
          this.now() - record.reviewedAt > LEASE_MS ||
          this.now() < record.reviewedAt ||
          !record.mode ||
          !record.inspection
        )
          throw new ManagementError('review_required');
        const qualification = this.adapter.qualify(record.inspection, record.mode);
        if (qualification.support !== 'supported') throw new ManagementError(qualification.support);
        if (record.mode === 'baseline' && (!qualification.minimumPrivileges || !qualification.rebootSafeWatchdog))
          throw new ManagementError('qualification_required');
        const fresh = cleanInspection(await this.adapter.inspect(record.target, input.temporarySsh));
        if (JSON.stringify(fresh) !== JSON.stringify(record.inspection)) throw new ManagementError('inspect_required');
        let key: ManagementKey | undefined;
        try {
          key = this.createKey();
          assertManagementKey(key);
          record.encryptedPrivateKey = this.secrets.encrypt(key.privateKey);
          if (!record.encryptedPrivateKey || record.encryptedPrivateKey === key.privateKey) throw new Error();
          // Verify the encrypted envelope before any remote mutation; storage holds ciphertext only.
          if (this.secrets.decrypt(record.encryptedPrivateKey) !== key.privateKey) throw new Error();
          record.keyFingerprint = key.fingerprint;
          record.transaction = {
            id: identifier(),
            target: record.target,
            username: input.temporarySsh.username,
            deadline: this.now() + 150000,
          };
          record.reviewToken = null;
          record.state = 'preparing';
          record.failure = null;
          await this.save(record, owner); // durable intent and encrypted key BEFORE preparing remote state
          const tx = record.transaction;
          await this.adapter.prepare(tx, input.temporarySsh);
          const watchdog = await this.adapter.armWatchdog(tx, input.temporarySsh);
          if (!watchdog.armed || (record.mode === 'baseline' && !watchdog.rebootSafe)) throw new Error();
          await this.step(record, owner, 'installing_key');
          await this.adapter.installKey(tx, input.temporarySsh, key.publicKey);
          await this.step(record, owner, 'verifying_key');
          await this.verify(record, key.privateKey);
          if (record.mode === 'baseline') await this.enforceBaseline(record, owner, input.temporarySsh, key.privateKey);
          await this.step(record, owner, 'committing');
          await this.adapter.commit(tx, input.temporarySsh, key.privateKey);
          record.state = record.mode === 'baseline' && record.exceptions.length === 0 ? 'hardened' : 'key_enrolled';
          if (record.state !== 'hardened') record.support = 'qualification_required';
          await this.save(record, owner);
          return publicStatus(record);
        } catch {
          // No raw transport/crypto/database errors, stdout or credentials are persisted or returned.
          if (!record.transaction) throw new ManagementError('operation_failed');
          return this.rollback(record, owner, input.temporarySsh, 'transition_failed');
        } finally {
          if (key) key.privateKey = '';
        }
      },
      assertOwned,
    );
  }

  async review(
    controllerId: number,
    input: { mode: ManagementMode; exceptions: ManagementException[] },
    assertOwned?: () => Promise<void>,
  ): Promise<ManagementPublicStatus> {
    exactKeys(input, ['mode', 'exceptions']);
    if (
      !['key_only', 'baseline'].includes(input.mode) ||
      !Array.isArray(input.exceptions) ||
      input.exceptions.length > 3 ||
      input.exceptions.some((value) => !exceptionNames.includes(value))
    )
      throw new ManagementError('invalid_request');
    return this.locked(
      controllerId,
      async (owner) => {
        const record = await this.required(controllerId);
        if (record.transaction) throw new ManagementError('recovery_required');
        if (!record.inspection || !['inspected', 'reviewed'].includes(record.state))
          throw new ManagementError('inspect_required');
        record.mode = input.mode;
        record.exceptions = [...new Set(input.exceptions)].sort();
        record.support = this.adapter.qualify(record.inspection, input.mode).support;
        // These acknowledgements disclose residuals; they NEVER confer qualification.
        if (
          input.mode === 'key_only' &&
          (!record.exceptions.includes('unqualified_privileges') ||
            (record.inspection.wbm !== 'not_observed' && !record.exceptions.includes('wbm_exposed')) ||
            (record.inspection.otherManagement !== 'not_observed' &&
              !record.exceptions.includes('other_services_exposed')))
        )
          throw new ManagementError('invalid_request');
        record.reviewToken = identifier();
        record.reviewedAt = this.now();
        record.state = 'reviewed';
        await this.save(record, owner);
        return publicStatus(record);
      },
      assertOwned,
    );
  }

  async inspect(
    target: ManagementTarget,
    credential: SessionCredential,
    assertOwned?: () => Promise<void>,
  ): Promise<ManagementPublicStatus> {
    validateTarget(target);
    validateCredential(credential);
    return this.locked(
      target.controllerId,
      async (owner) => {
        const previous = await this.store.load(target.controllerId);
        if (previous?.transaction) throw new ManagementError('recovery_required');
        const inspection = cleanInspection(await this.adapter.inspect(target, credential));
        const record: ManagementRecord = {
          target: {
            controllerId: target.controllerId,
            host: target.host,
            hostKeyFingerprint: target.hostKeyFingerprint,
          },
          state: 'inspected',
          inspection,
          mode: null,
          exceptions: [],
          support: this.adapter.qualify(inspection, 'baseline').support,
          reviewToken: null,
          reviewedAt: null,
          transaction: null,
          keyFingerprint: null,
          encryptedPrivateKey: null,
          failure: null,
        };
        await this.save(record, owner);
        return publicStatus(record);
      },
      assertOwned,
    );
  }

  async status(controllerId: number): Promise<ManagementPublicStatus | null> {
    validId(controllerId);
    try {
      const record = await this.store.load(controllerId);
      return record ? publicStatus(record) : null;
    } catch {
      throw new ManagementError('operation_failed');
    }
  }
}
