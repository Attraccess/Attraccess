import type { ManagementRecord } from './wago-management.types';
import { ManagementOwner } from './wago-management.management-owner';
import { WagoManagementServiceStepOperation } from './wago-management.wago-management-service-step-operation';


export abstract class WagoManagementServiceSaveOperation extends WagoManagementServiceStepOperation {
  protected async save(record: ManagementRecord, owner: ManagementOwner) {
    await owner.assertOwned();
    await this.store.save(record.target.controllerId, owner.id, record, this.now());
    await owner.assertOwned();
  }
}
