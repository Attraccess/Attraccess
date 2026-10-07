import { ConflictException } from '@nestjs/common';
import { WagoManagedRuntimeServiceRetryAccessOperation } from './wago-managed-runtime.wago-managed-runtime-service-retry-access-operation';


export abstract class WagoManagedRuntimeServiceSetActiveStateOperation extends WagoManagedRuntimeServiceRetryAccessOperation {
  protected async setActiveState(
    sessionId: number,
    state: 'verified' | 'managed' | 'recovery_required',
  ): Promise<void> {
    const result = await this.access
      .createQueryBuilder()
      .update()
      .set({ state })
      .where('session_id = :sessionId AND state NOT IN (:...retired)', {
        sessionId,
        retired: ['retiring', 'retired'],
      })
      .execute();
    if (result.affected !== 1) throw new ConflictException('Managed access is being retired');
  }
}
