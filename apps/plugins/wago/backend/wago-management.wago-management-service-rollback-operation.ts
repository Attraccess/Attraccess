import type { ManagementRecord } from './wago-management.types';
import { publicStatus } from './wago-management.helpers';
import type { ManagementPublicStatus } from './wago-management.types';
import { restoreManagementKey } from './wago-management-key';
import type { SessionCredential } from './wago-management.types';
import { ManagementOwner } from './wago-management.management-owner';
import { WagoManagementServiceVerifyOperation } from './wago-management.wago-management-service-verify-operation';


export abstract class WagoManagementServiceRollbackOperation extends WagoManagementServiceVerifyOperation {
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
}
