import { EntityManager } from 'typeorm';
import { ResourceMeteringSession } from '@attraccess/database-entities';
import { ResourceMeteringServiceSettleInTransactionOperation } from './resource-metering.service.resource-metering-service-settle-in-transaction-operation';
export abstract class ResourceMeteringServiceDiscardCandidateOperation extends ResourceMeteringServiceSettleInTransactionOperation {
  /** Removes the metering of a tentative usage that is being rolled back. */
  async discardCandidate(manager: EntityManager, usageId: number): Promise<void> {
    await manager.delete(ResourceMeteringSession, { usageId });
  }
}
