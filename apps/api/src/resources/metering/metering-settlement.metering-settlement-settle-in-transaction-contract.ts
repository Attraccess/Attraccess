import { EntityManager } from 'typeorm';
import { BillingTransaction, ResourceMeteringOperation, ResourceMeteringSession } from '@attraccess/database-entities';
import { FinalCollection } from './metering-settlement';
import { MeterFinal } from './metering-settlement';

export abstract class MeteringSettlementSettleInTransactionContract {
  abstract settleInTransaction(manager: EntityManager, usageId: number, final: FinalCollection): Promise<void>;
  protected abstract addUnavailableItem(
    manager: EntityManager,
    usageId: number,
    name: string,
    creditsPerUnit: number,
    externalReference: string,
  ): Promise<void>;
  protected abstract settleSession(
    manager: EntityManager,
    session: ResourceMeteringSession,
    final: MeterFinal,
  ): Promise<void>;
  protected abstract addMeterItem(
    manager: EntityManager,
    transaction: BillingTransaction,
    session: ResourceMeteringSession,
    operation: ResourceMeteringOperation,
  ): Promise<number>;
  abstract settleLate(sessionId: string, operationId: string, initiatorId: number): Promise<void>;
  abstract waive(resourceId: number, sessionId: string, initiatorId: number): Promise<ResourceMeteringSession>;
}
