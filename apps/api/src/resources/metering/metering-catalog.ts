import { BadRequestException, ConflictException } from '@nestjs/common';
import {
  MeteringUsageRecord,
  MeterAllocationKind,
  ResourceMeterRecord,
  ResourceMeteringSessionRecord,
  ResourceMeteringSessionStatus,
} from '@attraccess/application-models';
import type { TransactionContext } from '../../database/transaction-context';
import { meterDefinitionFromFlow } from './metering-definition';
import { MeterNameTakenError, MeteringStore } from './metering-store.port';
import { partMeterCharge, priorConsumptionOf } from './continued-meter-charge';
import { formatMeterValue } from './quantity';
import { findActiveMeterSessions, getMeteringSessionLimit } from './meter-sessions';
import { ClosedSegment, sessionShare } from './segment-charges';

export async function requireMeter(
  store: MeteringStore,
  resourceId: number,
  meterId: number,
  context?: TransactionContext,
) {
  const meter = await store.findMeter(resourceId, meterId, context);
  if (!meter) throw new BadRequestException('METER_NOT_FOUND');
  return meter;
}

/** Runs a write that names a meter; a name an active meter of the resource already has is a 409. */
export async function withMeterNameConflict<T>(write: () => Promise<T>): Promise<T> {
  try {
    return await write();
  } catch (error) {
    if (error instanceof MeterNameTakenError) throw new ConflictException('METER_NAME_EXISTS');
    throw error;
  }
}

/** Whether the meter ever accepted a reading. */
export function hasObservations(meter: ResourceMeterRecord): boolean {
  return meter.lifetimeValue !== '0' || meter.counterValue !== null || meter.latestObservedAt !== null;
}

/** Whether one of the usages captured the meter's terms when it started. */
export function capturedBy(usages: MeteringUsageRecord[], meterId: number): boolean {
  return usages.some((usage) => usage.meterRates?.some((rate) => rate.meterId === meterId));
}

/**
 * The delete rule: a meter may be deleted when it never recorded anything and no usage that has not ended captured
 * it. Sessions, operations and segments go with a deleted meter, so any of them counts as history.
 */
export async function meterIsDeletable(
  store: MeteringStore,
  meter: ResourceMeterRecord,
  openUsages: MeteringUsageRecord[],
  context?: TransactionContext,
): Promise<boolean> {
  if (hasObservations(meter) || capturedBy(openUsages, meter.id)) return false;
  return !(await store.hasMeterRecords(meter.id, context));
}

export interface ListMetersOptions {
  includeArchived?: boolean;
  /** Work out `deletable`; otherwise it is false. Only people who may delete a meter need it. */
  withDeletable?: boolean;
}

/** Meter configuration and read-only views of definition and consumption state. */
export class MeteringCatalog {
  constructor(private readonly store: MeteringStore) {}

  /** The meter is defined by its flow branches: trigger → acknowledgement, trigger → report. */
  async getDefinition(resourceId: number, meterId: number) {
    const flow = await this.store.findDefinitionFlow(resourceId);
    return meterDefinitionFromFlow(meterId, flow);
  }

  /**
   * What a session of the machine owes for a meter so far. A session that shares the meter owes its share of the
   * segments closed so far plus its share of the open one, which is provisional until the next reading.
   */
  private async liveShare(
    meter: ResourceMeterRecord,
    usage: MeteringUsageRecord,
    session: ResourceMeteringSessionRecord,
  ) {
    // A segment a new start abandoned no longer counts: the session's share of it is not billable any more.
    const mine = (await this.store.findUsageSegments(meter.id, usage)).filter(
      (segment) => segment.status !== 'abandoned',
    );
    const closed: ClosedSegment[] = mine.filter((segment) => segment.status === 'closed');
    const open = mine.find((segment) => segment.status === 'open');
    const now = new Date();
    const counter = meter.counterValue ?? open?.startValue ?? '0';
    const soFar: ClosedSegment[] = open ? [...closed, { ...open, endedAt: now, endValue: counter }] : closed;
    if (!soFar.length) return null;
    const share = sessionShare(soFar, usage.id, await priorConsumptionOf(this.store, session));
    return {
      session,
      shared: !share.solo,
      provisional: Boolean(open),
      participants: open?.participants.length ?? null,
      quantity: share.quantity,
      credits: share.credits,
      breakdown: share.breakdown,
    };
  }

  /** What a session on its own total owes so far, rounded with the earlier parts of a switched session as billed. */
  private async ownCharge(session: ResourceMeteringSessionRecord, rate: number): Promise<number | null> {
    if (session.latestValue == null) return null;
    return partMeterCharge(await priorConsumptionOf(this.store, session), BigInt(session.latestValue), rate);
  }

  async listMeters(resourceId: number, options: ListMetersOptions = {}) {
    const meters = await this.store.listMeters(resourceId, undefined, { includeArchived: options.includeArchived });
    // Loaded once, and only when a meter without readings needs the full check.
    let openUsages: MeteringUsageRecord[] | undefined;
    const deletable = async (meter: ResourceMeterRecord) => {
      if (!options.withDeletable || hasObservations(meter)) return false;
      openUsages ??= await this.store.findOpenUsages(resourceId);
      return meterIsDeletable(this.store, meter, openUsages);
    };
    const { byMeter } = await findActiveMeterSessions(
      this.store,
      resourceId,
      meters.map((meter) => meter.id),
    );
    const result = [];
    for (const meter of meters) {
      const sessions = [];
      // Nothing runs on an archived meter: it has no session to show.
      for (const { usage, session: held } of meter.archivedAt ? [] : (byMeter.get(meter.id) ?? [])) {
        const captured = usage.meterRates?.find((rate) => rate.meterId === meter.id);
        const session = held && (usage.meterRates == null || captured != null) ? held : undefined;
        const sessionRate = captured?.creditsPerUnit ?? session?.creditsPerUnit ?? 0;
        if (session) {
          const live = session.accounting === 'segmented' ? await this.liveShare(meter, usage, session) : null;
          sessions.push({
            sessionId: session.id,
            usageId: session.usageId,
            meterName: captured?.name ?? session.meterName,
            creditsPerUnit: sessionRate,
            latestValue: live
              ? formatMeterValue(live.quantity)
              : session.latestValue == null
                ? null
                : formatMeterValue(BigInt(session.latestValue)),
            chargeCredits: live ? live.credits : await this.ownCharge(session, sessionRate),
            latestObservedAt: session.latestObservedAt ?? (live ? meter.latestObservedAt : null),
            source: session.source,
            // Only a session that shares the meter with others has a share and segments to show.
            ...(live
              ? {
                  shared: live.shared,
                  provisional: live.provisional,
                  participants: live.participants,
                  segments: live.breakdown,
                }
              : {}),
          });
        } else if (captured) {
          // Free-meter initialization may be skipped; its captured terms still belong to this usage.
          sessions.push({
            sessionId: null,
            usageId: usage.id,
            meterName: captured.name,
            creditsPerUnit: captured.creditsPerUnit,
            latestValue: null,
            chargeCredits: null,
            latestObservedAt: null,
            source: null,
          });
        }
      }
      result.push({
        id: meter.id,
        name: meter.name,
        creditsPerUnit: meter.creditsPerUnit,
        allocation: meter.allocation,
        lifetimeValue: formatMeterValue(BigInt(meter.lifetimeValue)),
        counterValue: meter.counterValue == null ? null : formatMeterValue(BigInt(meter.counterValue)),
        latestObservedAt: meter.latestObservedAt,
        // The earliest running session, for clients that show one session per meter.
        session: sessions[0] ?? null,
        sessions,
        archivedAt: meter.archivedAt,
        deletable: await deletable(meter),
      });
    }
    return result;
  }

  async createMeter(resourceId: number, name: string) {
    if (!(await this.store.resourceExists(resourceId))) throw new BadRequestException('RESOURCE_NOT_FOUND');
    const meter = await withMeterNameConflict(() => this.store.createMeter(resourceId, name.trim()));
    return this.getMeterDto(resourceId, meter.id);
  }

  async updateMeter(resourceId: number, meterId: number, name: string) {
    const meter = await requireMeter(this.store, resourceId, meterId);
    await withMeterNameConflict(() => this.store.renameMeter(resourceId, meter.id, name.trim()));
    return this.getMeterDto(resourceId, meterId);
  }

  async setRate(resourceId: number, meterId: number, creditsPerUnit: number) {
    const meter = await requireMeter(this.store, resourceId, meterId);
    await this.store.setMeterRate(meter.id, creditsPerUnit);
    // Billing managers may change prices without being allowed to delete the meter.
    return this.getMeterDto(resourceId, meterId, false);
  }

  async setAllocation(resourceId: number, meterId: number, allocation: MeterAllocationKind) {
    const meter = await requireMeter(this.store, resourceId, meterId);
    await this.store.setMeterAllocation(meter.id, allocation);
    // Billing managers may change prices without being allowed to delete the meter.
    return this.getMeterDto(resourceId, meterId, false);
  }

  /** One meter, active or archived; `withDeletable` for people who may delete it. */
  async getMeterDto(resourceId: number, meterId: number, withDeletable = true) {
    const meters = await this.listMeters(resourceId, { includeArchived: true, withDeletable });
    const meter = meters.find((m) => m.id === meterId);
    if (!meter) throw new BadRequestException('METER_NOT_FOUND');
    return meter;
  }

  async getLive(resourceId: number) {
    return { meters: await this.listMeters(resourceId) };
  }

  async getStatus(resourceId: number) {
    const meters = await this.store.listMeters(resourceId);
    const flow = await this.store.findDefinitionFlow(resourceId);
    const sharedMachine = (await getMeteringSessionLimit(this.store, resourceId)) > 1;
    const definitions = meters.map((meter) => {
      const definition = meterDefinitionFromFlow(meter.id, flow);
      // Splitting a shared meter needs a reading at every start and stop. A rate of 0 only tracks, so nothing is split.
      const unreadable =
        sharedMachine &&
        meter.allocation === 'shared' &&
        meter.creditsPerUnit > 0 &&
        (definition.incrementOnly || !definition.hasCollection);
      return {
        meterId: meter.id,
        name: meter.name,
        creditsPerUnit: meter.creditsPerUnit,
        allocation: meter.allocation,
        configured: definition.configured,
        problems: unreadable ? [...definition.problems, 'shared-needs-collect' as const] : definition.problems,
        interimIntervalMinutes: definition.hasCollection ? definition.collect.interimIntervalMinutes : 0,
      };
    });
    const unsettled = await this.store.findUnsettledSessions(resourceId, 20);
    return {
      meters: definitions,
      unsettled: unsettled.map((session) => ({
        sessionId: session.id,
        meterId: session.meterId,
        meterName: session.meterName,
        usageId: session.usageId,
        status: session.status,
        reason: session.failureReason,
        latestValue: session.latestValue == null ? null : formatMeterValue(BigInt(session.latestValue)),
        retryable: session.status === ResourceMeteringSessionStatus.Pending,
      })),
    };
  }
}
