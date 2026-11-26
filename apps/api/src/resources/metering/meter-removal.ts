import { BadRequestException, ConflictException, Inject, Injectable } from '@nestjs/common';
import type { ResourceMeterRecord } from '@attraccess/application-models';
import { AUDIT_RECORDER, AuditRecorder } from '../../audit/recorder/audit-event';
import type { TransactionContext } from '../../database/transaction-context';
import { UNIT_OF_WORK, UnitOfWork } from '../../database/unit-of-work';
import { capturedBy, hasObservations, MeteringCatalog, requireMeter } from './metering-catalog';
import { MeterNameTakenError, METERING_STORE, MeteringStore } from './metering-store.port';

/**
 * Takes meters out of use: archiving hides a meter and keeps its history, restoring brings it back, and deleting
 * removes a meter that never recorded anything. Each runs in one transaction that locks the meter first and then the
 * resource's usage lifecycle (the order a reported reading takes them in), so a session start either captured the
 * meter before, and is seen here, or starts afterwards and no longer finds it.
 */
@Injectable()
export class MeterRemoval {
  private readonly catalog: MeteringCatalog;

  constructor(
    @Inject(METERING_STORE) private readonly store: MeteringStore,
    @Inject(UNIT_OF_WORK) private readonly unitOfWork: UnitOfWork,
    @Inject(AUDIT_RECORDER) private readonly audit: AuditRecorder,
  ) {
    this.catalog = new MeteringCatalog(store);
  }

  async archive(resourceId: number, meterId: number, initiatorId: number) {
    const archived = await this.unitOfWork.run(async (scope) => {
      const meter = await requireMeter(this.store, resourceId, meterId, scope);
      if (meter.archivedAt) return null;
      await this.store.lockUsageLifecycle(resourceId, scope);
      if (await this.isInUse(resourceId, meterId, scope)) throw meterInUse();
      await this.store.setMeterArchivedAt(meterId, new Date(), scope);
      return meter;
    });
    if (archived) await this.record('meter.archived', archived, initiatorId);
    return this.catalog.getMeterDto(resourceId, meterId);
  }

  async restore(resourceId: number, meterId: number, initiatorId: number) {
    const restored = await this.unitOfWork.run(async (scope) => {
      const meter = await requireMeter(this.store, resourceId, meterId, scope);
      if (!meter.archivedAt) return null;
      try {
        await this.store.setMeterArchivedAt(meterId, null, scope);
      } catch (error) {
        if (error instanceof MeterNameTakenError) throw new ConflictException('METER_NAME_EXISTS');
        throw error;
      }
      return meter;
    });
    if (restored) await this.record('meter.restored', restored, initiatorId);
    return this.catalog.getMeterDto(resourceId, meterId);
  }

  /** Sessions, operations and segments go with a deleted meter, so only a meter without any of them is deleted. */
  async delete(resourceId: number, meterId: number, initiatorId: number): Promise<void> {
    const deleted = await this.unitOfWork.run(async (scope) => {
      const meter = await this.store.lockMeterForDeletion(resourceId, meterId, scope);
      if (!meter) throw new BadRequestException('METER_NOT_FOUND');
      await this.store.lockUsageLifecycle(resourceId, scope);
      if (await this.isInUse(resourceId, meterId, scope)) throw meterInUse();
      if (hasObservations(meter) || (await this.store.hasMeterRecords(meterId, scope)))
        throw new ConflictException('METER_HAS_HISTORY', {
          description: 'The meter has recorded history. Archive it instead.',
        });
      await this.store.deleteMeter(meterId, scope);
      return meter;
    });
    await this.record('meter.deleted', deleted, initiatorId);
  }

  /** A usage that has not ended captured the meter at its start, or holds an active metering session of it. */
  private async isInUse(resourceId: number, meterId: number, scope: TransactionContext): Promise<boolean> {
    const usages = await this.store.findOpenUsages(resourceId, scope);
    if (!usages.length) return false;
    if (capturedBy(usages, meterId)) return true;
    const usageIds = usages.map((usage) => usage.id);
    return (await this.store.findRunningSessions(resourceId, usageIds, [meterId], scope)).length > 0;
  }

  private async record(
    action: 'meter.archived' | 'meter.restored' | 'meter.deleted',
    meter: ResourceMeterRecord,
    initiatorId: number,
  ): Promise<void> {
    await this.audit.record({
      domain: 'resource',
      action,
      actor: { id: initiatorId, authenticationMethod: 'session' },
      subject: { type: 'resource', id: meter.resourceId },
      details: { meterId: meter.id, meterName: meter.name },
    });
  }
}

function meterInUse() {
  return new ConflictException('METER_IN_USE', {
    description: 'A running session uses the meter. Wait until it ends, then archive the meter.',
  });
}
