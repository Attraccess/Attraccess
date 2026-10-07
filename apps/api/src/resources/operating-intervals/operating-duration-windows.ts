import {
  ResourceOperatingInterval,
  ResourceUsage,
  ResourceUsageAction,
  ResourceUsageLifecycleAttempt,
} from '@attraccess/database-entities';
import { EntityManager, In, IsNull, LessThan, MoreThan } from 'typeorm';
import {
  groupByResourceId,
  ResourceDurations,
  ResourceDurationWindow,
  TimeRange,
} from './resource-operating-attribution.service.feature-definitions';
import { ResourceOperatingAttributionServiceRouteContext } from './resource-operating-attribution.service.route-context';
export abstract class OperatingDurationWindowsImplementation extends ResourceOperatingAttributionServiceRouteContext {
  protected async getPendingSessionEnds(resourceIds: number[], manager?: EntityManager): Promise<Map<number, Date>> {
    const attempts = await (
      manager?.getRepository(ResourceUsageLifecycleAttempt) ?? this.lifecycleAttemptRepository
    ).find({
      where: { resourceId: In(resourceIds), kind: In(['end', 'takeover']) },
      select: ['previousUsageId', 'transitionTime'],
    });
    return new Map(
      attempts.flatMap((attempt) =>
        attempt.previousUsageId === null ? [] : [[attempt.previousUsageId, attempt.transitionTime] as const],
      ),
    );
  }

  /** Exact duration totals for independent service cycles, without deriving user attributions. */
  async getDurationsForWindows(
    windows: ResourceDurationWindow[],
    asOf: Date,
    manager?: EntityManager,
  ): Promise<Map<string, ResourceDurations>> {
    const result = new Map<string, ResourceDurations>();
    const windowsByResource = new Map<number, ResourceDurationWindow[]>();
    for (const window of windows) {
      const resourceWindows = windowsByResource.get(window.resourceId) ?? [];
      resourceWindows.push(window);
      windowsByResource.set(window.resourceId, resourceWindows);
    }
    const resourceIds = [...windowsByResource.keys()];
    const intervalRepository = manager?.getRepository(ResourceOperatingInterval) ?? this.intervalRepository;
    const usageRepository = manager?.getRepository(ResourceUsage) ?? this.usageRepository;

    // Each resource gets its own oldest requested boundary. Sharing a boundary across a batch
    // would load an unbounded history for unrelated resources with newer service cycles.
    for (let offset = 0; offset < resourceIds.length; offset += 150) {
      const batchIds = resourceIds.slice(offset, offset + 150);
      const batchWindows = batchIds.flatMap((id) => windowsByResource.get(id) ?? []);
      const where = batchIds.flatMap((resourceId) => {
        const start = new Date(
          Math.min(...(windowsByResource.get(resourceId) ?? []).map((window) => window.start.getTime())),
        );
        return [
          { resourceId, startTime: LessThan(asOf), endTime: IsNull() },
          { resourceId, startTime: LessThan(asOf), endTime: MoreThan(start) },
        ];
      });
      const [intervals, usages, pendingSessionEnds] = await Promise.all([
        intervalRepository.find({ where, select: ['resourceId', 'startTime', 'endTime'] }),
        usageRepository.find({
          where: where.map((condition) => ({
            ...condition,
            usageAction: ResourceUsageAction.Usage,
            lifecyclePending: false,
          })),
          select: ['id', 'resourceId', 'startTime', 'endTime'],
        }),
        this.getPendingSessionEnds(batchIds, manager),
      ]);
      const intervalsByResource = groupByResourceId(intervals);
      const usagesByResource = groupByResourceId(usages);
      for (const window of batchWindows) {
        const duration = (rows: Array<Pick<ResourceUsage, 'startTime' | 'endTime'>>) =>
          this.unionDuration(
            rows
              .map((row) => this.toRange(row, asOf, window.start))
              .filter((range): range is TimeRange => range !== null),
          );
        result.set(window.key, {
          sessionDurationMs: this.unionDuration(
            (usagesByResource.get(window.resourceId) ?? [])
              .map((usage) => this.toUsageRange(usage, asOf, window.start, pendingSessionEnds))
              .filter((range): range is TimeRange => range !== null),
          ),
          operatingDurationMs: duration(intervalsByResource.get(window.resourceId) ?? []),
        });
      }
    }
    return result;
  }
}
