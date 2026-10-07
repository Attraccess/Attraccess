import { publicStatus } from './wago-management.helpers';
import { validId } from './wago-management.helpers';
import type { ManagementPublicStatus } from './wago-management.types';
import { WagoManagementServiceState } from './wago-management.wago-management-service-state';
import { ManagementError } from './wago-management.management-error';


export abstract class WagoManagementServiceStatusOperation extends WagoManagementServiceState {
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
