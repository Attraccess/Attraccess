import { OperatingAttributionPersistence, OPERATING_ATTRIBUTION_READS } from './persistence/port';
import { operationTransactionsFake } from '../../database/testing/operation-transactions.test-fixture';
import { ResourceOperatingInterval, ResourceUsage, ResourceUsageAction } from '@attraccess/application-models';
import { ResourceOperatingAttributionService } from './resource-operating-attribution.service';

const at = (time: string) => new Date(`2026-08-28T${time}.000Z`);

const operating = (id: number, startTime: string, endTime: string | null): ResourceOperatingInterval =>
  ({ id, resourceId: 1, startTime: at(startTime), endTime: endTime ? at(endTime) : null }) as ResourceOperatingInterval;

const usage = (id: number, startTime: string, endTime: string | null): ResourceUsage =>
  ({
    id,
    resourceId: 1,
    usageAction: ResourceUsageAction.Usage,
    startTime: at(startTime),
    endTime: endTime ? at(endTime) : null,
  }) as ResourceUsage;
export function registerResourceOperatingAttributionServiceFixture() {
  const asOf = at('12:00:00');

  let service: ResourceOperatingAttributionService;

  let persistence: jest.Mocked<OperatingAttributionPersistence>;
  let transactionDriver: ReturnType<typeof operationTransactionsFake>;

  beforeEach(() => {
    persistence = {
      intervals: jest.fn().mockResolvedValue([]),
      usages: jest.fn().mockResolvedValue([]),
      hasData: jest.fn().mockResolvedValue(true),
      resourcesWithData: jest.fn().mockResolvedValue([]),
      pendingEnds: jest.fn().mockResolvedValue([]),
      durationRows: jest.fn().mockResolvedValue({ intervals: [], usages: [] }),
    };
    transactionDriver = operationTransactionsFake();
    transactionDriver.bind(OPERATING_ATTRIBUTION_READS, persistence);
    service = new ResourceOperatingAttributionService(persistence);
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
    get persistence() {
      return persistence;
    },
    get transactionDriver() {
      return transactionDriver;
    },
  };
}
