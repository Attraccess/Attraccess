import type { OperatingIntervalRecord, OperatingTimelineSession } from '@attraccess/application-models';
import { ResourceUsageAction } from '@attraccess/application-models';
import { ResourceOperatingAttributionService } from './resource-operating-attribution.service';
import type { OperatingTimelineStore } from './operating-timeline.port';

const at = (time: string) => new Date(`2026-08-28T${time}.000Z`);

const operating = (id: number, startTime: string, endTime: string | null): OperatingIntervalRecord => ({
  id,
  resourceId: 1,
  startTime: at(startTime),
  endTime: endTime ? at(endTime) : null,
  startFlowNodeId: null,
  startFlowRunId: null,
  endFlowNodeId: null,
  endFlowRunId: null,
});

const usage = (id: number, startTime: string, endTime: string | null): OperatingTimelineSession => ({
  id,
  resourceId: 1,
  usageAction: ResourceUsageAction.Usage,
  lifecyclePending: false,
  operatingDurationCreditsPerMinute: null,
  startTime: at(startTime),
  endTime: endTime ? at(endTime) : null,
});

type ReadSide = Pick<
  OperatingTimelineStore,
  'findIntervals' | 'findSessions' | 'findResourcesWithIntervals' | 'findPendingSessionEnds'
>;

export function registerResourceOperatingAttributionServiceFixture() {
  const asOf = at('12:00:00');

  let service: ResourceOperatingAttributionService;

  let timeline: { [Method in keyof ReadSide]: jest.Mock<ReturnType<ReadSide[Method]>, Parameters<ReadSide[Method]>> };

  beforeEach(() => {
    timeline = {
      findIntervals: jest.fn().mockResolvedValue([]),
      findSessions: jest.fn().mockResolvedValue([]),
      findResourcesWithIntervals: jest.fn(async (resourceIds: number[]) => new Set(resourceIds)),
      findPendingSessionEnds: jest.fn().mockResolvedValue(new Map()),
    };
    service = new ResourceOperatingAttributionService(timeline as unknown as OperatingTimelineStore);
  });
  return {
    get at() {
      return at;
    },
    get operating() {
      return operating;
    },
    get usage() {
      return usage;
    },
    get asOf() {
      return asOf;
    },
    get service() {
      return service;
    },
    get timeline() {
      return timeline;
    },
  };
}
