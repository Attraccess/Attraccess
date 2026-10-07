import { EntityManager } from 'typeorm';
import { type FinalCollection } from './metering-settlement';
import { ResourceMeteringServiceCollectSessionFinalOperation } from './resource-metering.service.resource-metering-service-collect-session-final-operation';
export abstract class ResourceMeteringServiceSettleInTransactionOperation extends ResourceMeteringServiceCollectSessionFinalOperation {
  /** Runs inside the transaction that ends the usage, before the bill is finalized. Idempotent. */
  settleInTransaction(manager: EntityManager, usageId: number, final: FinalCollection): Promise<void> {
    return this.settlement.settleInTransaction(manager, usageId, final);
  }
}
