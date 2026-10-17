import {
  ResourceOperatingInterval,
  ResourceUsage,
  ResourceUsageAction,
  ResourceUsageLifecycleAttempt,
} from '@attraccess/database-entities';
import { Repository } from 'typeorm';
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

  let intervalRepository: jest.Mocked<
    Pick<Repository<ResourceOperatingInterval>, 'createQueryBuilder' | 'find' | 'existsBy'>
  >;

  let usageRepository: jest.Mocked<Pick<Repository<ResourceUsage>, 'find'>>;

  let lifecycleAttemptRepository: jest.Mocked<Pick<Repository<ResourceUsageLifecycleAttempt>, 'find'>>;

  let availabilityQuery: {
    select: jest.Mock;
    where: jest.Mock;
    getRawMany: jest.Mock;
  };

  beforeEach(() => {
    availabilityQuery = {
      select: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      getRawMany: jest.fn().mockResolvedValue([]),
    };
    intervalRepository = {
      find: jest.fn(),
      existsBy: jest.fn().mockResolvedValue(true),
      createQueryBuilder: jest.fn().mockReturnValue(availabilityQuery),
    };
    usageRepository = { find: jest.fn() };
    lifecycleAttemptRepository = { find: jest.fn().mockResolvedValue([]) };
    service = new ResourceOperatingAttributionService(
      intervalRepository as unknown as Repository<ResourceOperatingInterval>,
      usageRepository as unknown as Repository<ResourceUsage>,
      lifecycleAttemptRepository as Repository<ResourceUsageLifecycleAttempt>,
    );
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
    get intervalRepository() {
      return intervalRepository;
    },
    get usageRepository() {
      return usageRepository;
    },
    get availabilityQuery() {
      return availabilityQuery;
    },
  };
}
