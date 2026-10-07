import { ResourceOperatingInterval, ResourceUsage, ResourceUsageLifecycleAttempt } from '@attraccess/database-entities';
import { EntityManager, Repository } from 'typeorm';
import {
  ResourceOperatingAttributionSummary,
  TimeRange,
} from './resource-operating-attribution.service.feature-definitions';

export abstract class ResourceOperatingAttributionServiceRouteContext {
  protected abstract readonly lifecycleAttemptRepository: Repository<ResourceUsageLifecycleAttempt>;
  protected abstract readonly intervalRepository: Repository<ResourceOperatingInterval>;
  protected abstract readonly usageRepository: Repository<ResourceUsage>;
  protected abstract getPendingSessionEnds(resourceIds: number[], manager?: EntityManager): Promise<Map<number, Date>>;
  protected abstract unionDuration(ranges: TimeRange[]): number;
  protected abstract toRange(
    interval: Pick<ResourceOperatingInterval | ResourceUsage, 'startTime' | 'endTime'>,
    asOf: Date,
    windowStart?: Date,
  ): TimeRange | null;
  protected abstract toUsageRange(
    usage: Pick<ResourceUsage, 'id' | 'startTime' | 'endTime'>,
    asOf: Date,
    windowStart: Date | undefined,
    pendingSessionEnds: Map<number, Date>,
  ): TimeRange | null;
  public abstract derive(
    operatingIntervals: ResourceOperatingInterval[],
    usages: ResourceUsage[],
    asOf?: Date,
    windowStart?: Date,
    operatingDataAvailable?: boolean,
    liveValuesMayChange?: boolean,
    pendingSessionEnds?: Map<number, Date>,
  ): ResourceOperatingAttributionSummary;
  protected abstract isOpenAt(
    interval: Pick<ResourceOperatingInterval | ResourceUsage, 'endTime'>,
    asOf: Date,
  ): boolean;
  protected abstract intersection(left: TimeRange, right: TimeRange): TimeRange | null;
  protected abstract duration(range: TimeRange): number;
}
