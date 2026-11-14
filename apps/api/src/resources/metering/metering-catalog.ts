import { BadRequestException, ConflictException } from '@nestjs/common';
import { EntityManager, In, Repository } from 'typeorm';
import {
  Resource,
  ResourceMeter,
  ResourceFlowNode,
  ResourceFlowEdge,
  ResourceMeteringSegment,
  ResourceMeteringSession,
  ResourceMeteringSessionStatus,
  ResourceMeterAllocation,
  ResourceUsage,
} from '@attraccess/database-entities';
import { meterDefinitionFromFlow } from './metering-definition';
import { meterCharge, formatMeterValue } from './quantity';
import { findActiveMeterSessions, getMeteringSessionLimit } from './meter-sessions';
import { ClosedSegment, sessionShare } from './segment-charges';
import { IsNull, MoreThanOrEqual } from 'typeorm';

export async function requireMeter(manager: EntityManager, resourceId: number, meterId: number) {
  const meter = await manager.findOne(ResourceMeter, { where: { id: meterId, resourceId } });
  if (!meter) throw new BadRequestException('METER_NOT_FOUND');
  return meter;
}

/** Meter configuration and read-only views of definition and consumption state. */
export class MeteringCatalog {
  constructor(
    private readonly meters: Repository<ResourceMeter>,
    private readonly sessions: Repository<ResourceMeteringSession>,
    private readonly nodes: Repository<ResourceFlowNode>,
    private readonly edges: Repository<ResourceFlowEdge>,
  ) {}

  /** The meter is defined by its flow branches: trigger → acknowledgement, trigger → report. */
  async getDefinition(resourceId: number, meterId: number) {
    const flow = await this.getDefinitionFlow(resourceId);
    return meterDefinitionFromFlow(meterId, flow);
  }

  private async getDefinitionFlow(resourceId: number) {
    const [allNodes, edges] = await Promise.all([
      this.nodes.find({ where: { resourceId } }),
      this.edges.find({ where: { resourceId } }),
    ]);
    return { allNodes, edges };
  }

  /**
   * What a session of the machine owes for a meter so far. A session that shares the meter owes its share of the
   * segments closed so far plus its share of the open one, which is provisional until the next reading.
   */
  private async liveShare(
    manager: EntityManager,
    meter: ResourceMeter,
    usage: ResourceUsage,
    session: ResourceMeteringSession,
  ) {
    const segments = await manager.find(ResourceMeteringSegment, {
      where: [
        { meterId: meter.id, endedAt: MoreThanOrEqual(usage.startTime) },
        { meterId: meter.id, endedAt: IsNull() },
      ],
      order: { startedAt: 'ASC' },
    });
    const mine = segments.filter(
      (segment) =>
        segment.status !== 'abandoned' && segment.participants.some((participant) => participant.usageId === usage.id),
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
    const manager = this.sessions.manager;
    const meters = await this.meters.find({ where: { resourceId }, order: { id: 'ASC' } });
    const { byMeter } = await findActiveMeterSessions(
      manager,
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
          const live = session.accounting === 'segmented' ? await this.liveShare(manager, meter, usage, session) : null;
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
              ? { shared: live.shared, provisional: live.provisional, participants: live.participants, segments: live.breakdown }
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
    if (!(await this.meters.manager.existsBy(Resource, { id: resourceId })))
      throw new BadRequestException('RESOURCE_NOT_FOUND');
    let meter: ResourceMeter;
    try {
      meter = await this.meters.save({ resourceId, name: name.trim() });
    } catch (error) {
      if (String(error).includes('UNIQUE')) throw new ConflictException('METER_NAME_EXISTS');
      throw error;
    }
    return this.getMeterDto(resourceId, meter.id);
  }

  async updateMeter(resourceId: number, meterId: number, name: string) {
    const meter = await requireMeter(this.meters.manager, resourceId, meterId);
    try {
      await this.meters.update({ id: meter.id, resourceId }, { name: name.trim() });
    } catch (error) {
      if (String(error).includes('UNIQUE')) throw new ConflictException('METER_NAME_EXISTS');
      throw error;
    }
    return this.getMeterDto(resourceId, meterId);
  }

  async setRate(resourceId: number, meterId: number, creditsPerUnit: number) {
    const meter = await requireMeter(this.meters.manager, resourceId, meterId);
    await this.meters.update(meter.id, { creditsPerUnit });
    return this.getMeterDto(resourceId, meterId);
  }

  async setAllocation(resourceId: number, meterId: number, allocation: ResourceMeterAllocation) {
    const meter = await requireMeter(this.meters.manager, resourceId, meterId);
    await this.meters.update(meter.id, { allocation });
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
    const meters = await this.meters.find({ where: { resourceId } });
    const flow = await this.getDefinitionFlow(resourceId);
    const sharedMachine = (await getMeteringSessionLimit(this.sessions.manager, resourceId)) > 1;
    const definitions = meters.map((meter) => {
      const definition = meterDefinitionFromFlow(meter.id, flow);
      // Splitting a shared meter needs a reading at every start and stop.
      const unreadable = sharedMachine && meter.allocation === 'shared' && (definition.incrementOnly || !definition.hasCollection);
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
    const unsettled = await this.sessions.find({
      where: { resourceId, status: In([ResourceMeteringSessionStatus.Pending, ResourceMeteringSessionStatus.Failed]) },
      order: { createdAt: 'DESC' },
      take: 20,
    });
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
