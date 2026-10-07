import { ManagementOwner } from './wago-management.management-owner';
import { validId } from './wago-management.helpers';
import { identifier } from './wago-management.state';
import { LEASE_MS } from './wago-management.state';
import { WagoManagementServiceRequiredOperation } from './wago-management.wago-management-service-required-operation';
import { ManagementError } from './wago-management.management-error';


export abstract class WagoManagementServiceLockedOperation extends WagoManagementServiceRequiredOperation {
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
}
