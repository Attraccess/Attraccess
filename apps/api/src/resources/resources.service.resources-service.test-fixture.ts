import { Resource } from '@attraccess/database-entities';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditService } from '../audit/audit.service';
import { LicenseService } from '../license/license.service';
import { MetricsService } from '../metrics/metrics.service';
import { ResourceImageService } from './resourceImage.service';
import { ResourcesService } from './resources.service';

const mockMetricsService = {
  resourcesTotal: { inc: jest.fn(), dec: jest.fn(), set: jest.fn() },
  resourceUsageSessionsActive: { inc: jest.fn(), dec: jest.fn(), set: jest.fn() },
  resourceUsageSessionsTotal: { inc: jest.fn() },
  resourceUsageDurationSeconds: { observe: jest.fn() },
  resourceGroupsTotal: { inc: jest.fn(), dec: jest.fn(), set: jest.fn() },
  resourceIntroductionsTotal: { inc: jest.fn() },
  resourceMaintenanceTotal: { inc: jest.fn() },
  resourceMaintenanceOverdue: { inc: jest.fn(), dec: jest.fn(), set: jest.fn() },
};
export function registerResourcesServiceFixture() {
  let service: ResourcesService;

  let resourceRepository: jest.Mocked<Repository<Resource>>;

  const audit = { recordResource: jest.fn().mockResolvedValue(undefined) };

  // ResourceImageService is injected but not directly used in these tests

  const mockResourceRepository = () => ({
    find: jest.fn(),
    findOne: jest.fn(),
    findAndCount: jest.fn(),
    count: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    delete: jest.fn(),
    softDelete: jest.fn(),
    createQueryBuilder: jest.fn(() => ({
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      leftJoin: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getSql: jest.fn().mockReturnValue('SELECT * FROM resource'),
      getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
      getOne: jest.fn(),
    })),
  });

  const mockResourceImageService = {
    saveImage: jest.fn(),
    deleteImage: jest.fn(),
    getPublicPath: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ResourcesService,
        {
          provide: getRepositoryToken(Resource),
          useFactory: mockResourceRepository,
        },
        {
          provide: ResourceImageService,
          useValue: mockResourceImageService,
        },
        {
          provide: LicenseService,
          useValue: {
            verifyLicense: jest.fn().mockResolvedValue({ valid: true, payload: { cfg: {} } }),
          },
        },
        {
          provide: EventEmitter2,
          useValue: { emit: jest.fn() },
        },
        {
          provide: MetricsService,
          useValue: mockMetricsService,
        },
        { provide: AuditService, useValue: audit },
      ],
    }).compile();

    service = module.get<ResourcesService>(ResourcesService);
    resourceRepository = module.get(getRepositoryToken(Resource)) as jest.Mocked<Repository<Resource>>;
    audit.recordResource.mockClear();
    // ResourceImageService is available but not directly used in tests
  });
  return {
    get service() {
      return service;
    },
    get resourceRepository() {
      return resourceRepository;
    },
    get audit() {
      return audit;
    },
    get mockResourceImageService() {
      return mockResourceImageService;
    },
  };
}
