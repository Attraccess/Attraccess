import { publicStatus } from './wago-management.helpers';
import { cleanInspection } from './wago-management.helpers';
import { validateCredential } from './wago-management.helpers';
import { assertManagementKey } from './wago-management-key';
import type { ManagementKey, ManagementPublicStatus, SessionCredential } from './wago-management.types';
import { identifier } from './wago-management.state';
import { LEASE_MS } from './wago-management.state';
import { WagoManagementServiceReviewOperation } from './wago-management.wago-management-service-review-operation';
import { ManagementError } from './wago-management.management-error';
import { exactKeys } from './wago-management.helpers';

export abstract class WagoManagementServiceApplyOperation extends WagoManagementServiceReviewOperation {
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
}
