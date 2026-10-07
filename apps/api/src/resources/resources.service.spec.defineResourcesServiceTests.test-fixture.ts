import { Test, TestingModule } from '@nestjs/testing';
import { ResourcesService } from './resources.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Resource } from '@attraccess/database-entities';
import { Repository } from 'typeorm';
import { ResourceImageService } from './resourceImage.service';
import { LicenseService } from '../license/license.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { MetricsService } from '../metrics/metrics.service';
import { AuditService } from '../audit/audit.service';
import { registerResourcesServiceCreatesAResourceWithUploadedImageAndRecordsActorAttributionAfterPersistence } from './resources.service.resources-service-creates-a-resource-with-uploaded-image-and-records-actor-attribution-after-persistence.test-cases';
import { registerResourcesServiceRemovesTheNewResourceIfPersistingItsImageFilenameFails } from './resources.service.resources-service-removes-the-new-resource-if-persisting-its-image-filename-fails.test-cases';
import { registerResourcesServiceShouldBeDefined } from './resources.service.resources-service-should-be-defined.test-cases';
import { mockMetricsService } from './resources.service.spec.mock-metrics-service';
import { defineListResourcesTests } from './resources.service.spec.defineListResourcesTests.test-fixture';
import { defineUpdateResourceTests } from './resources.service.spec.defineUpdateResourceTests.test-fixture';
import { defineCreateResourceTests } from './resources.service.spec.defineCreateResourceTests.test-fixture';
import { defineDeleteResourceTests } from './resources.service.spec.defineDeleteResourceTests.test-fixture';
import { defineGetResourceByIdTests } from './resources.service.spec.defineGetResourceByIdTests.test-fixture';

export function defineResourcesServiceTests() {
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
  const scope = {
    get resourceRepository() {
      return resourceRepository;
    },
    set resourceRepository(value: typeof resourceRepository) {
      resourceRepository = value;
    },
    get mockResourceImageService() {
      return mockResourceImageService;
    },
    get service() {
      return service;
    },
    set service(value: typeof service) {
      service = value;
    },
    get audit() {
      return audit;
    },
    get mockResourceRepository() {
      return mockResourceRepository;
    },
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

  registerResourcesServiceCreatesAResourceWithUploadedImageAndRecordsActorAttributionAfterPersistence(scope);

  registerResourcesServiceRemovesTheNewResourceIfPersistingItsImageFilenameFails(scope);

  registerResourcesServiceShouldBeDefined(scope);

  describe('listResources', () => {
    defineListResourcesTests(scope);
  });

  describe('getResourceById', () => {
    defineGetResourceByIdTests(scope);
  });

  describe('createResource', () => {
    defineCreateResourceTests(scope);
  });

  describe('updateResource', () => {
    defineUpdateResourceTests(scope);
  });

  describe('deleteResource', () => {
    defineDeleteResourceTests(scope);
  });

  return scope;
}
