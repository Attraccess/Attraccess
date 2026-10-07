import type { SessionCredential } from './wago-management.types';
import { publicStatus } from './wago-management.helpers';
import { validateCredential } from './wago-management.helpers';
import type { ManagementPublicStatus } from './wago-management.types';
import { exactKeys } from './wago-management.helpers';
import { ManagementError } from './wago-management.management-error';
import { WagoManagementServiceEnforceBaselineOperation } from './wago-management.wago-management-service-enforce-baseline-operation';


export abstract class WagoManagementServiceRecoverOperation extends WagoManagementServiceEnforceBaselineOperation {
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
}
