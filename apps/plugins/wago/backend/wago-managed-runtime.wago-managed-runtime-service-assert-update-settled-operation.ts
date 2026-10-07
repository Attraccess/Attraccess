import { ConflictException } from '@nestjs/common';
import type { RuntimeUpdateRecord } from './wago-runtime-update';
import { WagoManagedRuntimeServiceAssertRemovableOperation } from './wago-managed-runtime.wago-managed-runtime-service-assert-removable-operation';


export abstract class WagoManagedRuntimeServiceAssertUpdateSettledOperation extends WagoManagedRuntimeServiceAssertRemovableOperation {
  protected async assertUpdateSettled(controllerId: number): Promise<void> {
    await this.assertNetworkSettled(controllerId);
    const row = await this.updates.findOneBy({ controllerId });
    const update = row?.metadata ? (JSON.parse(row.metadata) as RuntimeUpdateRecord) : null;
    if (update?.token) throw new ConflictException('Finish runtime update recovery before removing this controller');
  }
}
