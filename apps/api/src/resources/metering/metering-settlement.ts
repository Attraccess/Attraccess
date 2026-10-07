import {
  BillingTransaction,
  BillingTransactionItem,
  ResourceFlowNodeType,
  ResourceMeteringOperation,
  ResourceMeteringSession,
  ResourceMeteringSessionStatus,
  ResourceUsage,
} from '@attraccess/database-entities';
import { BadRequestException, ConflictException } from '@nestjs/common';
import { EntityManager, MoreThan } from 'typeorm';
import { energyCharge } from './energy';
import { MeteringDefinitionImplementation } from './metering-definition';
import { FinalCollection, MeteringOperationError } from './resource-metering.service.route-context';
export abstract class MeteringSettlementImplementation extends MeteringDefinitionImplementation {
  // ---- meter definition -------------------------------------------------------------------------
  // ---- lifecycle --------------------------------------------------------------------------------

  /** Never throws: a missing final total must not prevent the usage from ending. */
  async collectFinal(usageId: number, freshAfter: Date): Promise<FinalCollection> {
    const session = await this.sessions.findOne({ where: { usageId } });
    if (!session || session.status !== ResourceMeteringSessionStatus.Active) return { status: 'not-metered' };
    if (session.compromisedReason) return { status: 'unavailable', reason: session.compromisedReason };
    const { collect } = await this.getDefinition(session.resourceId);
    let reason = 'No attempt was made';
    for (let attempt = 1; attempt <= collect.finalAttempts; attempt++) {
      try {
        const operation = await this.runOperation(session, 'final', {
          trigger: ResourceFlowNodeType.INPUT_METERING_COLLECT,
          timeoutSeconds: collect.timeoutSeconds,
          freshAfter,
        });
        return { status: 'ready', operationId: operation.id };
      } catch (error) {
        reason = this.reason(error);
        this.logger.warn(
          `Final metering collection ${attempt}/${collect.finalAttempts} for usage ${usageId} failed: ${reason}`,
        );
        if (attempt < collect.finalAttempts && collect.finalRetryDelaySeconds > 0) {
          await new Promise((resolve) => setTimeout(resolve, collect.finalRetryDelaySeconds * 1000));
        }
      }
    }
    return { status: 'unavailable', reason };
  }

  /** Runs inside the transaction that ends the usage, before the bill is finalized. Idempotent. */
  async settleInTransaction(manager: EntityManager, usageId: number, final: FinalCollection): Promise<void> {
    const session = await manager.findOne(ResourceMeteringSession, { where: { usageId } });
    if (!session || session.status !== ResourceMeteringSessionStatus.Active) return;
    const operation =
      final.status === 'ready'
        ? await manager.findOne(ResourceMeteringOperation, {
            where: { id: final.operationId, sessionId: session.id, kind: 'final', status: 'completed' },
          })
        : null;
    if (!operation) {
      const superseded = await manager.count(ResourceMeteringSession, {
        where: { resourceId: session.resourceId, usageId: MoreThan(usageId) },
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
    await this.addEnergyItem(manager, transaction, session, operation);
    await manager.update(ResourceMeteringSession, session.id, {
      status: ResourceMeteringSessionStatus.Settled,
      consumedMicroWh: operation.totalMicroWh,
      chargeCredits: energyCharge(BigInt(operation.totalMicroWh as string), session.creditsPerKwh),
      finalOperationId: operation.id,
      failureReason: null,
      settledAt: new Date(),
    });
  }

  protected async addEnergyItem(
    manager: EntityManager,
    transaction: BillingTransaction,
    session: ResourceMeteringSession,
    operation: ResourceMeteringOperation,
  ): Promise<number> {
    const externalReference = `metering:${session.id}:${operation.id}`;
    const charge = energyCharge(BigInt(operation.totalMicroWh as string), session.creditsPerKwh);
    if (
      await manager.findOne(BillingTransactionItem, {
        where: { billingTransactionId: transaction.id, externalReference },
      })
    ) {
      return charge;
    }
    await manager.save(BillingTransactionItem, {
      billingTransactionId: transaction.id,
      name: 'ENERGY',
      description: null,
      externalReference,
      unitPrice: charge,
      quantity: 1,
      energyMicroWh: operation.totalMicroWh,
      energyCreditsPerKwh: session.creditsPerKwh,
    });
    return charge;
  }

  /** Removes the metering of a tentative usage that is being rolled back. */
  async discardCandidate(manager: EntityManager, usageId: number): Promise<void> {
    await manager.delete(ResourceMeteringSession, { usageId });
  }

  // ---- reconciliation ---------------------------------------------------------------------------

  /** Retries the final collection of a usage that already ended and bills the energy as a separate correction. */
  async retrySettlement(resourceId: number, sessionId: string, initiatorId: number): Promise<ResourceMeteringSession> {
    const session = await this.sessions.findOne({ where: { id: sessionId, resourceId } });
    if (!session) throw new BadRequestException('METER_SESSION_NOT_FOUND');
    if (session.status !== ResourceMeteringSessionStatus.Pending) {
      throw new ConflictException('METER_SESSION_NOT_PENDING');
    }
    const usage = await this.sessions.manager.findOneOrFail(ResourceUsage, { where: { id: session.usageId } });
    if (!usage.endTime) throw new ConflictException('METER_SESSION_NOT_PENDING');
    const { collect } = await this.getDefinition(resourceId);
    try {
      await this.assertMeterStillOwned(session);
      const operation = await this.runOperation(session, 'final', {
        trigger: ResourceFlowNodeType.INPUT_METERING_COLLECT,
        timeoutSeconds: collect.timeoutSeconds,
        freshAfter: usage.endTime,
      });
      await this.settleLate(session.id, operation.id, initiatorId);
    } catch (error) {
      const reason = this.reason(error);
      await this.sessions.update({ id: session.id }, { failureReason: reason });
      throw new BadRequestException(`METER_SETTLEMENT_FAILED: ${reason}`);
    }
    return this.sessions.findOneByOrFail({ id: session.id });
  }

  protected async assertMeterStillOwned(session: ResourceMeteringSession): Promise<void> {
    if (session.compromisedReason) throw new MeteringOperationError(session.compromisedReason);
    const newer = await this.sessions.count({
      where: { resourceId: session.resourceId, usageId: MoreThan(session.usageId) },
    });
    if (newer > 0) throw new MeteringOperationError('A later session already uses the meter');
  }
}
