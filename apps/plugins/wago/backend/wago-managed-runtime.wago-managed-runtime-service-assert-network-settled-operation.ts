import { ConflictException } from '@nestjs/common';
import { WagoNetworkChange } from './wago-network-change.entity';
import { WagoManagedRuntimeServiceAssertUpdateSettledOperation } from './wago-managed-runtime.wago-managed-runtime-service-assert-update-settled-operation';


export abstract class WagoManagedRuntimeServiceAssertNetworkSettledOperation extends WagoManagedRuntimeServiceAssertUpdateSettledOperation {
  async assertNetworkSettled(controllerId: number | null, fingerprint?: string): Promise<void> {
    if (controllerId === null && !fingerprint) return;
    const change = await this.context
      .getRepository(WagoNetworkChange)
      .findOneBy(controllerId === null ? { fingerprint } : { controllerId });
    if (change && change.phase !== 'completed')
      throw new ConflictException('Finish the pending MQTT/address change before another controller operation.');
  }
}
