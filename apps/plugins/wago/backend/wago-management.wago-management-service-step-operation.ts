import type { ManagementRecord } from './wago-management.types';
import type { ManagementState } from './wago-management.types';
import { ManagementOwner } from './wago-management.management-owner';
import { WagoManagementServiceRollbackOperation } from './wago-management.wago-management-service-rollback-operation';


export abstract class WagoManagementServiceStepOperation extends WagoManagementServiceRollbackOperation {
  protected async step(record: ManagementRecord, owner: ManagementOwner, state: ManagementState): Promise<void> {
    if (this.now() + 15000 >= record.transaction!.deadline) throw new Error('deadline');
    record.state = state;
    await this.save(record, owner);
  }
}
