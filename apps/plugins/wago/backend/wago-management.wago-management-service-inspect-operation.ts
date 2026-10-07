import type { ManagementRecord } from './wago-management.types';
import type { SessionCredential } from './wago-management.types';
import { publicStatus } from './wago-management.helpers';
import { cleanInspection } from './wago-management.helpers';
import { validateTarget } from './wago-management.helpers';
import { validateCredential } from './wago-management.helpers';
import type { ManagementPublicStatus } from './wago-management.types';
import type { ManagementTarget } from './wago-management.types';
import { WagoManagementServiceStatusOperation } from './wago-management.wago-management-service-status-operation';
import { ManagementError } from './wago-management.management-error';


export abstract class WagoManagementServiceInspectOperation extends WagoManagementServiceStatusOperation {
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
}
