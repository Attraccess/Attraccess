import { OperatingDiagnosticsPersistence } from './persistence/port';
import { ResourceOperatingInterval } from '@attraccess/application-models';
import { OperatingMetricsRecorder } from '../../metrics/instrumentation/operating/operating.helper';
import {
  ResourceOperatingAttributionService,
  ResourceOperatingAttributionSummary,
} from './resource-operating-attribution.service';
import { ResourceOperatingDiagnosticsService } from './resource-operating-diagnostics.service';

const at = (day: number, time: string) => new Date(`2026-09-${String(day).padStart(2, '0')}T${time}.000Z`);

const interval = (id: number, startTime: Date, endTime: Date | null): ResourceOperatingInterval =>
  ({ id, resourceId: 1, startTime, endTime }) as ResourceOperatingInterval;

function summary(overrides: Partial<ResourceOperatingAttributionSummary> = {}): ResourceOperatingAttributionSummary {
  return {
    asOf: at(20, '12:00:00'),
    windowStart: at(1, '00:00:00'),
    sessionDurationMs: 0,
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
export function registerResourceOperatingDiagnosticsServiceFixture() {
  let persistence: jest.Mocked<OperatingDiagnosticsPersistence>;

  let attributionService: jest.Mocked<Pick<ResourceOperatingAttributionService, 'getForResource'>>;

  let operatingMetrics: jest.Mocked<
    Pick<OperatingMetricsRecorder, 'recordTransition' | 'setResourceState' | 'recordDataQualityFailures'>
  >;

  let service: ResourceOperatingDiagnosticsService;

  beforeEach(() => {
    persistence = {
      openInterval: jest.fn().mockResolvedValue(null),
      latestInterval: jest.fn().mockResolvedValue(null),
      intervalPage: jest.fn().mockResolvedValue([[], 0]),
      trackingNodeCount: jest.fn().mockResolvedValue(0),
      recentTransitions: jest.fn().mockResolvedValue([]),
      openIntervalCount: jest.fn().mockResolvedValue(0),
      overlappingWindow: jest.fn().mockResolvedValue([]),
    };
    attributionService = { getForResource: jest.fn().mockResolvedValue(summary()) };
    operatingMetrics = {
      recordTransition: jest.fn(),
      setResourceState: jest.fn(),
      recordDataQualityFailures: jest.fn(),
    };
    service = new ResourceOperatingDiagnosticsService(
      persistence,
      attributionService as unknown as ResourceOperatingAttributionService,
      operatingMetrics as unknown as OperatingMetricsRecorder,
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
    get persistence() {
      return persistence;
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
