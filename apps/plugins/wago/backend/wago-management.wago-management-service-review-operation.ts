import { ManagementError } from './wago-management.management-error';
import { publicStatus } from './wago-management.helpers';
import type { ManagementException } from './wago-management.types';
import type { ManagementMode } from './wago-management.types';
import type { ManagementPublicStatus } from './wago-management.types';
import { exceptionNames } from './wago-management.state';
import { identifier } from './wago-management.state';
import { WagoManagementServiceInspectOperation } from './wago-management.wago-management-service-inspect-operation';
import { exactKeys } from './wago-management.helpers';


export abstract class WagoManagementServiceReviewOperation extends WagoManagementServiceInspectOperation {
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
}
