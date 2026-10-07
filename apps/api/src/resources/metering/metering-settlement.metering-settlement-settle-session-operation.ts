import { EntityManager, MoreThan } from 'typeorm';
import {
  BillingTransaction,
  ResourceMeteringOperation,
  ResourceMeteringSession,
  ResourceMeteringSessionStatus,
} from '@attraccess/database-entities';
import { meterCharge } from './quantity';
import { MeteringSettlementAddUnavailableItemOperation } from './metering-settlement.metering-settlement-add-unavailable-item-operation';
import { MeterFinal } from './metering-settlement';

export abstract class MeteringSettlementSettleSessionOperation extends MeteringSettlementAddUnavailableItemOperation {
  protected async settleSession(
    manager: EntityManager,
    session: ResourceMeteringSession,
    final: MeterFinal,
  ): Promise<void> {
    const usageId = session.usageId;
    const operation =
      final.status === 'ready'
        ? await manager.findOne(ResourceMeteringOperation, {
            where: { id: final.operationId, sessionId: session.id, kind: 'final', status: 'completed' },
          })
        : null;
    if (!operation) {
      await this.addUnavailableItem(
        manager,
        usageId,
        session.meterName,
        session.creditsPerUnit,
        `metering:${session.id}:unavailable`,
      );
      const superseded = await manager.count(ResourceMeteringSession, {
        where: { resourceId: session.resourceId, meterId: session.meterId, usageId: MoreThan(usageId) },
      });
      const unrecoverable = superseded > 0 || !!session.compromisedReason;
      await manager.update(ResourceMeteringSession, session.id, {
        status: unrecoverable ? ResourceMeteringSessionStatus.Failed : ResourceMeteringSessionStatus.Pending,
        failureReason: superseded
          ? 'The meter was re-initialized for a later session before the final reading was collected'
          : session.compromisedReason
            ? session.compromisedReason
            : final.status === 'unavailable'
              ? final.reason
              : 'No final reading was collected',
      });
      return;
    }
    const transaction = await manager.findOneOrFail(BillingTransaction, { where: { resourceUsageId: usageId } });
    await this.addMeterItem(manager, transaction, session, operation);
    await manager.update(ResourceMeteringSession, session.id, {
      status: ResourceMeteringSessionStatus.Settled,
      consumedValue: operation.totalValue,
      chargeCredits: meterCharge(BigInt(operation.totalValue as string), session.creditsPerUnit),
      finalOperationId: operation.id,
      failureReason: null,
      settledAt: new Date(),
    });
  }
}
