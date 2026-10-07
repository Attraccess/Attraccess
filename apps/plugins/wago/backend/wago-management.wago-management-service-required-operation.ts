import type { ManagementRecord } from './wago-management.types';
import { ManagementError } from './wago-management.management-error';
import { WagoManagementServiceSaveOperation } from './wago-management.wago-management-service-save-operation';


export abstract class WagoManagementServiceRequiredOperation extends WagoManagementServiceSaveOperation {
  protected async required(controllerId: number): Promise<ManagementRecord> {
    const record = await this.store.load(controllerId);
    if (!record) throw new ManagementError('inspect_required');
    return record;
  }
}
