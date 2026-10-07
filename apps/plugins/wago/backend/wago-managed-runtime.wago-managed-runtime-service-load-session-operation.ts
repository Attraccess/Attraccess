import { WagoManagedAccess } from './wago-managed-access.entity';
import { WagoManagedRuntimeServiceDesiredOperation } from './wago-managed-runtime.wago-managed-runtime-service-desired-operation';


export abstract class WagoManagedRuntimeServiceLoadSessionOperation extends WagoManagedRuntimeServiceDesiredOperation {
  protected loadSession(sessionId: number): Promise<WagoManagedAccess | null> {
    return this.access
      .createQueryBuilder('access')
      .addSelect('access.encryptedCredentials')
      .where('access.sessionId = :sessionId', { sessionId })
      .getOne();
  }
}
