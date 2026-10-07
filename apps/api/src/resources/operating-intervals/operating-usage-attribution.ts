import { ResourceOperatingInterval, ResourceUsage, ResourceUsageAction } from '@attraccess/database-entities';
import { EntityManager, In, IsNull, LessThan, MoreThan } from 'typeorm';
import { OperatingDurationWindowsImplementation } from './operating-duration-windows';
import {
  ATTRIBUTION_LOOKBACK_MS,
  groupByResourceId,
  ResourceOperatingAttributionSummary,
} from './resource-operating-attribution.service.feature-definitions';
export abstract class OperatingUsageAttributionImplementation extends OperatingDurationWindowsImplementation {
  async getForResource(
    resourceId: number,
    asOf = new Date(),
    windowStart = new Date(asOf.getTime() - ATTRIBUTION_LOOKBACK_MS),
  ): Promise<ResourceOperatingAttributionSummary> {
    const [operatingIntervals, usages, operatingDataAvailable, pendingSessionEnds] = await Promise.all([
      this.intervalRepository.find({
        where: [
          { resourceId, startTime: LessThan(asOf), endTime: IsNull() },
          { resourceId, startTime: LessThan(asOf), endTime: MoreThan(windowStart) },
        ],
        order: { startTime: 'ASC' },
      }),
      this.usageRepository.find({
        where: [
          {
            resourceId,
            usageAction: ResourceUsageAction.Usage,
            lifecyclePending: false,
            startTime: LessThan(asOf),
            endTime: IsNull(),
          },
          {
            resourceId,
            usageAction: ResourceUsageAction.Usage,
            lifecyclePending: false,
            startTime: LessThan(asOf),
            endTime: MoreThan(windowStart),
          },
        ],
        order: { startTime: 'ASC' },
      }),
      this.intervalRepository.existsBy({ resourceId }),
      this.getPendingSessionEnds([resourceId]),
    ]);

    return this.derive(operatingIntervals, usages, asOf, windowStart, operatingDataAvailable, true, pendingSessionEnds);
  }

  async getForResources(
    resourceIds: number[],
    windowStart: Date,
    asOf: Date,
    liveValuesMayChange = true,
  ): Promise<Map<number, ResourceOperatingAttributionSummary>> {
    const uniqueResourceIds = [...new Set(resourceIds)];
    if (uniqueResourceIds.length === 0) {
      return new Map();
    }

    const [operatingIntervals, usages, resourcesWithOperatingData, pendingSessionEnds] = await Promise.all([
      this.intervalRepository.find({
        where: [
          { resourceId: In(uniqueResourceIds), startTime: LessThan(asOf), endTime: IsNull() },
          { resourceId: In(uniqueResourceIds), startTime: LessThan(asOf), endTime: MoreThan(windowStart) },
        ],
        order: { startTime: 'ASC' },
      }),
      this.usageRepository.find({
        where: [
          {
            resourceId: In(uniqueResourceIds),
            usageAction: ResourceUsageAction.Usage,
            lifecyclePending: false,
            startTime: LessThan(asOf),
            endTime: IsNull(),
          },
          {
            resourceId: In(uniqueResourceIds),
            usageAction: ResourceUsageAction.Usage,
            lifecyclePending: false,
            startTime: LessThan(asOf),
            endTime: MoreThan(windowStart),
          },
        ],
        order: { startTime: 'ASC' },
      }),
      this.intervalRepository
        .createQueryBuilder('interval')
        .select('DISTINCT interval.resourceId', 'resourceId')
        .where('interval.resourceId IN (:...resourceIds)', { resourceIds: uniqueResourceIds })
        .getRawMany<{ resourceId: number }>(),
      this.getPendingSessionEnds(uniqueResourceIds),
    ]);
    const availableResourceIds = new Set(resourcesWithOperatingData.map(({ resourceId }) => resourceId));
    const intervalsByResourceId = groupByResourceId(operatingIntervals);
    const usagesByResourceId = groupByResourceId(usages);

    return new Map(
      uniqueResourceIds.map((resourceId) => [
        resourceId,
        this.derive(
          intervalsByResourceId.get(resourceId) ?? [],
          usagesByResourceId.get(resourceId) ?? [],
          asOf,
          windowStart,
          availableResourceIds.has(resourceId),
          liveValuesMayChange,
          pendingSessionEnds,
        ),
      ]),
    );
  }

  async getForUsage(usage: ResourceUsage, manager: EntityManager): Promise<number> {
    if (!usage.endTime) {
      return 0;
    }

    const intervals = await manager.getRepository(ResourceOperatingInterval).find({
      where: [
        { resourceId: usage.resourceId, startTime: LessThan(usage.endTime), endTime: IsNull() },
        { resourceId: usage.resourceId, startTime: LessThan(usage.endTime), endTime: MoreThan(usage.startTime) },
      ],
      order: { startTime: 'ASC' },
    });
    const { attributedOperatingDurationMs } = this.derive(intervals, [usage], usage.endTime, usage.startTime);
    return (attributedOperatingDurationMs ?? 0) / 60_000;
  }
}
