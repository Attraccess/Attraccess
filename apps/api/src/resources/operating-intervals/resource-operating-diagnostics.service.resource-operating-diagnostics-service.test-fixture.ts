import type { OperatingIntervalRecord } from '@attraccess/application-models';
import { OperatingMetricsRecorder } from '../../metrics/instrumentation/operating/operating.helper';
import type { OperatingTimelineStore } from './operating-timeline.port';
import {
  ResourceOperatingAttributionService,
  ResourceOperatingAttributionSummary,
} from './resource-operating-attribution.service';
import { ResourceOperatingDiagnosticsService } from './resource-operating-diagnostics.service';

const at = (day: number, time: string) => new Date(`2026-09-${String(day).padStart(2, '0')}T${time}.000Z`);

const interval = (id: number, startTime: Date, endTime: Date | null): OperatingIntervalRecord => ({
  id,
  resourceId: 1,
  startTime,
  endTime,
  startFlowNodeId: null,
  startFlowRunId: null,
  endFlowNodeId: null,
  endFlowRunId: null,
});

function summary(overrides: Partial<ResourceOperatingAttributionSummary> = {}): ResourceOperatingAttributionSummary {
  return {
    asOf: at(20, '12:00:00'),
    windowStart: at(1, '00:00:00'),
    sessionDurationMs: 0,
    personDurationMs: 0,
    operatingDataAvailable: true,
    operatingDurationMs: 0,
    attributedOperatingDurationMs: 0,
    unattributedOperatingDurationMs: 0,
    isOperating: false,
    isProvisional: false,
    attributions: [],
    ...overrides,
  };
}

type DiagnosticsReads = Pick<
  OperatingTimelineStore,
  | 'findCurrentState'
  | 'pageIntervals'
  | 'findIntervalsActiveSince'
  | 'countOpenIntervals'
  | 'countTrackingNodes'
  | 'findIntervals'
>;

export function registerResourceOperatingDiagnosticsServiceFixture() {
  let timeline: {
    [Method in keyof DiagnosticsReads]: jest.Mock<
      ReturnType<DiagnosticsReads[Method]>,
      Parameters<DiagnosticsReads[Method]>
    >;
  };

  let attributionService: jest.Mocked<Pick<ResourceOperatingAttributionService, 'getForResource'>>;

  let operatingMetrics: jest.Mocked<OperatingMetricsRecorder>;

  let service: ResourceOperatingDiagnosticsService;

  beforeEach(() => {
    timeline = {
      findCurrentState: jest.fn().mockResolvedValue({ open: null, latest: null }),
      pageIntervals: jest.fn().mockResolvedValue({ intervals: [], total: 0 }),
      findIntervalsActiveSince: jest.fn().mockResolvedValue([]),
      countOpenIntervals: jest.fn().mockResolvedValue(0),
      countTrackingNodes: jest.fn().mockResolvedValue(0),
      findIntervals: jest.fn().mockResolvedValue([]),
    };
    attributionService = { getForResource: jest.fn().mockResolvedValue(summary()) };
    operatingMetrics = {
      recordTransition: jest.fn(),
      setResourceState: jest.fn(),
      recordDataQualityFailures: jest.fn(),
    };
    service = new ResourceOperatingDiagnosticsService(
      timeline as unknown as OperatingTimelineStore,
      attributionService as unknown as ResourceOperatingAttributionService,
      operatingMetrics,
    );
  });
  return {
    get at() {
      return at;
    },
    get interval() {
      return interval;
    },
    get summary() {
      return summary;
    },
    get timeline() {
      return timeline;
    },
    get attributionService() {
      return attributionService;
    },
    get operatingMetrics() {
      return operatingMetrics;
    },
    get service() {
      return service;
    },
  };
}
