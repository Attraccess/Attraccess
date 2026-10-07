import { ConflictException } from '@nestjs/common';
import { WagoMqttCredentialRetirement } from './wago-network-change.entity';
import { WagoManagedRuntimeServiceRetireOperation } from './wago-managed-runtime.wago-managed-runtime-service-retire-operation';


export abstract class WagoManagedRuntimeServiceAssertRemovableOperation extends WagoManagedRuntimeServiceRetireOperation {
  async assertRemovable(controllerId: number): Promise<void> {
    await this.assertUpdateSettled(controllerId);
    if (await this.context.getRepository(WagoMqttCredentialRetirement).countBy({ controllerId }))
      throw new ConflictException('Retire previous broker credentials before removing this controller.');
    const access = await this.access.findOne({ where: { controllerId }, order: { sessionId: 'DESC' } });
    if (access && access.state !== 'retired')
      throw new ConflictException('Restore bootstrap SSH and retire managed access before removing this controller');
  }
}
