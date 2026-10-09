import { ResourceFlowNode, ResourceOperatingInterval } from '@attraccess/database-entities';
import { Repository } from 'typeorm';
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
  let intervalRepository: jest.Mocked<
    Pick<Repository<ResourceOperatingInterval>, 'findOne' | 'find' | 'findAndCount' | 'count'>
  >;

  let flowNodeRepository: jest.Mocked<Pick<Repository<ResourceFlowNode>, 'count'>>;

  let attributionService: jest.Mocked<Pick<ResourceOperatingAttributionService, 'getForResource'>>;

  let operatingMetrics: jest.Mocked<OperatingMetricsRecorder>;

  let service: ResourceOperatingDiagnosticsService;

  beforeEach(() => {
    intervalRepository = {
      findOne: jest.fn(),
      find: jest.fn().mockResolvedValue([]),
      findAndCount: jest.fn().mockResolvedValue([[], 0]),
      count: jest.fn().mockResolvedValue(0),
    };
    flowNodeRepository = { count: jest.fn().mockResolvedValue(0) };
    attributionService = { getForResource: jest.fn().mockResolvedValue(summary()) };
    operatingMetrics = {
      recordTransition: jest.fn(),
      setResourceState: jest.fn(),
      recordDataQualityFailures: jest.fn(),
    };
    service = new ResourceOperatingDiagnosticsService(
      intervalRepository as unknown as Repository<ResourceOperatingInterval>,
      flowNodeRepository as unknown as Repository<ResourceFlowNode>,
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
    get intervalRepository() {
      return intervalRepository;
    },
    get flowNodeRepository() {
      return flowNodeRepository;
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
