import { BadRequestException, ConflictException } from '@nestjs/common';
import { MeteringPersistence, MeterNameConflictError } from './persistence/port';
import { ResourceMeter, ResourceMeteringSessionStatus } from '@attraccess/application-models';
import { meterDefinitionFromFlow } from './metering-definition';
import { meterCharge, formatMeterValue } from './quantity';

export async function requireMeter(persistence: MeteringPersistence, resourceId: number, meterId: number) {
  const meter = await persistence.meter(resourceId, meterId);
  if (!meter) throw new BadRequestException('METER_NOT_FOUND');
  return meter;
}

export function requireMeteringRecord<T>(record: T | null, subject: string): T {
  if (!record) throw new Error(`Metering record was not found: ${subject}`);
  return record;
}

/** Meter configuration and read-only views of definition and consumption state. */
export class MeteringCatalog {
  constructor(private readonly persistence: MeteringPersistence) {}

  /** The meter is defined by its flow branches: trigger → acknowledgement, trigger → report. */
  async getDefinition(resourceId: number, meterId: number) {
    const flow = await this.getDefinitionFlow(resourceId);
    return meterDefinitionFromFlow(meterId, flow);
  }

  private async getDefinitionFlow(resourceId: number) {
    const [allNodes, edges] = await Promise.all([
      this.persistence.flowNodes(resourceId),
      this.persistence.flowEdges(resourceId),
    ]);
    return { allNodes, edges };
  }

  async listMeters(resourceId: number) {
    const [meters, usage, active] = await Promise.all([
      this.persistence.meters(resourceId, true),
      this.persistence.activeUsage(resourceId),
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
    if (!(await this.persistence.resourceExists(resourceId))) throw new BadRequestException('RESOURCE_NOT_FOUND');
    let meter: ResourceMeter;
    try {
      meter = await this.persistence.createMeter(resourceId, name.trim());
    } catch (error) {
      if (error instanceof MeterNameConflictError) throw new ConflictException('METER_NAME_EXISTS');
      throw error;
    }
    return this.getMeterDto(resourceId, meter.id);
  }

  async updateMeter(resourceId: number, meterId: number, name: string) {
    const meter = await requireMeter(this.persistence, resourceId, meterId);
    try {
      await this.persistence.renameMeter(resourceId, meter.id, name.trim());
    } catch (error) {
      if (error instanceof MeterNameConflictError) throw new ConflictException('METER_NAME_EXISTS');
      throw error;
    }
    return this.getMeterDto(resourceId, meterId);
  }

  async setRate(resourceId: number, meterId: number, creditsPerUnit: number) {
    const meter = await requireMeter(this.persistence, resourceId, meterId);
    await this.persistence.setRate(meter.id, creditsPerUnit);
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

  async findActiveSessions(resourceId: number) {
    const usage = await this.persistence.activeUsage(resourceId);
    if (!usage) return [];
    return this.persistence.activeSessions(usage.id, resourceId);
  }

  async getStatus(resourceId: number) {
    const meters = await this.persistence.meters(resourceId);
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
    const unsettled = await this.persistence.unsettledSessions(resourceId);
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
