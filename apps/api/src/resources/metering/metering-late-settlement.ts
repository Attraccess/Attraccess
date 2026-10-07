import {
  BillingTransaction,
  BillingTransactionItem,
  BillingTransactionStatus,
  ResourceMeteringOperation,
  ResourceMeteringSession,
  ResourceMeteringSessionStatus,
  ResourceUsage,
} from '@attraccess/database-entities';
import { ConflictException } from '@nestjs/common';
import { In } from 'typeorm';
import { runSerializedTransaction } from '../../database/run-serialized-transaction';
import type { MeteringReport } from '../flows/node-executors';
import { energyCharge, MeteringValueError, toMicroWh } from './energy';
import { MeteringSettlementImplementation } from './metering-settlement';
import { CLOCK_SKEW_MS, INTERIM_MAX_AGE_MS, MeteringOperationError } from './resource-metering.service.route-context';
export abstract class MeteringLateSettlementImplementation extends MeteringSettlementImplementation {
  // ---- meter definition -------------------------------------------------------------------------
  // ---- lifecycle --------------------------------------------------------------------------------
  // ---- reconciliation ---------------------------------------------------------------------------

  /** The usage's bill is completed and immutable: the energy goes onto a new correction transaction. */
  protected async settleLate(sessionId: string, operationId: string, initiatorId: number): Promise<void> {
    const correction = await runSerializedTransaction(this.sessions.manager, async (manager) => {
      const session = await manager.findOneOrFail(ResourceMeteringSession, { where: { id: sessionId } });
      if (session.status !== ResourceMeteringSessionStatus.Pending) return null;
      const operation = await manager.findOneOrFail(ResourceMeteringOperation, { where: { id: operationId } });
      const usage = await manager.findOneOrFail(ResourceUsage, { where: { id: session.usageId }, relations: ['user'] });
      const original = await manager.findOneOrFail(BillingTransaction, {
        where: { resourceUsageId: usage.id, status: BillingTransactionStatus.Completed },
      });
      const charge = energyCharge(BigInt(operation.totalMicroWh as string), session.creditsPerKwh);
      const factor = usage.billingFactor ?? usage.user.billingFactor;
      const discount = Math.round(charge - charge * (factor / 100));
      const correction = await manager.save(BillingTransaction, {
        userId: original.userId,
        initiatorId,
        correctionOfId: original.id,
        amount: -(charge - discount),
        status: BillingTransactionStatus.Completed,
      });
      await this.addEnergyItem(manager, correction, session, operation);
      if (discount !== 0) {
        await manager.save(BillingTransactionItem, {
          billingTransactionId: correction.id,
          name: 'BILLING_FACTOR',
          description: `${factor}%`,
          externalReference: `metering:${session.id}:${operation.id}:discount`,
          unitPrice: -discount,
          quantity: 1,
        });
      }
      await manager.update(ResourceMeteringSession, session.id, {
        status: ResourceMeteringSessionStatus.Settled,
        consumedMicroWh: operation.totalMicroWh,
        chargeCredits: charge,
        finalOperationId: operation.id,
        failureReason: null,
        settledAt: new Date(),
      });
      void this.audit.recordBillingTransactionAfterCommit(
        {
          transactionId: correction.id,
          userId: correction.userId,
          initiatorId,
          amount: correction.amount,
          status: correction.status,
          source: 'energy-correction',
        },
        manager,
      );
      return correction;
    });
    if (correction) {
      this.liveNotifications
        .notifyTransactionUpdate(correction.id)
        .catch((error) => this.logger.warn(`Failed to publish energy correction ${correction.id}`, error));
    }
  }

  async waive(resourceId: number, sessionId: string, initiatorId: number): Promise<ResourceMeteringSession> {
    const result = await this.sessions.update(
      {
        id: sessionId,
        resourceId,
        status: In([ResourceMeteringSessionStatus.Pending, ResourceMeteringSessionStatus.Failed]),
      },
      { status: ResourceMeteringSessionStatus.Waived, settledAt: new Date() },
    );
    if (!result.affected) throw new ConflictException('METER_SESSION_NOT_PENDING');
    const session = await this.sessions.findOneByOrFail({ id: sessionId });
    void this.audit.recordResource({
      action: 'energy_charge.waived',
      actorId: initiatorId,
      subjectId: resourceId,
      details: {
        usageId: session.usageId,
        ...(session.latestMicroWh === null
          ? {}
          : { waivedCredits: energyCharge(BigInt(session.latestMicroWh), session.creditsPerKwh) }),
      },
    });
    return session;
  }

  /** The single reply channel of an operation; wrong-session, late and conflicting replies are rejected. */
  protected async complete(operationId: string, report: MeteringReport): Promise<void> {
    await runSerializedTransaction(this.sessions.manager, async (manager) => {
      const operation = await manager.findOne(ResourceMeteringOperation, { where: { id: operationId } });
      if (!operation) throw new MeteringOperationError('Unknown metering operation');
      const session = await manager.findOneOrFail(ResourceMeteringSession, { where: { id: operation.sessionId } });
      if (session.resourceId !== operation.resourceId) {
        throw new MeteringOperationError('Reply belongs to another session');
      }
      if ((operation.kind === 'start') !== (report.kind === 'ready')) {
        throw new MeteringOperationError(`A ${report.kind} reply does not answer a ${operation.kind} request`);
      }
      const now = new Date();

      if (report.kind === 'ready') {
        const baseline = report.baseline ? toMicroWh(report.baseline.value, report.baseline.unit).toString() : null;
        if (operation.status !== 'pending') {
          if (operation.status === 'completed' && (session.baselineMicroWh ?? null) === baseline) return;
          throw new MeteringOperationError('The start request was already answered or has expired');
        }
        await manager.update(ResourceMeteringSession, session.id, {
          baselineMicroWh: baseline,
          source: report.source ?? session.source,
        });
        await manager.update(ResourceMeteringOperation, operation.id, {
          status: 'completed',
          completedAt: now,
          source: report.source ?? null,
        });
        return;
      }

      const reading = toMicroWh(report.value, report.unit);
      const total = reading - BigInt(session.baselineMicroWh ?? 0);
      if (total < BigInt(0)) {
        throw new MeteringValueError('counter_decreased', 'The counter is below the baseline captured at the start');
      }
      const observedAt = report.observedAt ? new Date(report.observedAt) : now;
      if (Number.isNaN(observedAt.getTime()) || observedAt.getTime() > now.getTime() + CLOCK_SKEW_MS) {
        throw new MeteringValueError('invalid_observation_time', 'The observation time is invalid or in the future');
      }
      if (operation.status !== 'pending') {
        if (operation.status === 'completed' && operation.totalMicroWh === total.toString()) return;
        throw new MeteringOperationError('The collection was already answered or has expired');
      }
      const freshAfter =
        operation.kind === 'final'
          ? this.freshAfter.get(operation.id)
          : new Date(operation.requestedAt.getTime() - INTERIM_MAX_AGE_MS);
      if (freshAfter && observedAt < freshAfter) {
        throw new MeteringValueError(
          'stale_reading',
          `The reading was observed at ${observedAt.toISOString()}, before ${freshAfter.toISOString()}`,
        );
      }
      if (session.latestMicroWh !== null && total < BigInt(session.latestMicroWh)) {
        throw new MeteringValueError('counter_decreased', 'The total is lower than an earlier reading of this session');
      }
      if (
        session.status !== ResourceMeteringSessionStatus.Active &&
        session.status !== ResourceMeteringSessionStatus.Pending
      ) {
        throw new MeteringOperationError('The metering session is closed');
      }
      await manager.update(ResourceMeteringSession, session.id, {
        latestMicroWh: total.toString(),
        latestObservedAt: observedAt,
        source: report.source ?? session.source,
      });
      await manager.update(ResourceMeteringOperation, operation.id, {
        status: 'completed',
        completedAt: now,
        totalMicroWh: total.toString(),
        observedAt,
        source: report.source ?? null,
      });
    });
  }
}
