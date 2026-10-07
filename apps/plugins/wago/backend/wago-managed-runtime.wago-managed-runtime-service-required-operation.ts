import { WagoManagedAccess } from './wago-managed-access.entity';
import { RuntimeUpdateError } from './wago-runtime-update';
import { WagoManagedRuntimeServiceLoadSessionOperation } from './wago-managed-runtime.wago-managed-runtime-service-load-session-operation';


export abstract class WagoManagedRuntimeServiceRequiredOperation extends WagoManagedRuntimeServiceLoadSessionOperation {
  protected async required(controllerId: number): Promise<WagoManagedAccess> {
    const row = await this.access
      .createQueryBuilder('access')
      .addSelect('access.encryptedCredentials')
      .where('access.controllerId = :controllerId AND access.state = :state', { controllerId, state: 'managed' })
      .orderBy('access.sessionId', 'DESC')
      .getOne();
    if (!row) throw new RuntimeUpdateError('management_required');
    return row;
  }
}
