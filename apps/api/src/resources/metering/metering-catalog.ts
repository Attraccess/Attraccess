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
import { meterCharge, formatMeterValue } from './quantity';
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
    const share = sessionShare(soFar, usage.id);
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

  async listMeters(resourceId: number) {
    const meters = await this.store.listMeters(resourceId);
    const { byMeter } = await findActiveMeterSessions(
      this.store,
      resourceId,
      meters.map((meter) => meter.id),
    );
    const result = [];
    for (const meter of meters) {
      const sessions = [];
      for (const { usage, session: held } of byMeter.get(meter.id) ?? []) {
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
            chargeCredits: live
              ? live.credits
              : session.latestValue == null
                ? null
                : meterCharge(BigInt(session.latestValue), sessionRate),
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
      });
    }
    return result;
  }

  async createMeter(resourceId: number, name: string) {
    if (!(await this.store.resourceExists(resourceId))) throw new BadRequestException('RESOURCE_NOT_FOUND');
    let meter: ResourceMeterRecord;
    try {
      meter = await this.store.createMeter(resourceId, name.trim());
    } catch (error) {
      if (error instanceof MeterNameTakenError) throw new ConflictException('METER_NAME_EXISTS');
      throw error;
    }
    return this.getMeterDto(resourceId, meter.id);
  }

  async updateMeter(resourceId: number, meterId: number, name: string) {
    const meter = await requireMeter(this.store, resourceId, meterId);
    try {
      await this.store.renameMeter(resourceId, meter.id, name.trim());
    } catch (error) {
      if (error instanceof MeterNameTakenError) throw new ConflictException('METER_NAME_EXISTS');
      throw error;
    }
    return this.getMeterDto(resourceId, meterId);
  }

  async setRate(resourceId: number, meterId: number, creditsPerUnit: number) {
    const meter = await requireMeter(this.store, resourceId, meterId);
    await this.store.setMeterRate(meter.id, creditsPerUnit);
    return this.getMeterDto(resourceId, meterId);
  }

  async setAllocation(resourceId: number, meterId: number, allocation: MeterAllocationKind) {
    const meter = await requireMeter(this.store, resourceId, meterId);
    await this.store.setMeterAllocation(meter.id, allocation);
    return this.getMeterDto(resourceId, meterId);
  }

  private async getMeterDto(resourceId: number, meterId: number) {
    const meter = (await this.listMeters(resourceId)).find((m) => m.id === meterId);
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
