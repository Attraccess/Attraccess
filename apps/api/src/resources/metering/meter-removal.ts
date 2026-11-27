import { BadRequestException, ConflictException, Inject, Injectable } from '@nestjs/common';
import type { MeteringUsageRecord, ResourceMeterRecord } from '@attraccess/application-models';
import { AUDIT_RECORDER, AuditActor, AuditRecorder } from '../../audit/recorder/audit-event';
import type { TransactionContext } from '../../database/transaction-context';
import { UNIT_OF_WORK, UnitOfWork } from '../../database/unit-of-work';
import { capturedBy, MeteringCatalog, meterIsDeletable, requireMeter } from './metering-catalog';
import { MeterNameTakenError, METERING_STORE, MeteringStore } from './metering-store.port';

/**
 * Takes meters out of use: archiving hides a meter and keeps its history, restoring brings it back, and deleting
 * removes a meter that never recorded anything. Each runs in one transaction that locks the meter first and then the
 * resource's usage lifecycle (the order a reported reading takes them in), so a session start either captured the
 * meter before, and is seen here, or starts afterwards and no longer finds it.
 *
 * It is its own class, next to `ResourceMeteringService`, because that service is close to the file size limit.
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

  async archive(resourceId: number, meterId: number, actor: AuditActor) {
    const archived = await this.unitOfWork.run(async (scope) => {
      const meter = await requireMeter(this.store, resourceId, meterId, scope);
      if (meter.archivedAt) return null;
      await this.store.lockUsageLifecycle(resourceId, scope);
      const openUsages = await this.store.findOpenUsages(resourceId, scope);
      if (await this.isInUse(resourceId, meterId, openUsages, scope)) throw meterInUse();
      await this.store.setMeterArchivedAt(meterId, new Date(), scope);
      return meter;
    });
    if (archived) await this.record('meter.archived', archived, actor);
    return this.catalog.getMeterDto(resourceId, meterId);
  }

  async restore(resourceId: number, meterId: number, actor: AuditActor) {
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
    if (restored) await this.record('meter.restored', restored, actor);
    return this.catalog.getMeterDto(resourceId, meterId);
  }

  /** Only a meter that passes the delete rule (`meterIsDeletable`) is deleted, so no history goes with it. */
  async delete(resourceId: number, meterId: number, actor: AuditActor): Promise<void> {
    const deleted = await this.unitOfWork.run(async (scope) => {
      const meter = await this.store.lockMeterForDeletion(resourceId, meterId, scope);
      if (!meter) throw new BadRequestException('METER_NOT_FOUND');
      await this.store.lockUsageLifecycle(resourceId, scope);
      const openUsages = await this.store.findOpenUsages(resourceId, scope);
      if (await this.isInUse(resourceId, meterId, openUsages, scope)) throw meterInUse();
      if (!(await meterIsDeletable(this.store, meter, openUsages, scope)))
        throw new ConflictException('METER_HAS_HISTORY', {
          description: 'The meter has recorded history. Archive it instead.',
        });
      await this.store.deleteMeter(meterId, scope);
      return meter;
    });
    await this.record('meter.deleted', deleted, actor);
  }

  /** A usage that has not ended captured the meter at its start, or holds an active metering session of it. */
  private async isInUse(
    resourceId: number,
    meterId: number,
    usages: MeteringUsageRecord[],
    scope: TransactionContext,
  ): Promise<boolean> {
    if (!usages.length) return false;
    if (capturedBy(usages, meterId)) return true;
    const usageIds = usages.map((usage) => usage.id);
    return (await this.store.findRunningSessions(resourceId, usageIds, [meterId], scope)).length > 0;
  }

  private async record(
    action: 'meter.archived' | 'meter.restored' | 'meter.deleted',
    meter: ResourceMeterRecord,
    actor: AuditActor,
  ): Promise<void> {
    await this.audit.record({
      domain: 'resource',
      action,
      actor,
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
