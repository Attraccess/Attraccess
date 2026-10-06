import { BadRequestException, ConflictException } from '@nestjs/common';
import { EntityManager, In, IsNull, Repository } from 'typeorm';
import {
  Resource,
  ResourceMeter,
  ResourceFlowNode,
  ResourceFlowEdge,
  ResourceMeteringSession,
  ResourceMeteringSessionStatus,
  ResourceUsage,
} from '@attraccess/database-entities';
import { meterDefinitionFromFlow } from './metering-definition';
import { meterCharge, formatMeterValue } from './quantity';

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

  async listMeters(resourceId: number) {
    const [meters, usage, active] = await Promise.all([
      this.meters.find({ where: { resourceId }, order: { id: 'ASC' } }),
      this.sessions.manager.findOne(ResourceUsage, {
        where: { resourceId, endTime: IsNull(), lifecyclePending: false },
      }),
      this.findActiveSessions(resourceId),
    ]);
    return meters.map((meter) => {
      const captured = usage?.meterRates?.find((rate) => rate.meterId === meter.id);
      const session = active.find(
        (s) => s.meterId === meter.id && s.usageId === usage?.id && (usage.meterRates == null || captured != null),
      );
      const sessionRate = captured?.creditsPerUnit ?? session?.creditsPerUnit ?? 0;
      return {
        id: meter.id,
        name: meter.name,
        creditsPerUnit: meter.creditsPerUnit,
        lifetimeValue: formatMeterValue(BigInt(meter.lifetimeValue)),
        counterValue: meter.counterValue == null ? null : formatMeterValue(BigInt(meter.counterValue)),
        latestObservedAt: meter.latestObservedAt,
        session: session
          ? {
              sessionId: session.id,
              usageId: session.usageId,
              meterName: captured?.name ?? session.meterName,
              creditsPerUnit: sessionRate,
              latestValue: session.latestValue == null ? null : formatMeterValue(BigInt(session.latestValue)),
              chargeCredits: session.latestValue == null ? null : meterCharge(BigInt(session.latestValue), sessionRate),
              latestObservedAt: session.latestObservedAt,
              source: session.source,
            }
          : captured && usage
            ? {
                // Free-meter initialization may be skipped; its captured terms still belong to this usage.
                sessionId: null,
                usageId: usage.id,
                meterName: captured.name,
                creditsPerUnit: captured.creditsPerUnit,
                latestValue: null,
                chargeCredits: null,
                latestObservedAt: null,
                source: null,
              }
            : null,
      };
    });
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

  private async getMeterDto(resourceId: number, meterId: number) {
    const meter = (await this.listMeters(resourceId)).find((m) => m.id === meterId);
    if (!meter) throw new BadRequestException('METER_NOT_FOUND');
    return meter;
  }

  async getLive(resourceId: number) {
    return { meters: await this.listMeters(resourceId) };
  }

  findActiveSessions(resourceId: number) {
    return this.sessions
      .createQueryBuilder('s')
      .innerJoin(ResourceUsage, 'u', 'u.id = s.usageId')
      .where('s.resourceId = :resourceId AND s.status = :status AND u.endTime IS NULL AND u.lifecyclePending = false', {
        resourceId,
        status: ResourceMeteringSessionStatus.Active,
      })
      .getMany();
  }

  async getStatus(resourceId: number) {
    const meters = await this.meters.find({ where: { resourceId } });
    const flow = await this.getDefinitionFlow(resourceId);
    const definitions = meters.map((meter) => {
      const definition = meterDefinitionFromFlow(meter.id, flow);
      return {
        meterId: meter.id,
        name: meter.name,
        creditsPerUnit: meter.creditsPerUnit,
        configured: definition.configured,
        problems: definition.problems,
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
