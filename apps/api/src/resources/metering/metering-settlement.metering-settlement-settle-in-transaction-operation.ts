import { EntityManager } from 'typeorm';
import { ResourceMeteringSession, ResourceMeteringSessionStatus, ResourceUsage } from '@attraccess/database-entities';
import { MeteringSettlementState } from './metering-settlement.metering-settlement-state';
import { FinalCollection } from './metering-settlement';

export abstract class MeteringSettlementSettleInTransactionOperation extends MeteringSettlementState {
  /** Runs inside the transaction that ends the usage, before the bill is finalized. Idempotent. */
  async settleInTransaction(manager: EntityManager, usageId: number, final: FinalCollection): Promise<void> {
    const sessions = await manager.find(ResourceMeteringSession, {
      where: { usageId, status: ResourceMeteringSessionStatus.Active },
    });
    for (const session of sessions) {
      const reading = final.status === 'collected' ? final.meters[session.id] : undefined;
      await this.settleSession(
        manager,
        session,
        reading ?? { status: 'unavailable', reason: 'No final reading was collected' },
      );
    }
    // Best-effort meters can be skipped at start. Their captured terms still
    // belong on the receipt, with an unavailable quantity rather than a zero.
    const usage = await manager.findOneOrFail(ResourceUsage, { where: { id: usageId } });
    const allSessions = await manager.find(ResourceMeteringSession, { where: { usageId } });
    for (const meter of usage.meterRates ?? []) {
      if (!allSessions.some((session) => session.meterId === meter.meterId)) {
        await this.addUnavailableItem(
          manager,
          usageId,
          meter.name,
          meter.creditsPerUnit,
          `metering:${usageId}:skipped:${meter.meterId}`,
        );
      }
    }
  }
}
