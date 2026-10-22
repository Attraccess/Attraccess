import { resourceCatalogOperationsFake } from './persistence/operations.test-fixture';
import { ResourceCatalogPersistence } from './persistence/port';
/* eslint-disable @typescript-eslint/no-explicit-any */

import { DocumentationType, ResourceType, SupervisionMode } from '@attraccess/application-models';

import { EventEmitter2 } from '@nestjs/event-emitter';

import { Test, TestingModule } from '@nestjs/testing';

import { randomUUID } from 'node:crypto';

import { projectResourceAuditEvent } from './../audit/audit-policy';

import { AuditService } from './../audit/audit.service';

import { ResourceNotFoundException } from './../exceptions/resource.notFound.exception';

import { LicenseService } from './../license/license.service';

import { MetricsService } from './../metrics/metrics.service';

import { inheritTestScope } from './../test-utils/inherit-test-scope';

import { createMockResource } from './../test-utils/resource.fixtures';

import { CreateResourceDto } from './dtos/createResource.dto';

import { ResourceImageService } from './resourceImage.service';

import { ResourcesService } from './resources.service';

import { mockMetricsService } from './resources.service.spec.mock-metrics-service';

export type ResourcesServiceTestScope = {
  persistence: jest.Mocked<ResourceCatalogPersistence>;
  mockResourceImageService: { saveImage: any; deleteImage: any; getPublicPath: any };
  service: ResourcesService;
  audit: { recordResource: any };
  mockPersistence: typeof resourceCatalogOperationsFake;
};

describe('ResourcesService', () => {
  let service: ResourcesService;

  let persistence: jest.Mocked<ResourceCatalogPersistence>;

  const audit = { recordResource: jest.fn().mockResolvedValue(undefined) };

  // ResourceImageService is injected but not directly used in these tests

  const mockPersistence = resourceCatalogOperationsFake;

  const mockResourceImageService = {
    saveImage: jest.fn(),
    deleteImage: jest.fn(),
    getPublicPath: jest.fn(),
  };

  const scope = {
    get persistence() {
      return persistence;
    },
    set persistence(value: typeof persistence) {
      persistence = value;
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
    get mockPersistence() {
      return mockPersistence;
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ResourcesService,
        { provide: ResourceCatalogPersistence, useFactory: mockPersistence },
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
    persistence = module.get(ResourceCatalogPersistence);
    audit.recordResource.mockClear();
    // ResourceImageService is available but not directly used in tests
  });

  it('creates a resource with uploaded image and records actor attribution after persistence', async () => {
    const resource = createMockResource({ id: 8, name: 'Lathe', type: ResourceType.Machine });
    scope.persistence.resourceCount.mockResolvedValue(2);
    scope.persistence.createResource.mockResolvedValue(resource);
    scope.persistence.saveResource.mockImplementation(async (record) => record);
    scope.mockResourceImageService.saveImage.mockResolvedValue('image.webp');
    const file = { buffer: Buffer.from('image') };
    const result = await scope.service.createResource(
      { name: 'Lathe', type: ResourceType.Machine } as CreateResourceDto,
      file as never,
      { id: 7, authenticationMethod: 'api-token', apiTokenId: 9 },
    );
    expect(result.imageFilename).toBe('image.webp');
    expect(scope.mockResourceImageService.saveImage).toHaveBeenCalledWith(8, file);
    expect(scope.persistence.createResource).toHaveBeenCalledTimes(1);
    expect(scope.persistence.saveResource).toHaveBeenCalledTimes(1);
    expect(scope.audit.recordResource).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'resource.created', actorId: 7, apiTokenId: 9, subjectId: 8 }),
    );
  });

  it('removes the new resource if persisting its image filename fails', async () => {
    const resource = createMockResource({ id: 8 });
    scope.persistence.resourceCount.mockResolvedValue(2);
    scope.persistence.createResource.mockResolvedValue(resource);
    scope.persistence.saveResource.mockRejectedValueOnce(new Error('image metadata write failed'));
    scope.mockResourceImageService.saveImage.mockResolvedValue('image.webp');
    await expect(
      scope.service.createResource(
        { name: 'Lathe', type: ResourceType.Machine } as CreateResourceDto,
        { buffer: Buffer.from('image') } as never,
      ),
    ).rejects.toThrow('image metadata write failed');
    expect(scope.persistence.removeResource).toHaveBeenCalledWith(8);
    expect(scope.audit.recordResource).not.toHaveBeenCalled();
  });

  it('should be defined', () => {
    expect(scope.service).toBeDefined();
  });

  describe('listResources application contract', () => {
    it('returns page metadata and plain resource records using default pagination', async () => {
      const rows = [createMockResource({ id: 7, name: 'Laser' })];
      scope.persistence.catalogPage.mockResolvedValue([rows, 12]);
      await expect(scope.service.listResources()).resolves.toEqual({ data: rows, total: 12, page: 1, limit: 10 });
      expect(scope.persistence.catalogPage).toHaveBeenCalledWith(expect.objectContaining({ page: 1, limit: 10 }));
    });
    it.each([7, [7, 8]])('normalizes ID selection %j at the application boundary', async (ids) => {
      await scope.service.listResources({ ids });
      expect(scope.persistence.catalogPage).toHaveBeenCalledWith(
        expect.objectContaining({ ids: Array.isArray(ids) ? ids : [ids] }),
      );
    });
    it('preserves the selected page, visibility, usage and search options', async () => {
      const options = {
        page: 3,
        limit: 5,
        ids: [7],
        search: 'Laser',
        groupId: -1,
        onlyInUse: true,
        onlyInUseByUserId: 9,
        onlyWithPermissionForUserId: 9,
        returnUsingUser: true,
      };
      await expect(scope.service.listResources(options)).resolves.toEqual({ data: [], total: 0, page: 3, limit: 5 });
      expect(scope.persistence.catalogPage).toHaveBeenCalledWith(options);
    });
  });

  describe('getResourceById', () => {
    const getResourceByIdScope = inheritTestScope(
      {
        get persistence() {
          return scope.persistence;
        },
        set persistence(value: typeof scope.persistence) {
          scope.persistence = value;
        },
        get service() {
          return scope.service;
        },
        set service(value: typeof scope.service) {
          scope.service = value;
        },
      },
      scope,
    );

    it('should return a resource by id', async () => {
      const mockResource = createMockResource({
        id: 1,
        name: 'Resource 1',
        description: 'Description 1',
        documentationMarkdown: '# Documentation 1',
      });

      getResourceByIdScope.persistence.resourcesByIds.mockResolvedValue([mockResource]);

      const result = await getResourceByIdScope.service.getResourceById(1);

      expect(result).toEqual(mockResource);
      expect(getResourceByIdScope.persistence.resourcesByIds).toHaveBeenCalledWith([1]);
    });

    it('should throw ResourceNotFoundException if resource not found', async () => {
      getResourceByIdScope.persistence.resourcesByIds.mockResolvedValue([]);

      await expect(getResourceByIdScope.service.getResourceById(999)).rejects.toThrow(ResourceNotFoundException);
    });
  });

  describe('createResource', () => {
    const createResourceScope = inheritTestScope(
      {
        get persistence() {
          return scope.persistence;
        },
        set persistence(value: typeof scope.persistence) {
          scope.persistence = value;
        },
        get service() {
          return scope.service;
        },
        set service(value: typeof scope.service) {
          scope.service = value;
        },
        get audit() {
          return scope.audit;
        },
      },
      scope,
    );

    it('should create a new resource', async () => {
      const createDto: CreateResourceDto = {
        name: 'New Resource',
        type: ResourceType.Machine,
        description: 'New Description',
        documentationType: DocumentationType.MARKDOWN,
        documentationMarkdown: '# New Documentation',
        documentationUrl: null,
        allowTakeOver: false,
        metadata: { location: 'lab-1', maxUsers: 2 },
      };

      const newResource = createMockResource({
        id: 1,
        name: createDto.name,
        description: createDto.description,
        documentationType: createDto.documentationType,
        documentationMarkdown: createDto.documentationMarkdown as string,
        documentationUrl: createDto.documentationUrl,
        imageFilename: null,
        metadata: createDto.metadata ?? null,
      });

      createResourceScope.persistence.createResource.mockResolvedValue(newResource);
      createResourceScope.persistence.saveResource.mockResolvedValue(newResource);

      const result = await createResourceScope.service.createResource(createDto);

      expect(result).toEqual(newResource);
      expect(createResourceScope.persistence.createResource).toHaveBeenCalledWith({
        name: createDto.name,
        type: createDto.type,
        description: createDto.description,
        documentationType: createDto.documentationType || null,
        documentationMarkdown: createDto.documentationMarkdown || null,
        documentationUrl: createDto.documentationUrl || null,
        allowTakeOver: createDto.allowTakeOver || false,
        separateUnlockAndUnlatch: false,
        metadata: createDto.metadata ?? null,
        retrainingMaxAgeDays: createDto.retrainingMaxAgeDays ?? null,
        retrainingMaxInactivityDays: createDto.retrainingMaxInactivityDays ?? null,
        retrainingBlocksAccess: createDto.retrainingBlocksAccess ?? false,
        supervisionMode: SupervisionMode.INTRODUCTION_REQUIRED,
        supervisedUsagesUntilIntroduction: null,
        autoIntroductionTarget: null,
        autoIntroductionGroupId: null,
      });
      expect(createResourceScope.persistence.createResource).toHaveBeenCalled();
    });

    it('audits only the safe resource projection when an actor is available', async () => {
      const resource = createMockResource({ id: 1, name: 'Lathe', type: ResourceType.Machine });
      createResourceScope.persistence.createResource.mockResolvedValue(resource);
      createResourceScope.persistence.saveResource.mockResolvedValue(resource);

      await createResourceScope.service.createResource({ name: 'Lathe', type: ResourceType.Machine }, undefined, {
        id: 9,
      });

      expect(createResourceScope.audit.recordResource).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'resource.created',
          actorId: 9,
          subjectId: 1,
          details: { 'after.name': 'Lathe', 'after.type': ResourceType.Machine },
        }),
      );
    });

    it('bounds an oversized resource name in the audit projection', async () => {
      const resource = createMockResource({ id: 1, name: '"\\\0🙂'.repeat(5000), type: ResourceType.Machine });
      createResourceScope.persistence.createResource.mockResolvedValue(resource);
      createResourceScope.persistence.saveResource.mockResolvedValue(resource);

      await createResourceScope.service.createResource({ name: resource.name, type: ResourceType.Machine }, undefined, {
        id: 9,
      });

      const details = createResourceScope.audit.recordResource.mock.calls[0][0].details;
      expect(details['after.name']).toMatch(/\.\.\.$/);
      expect(Buffer.byteLength(JSON.stringify(details), 'utf8')).toBeLessThanOrEqual(4096);
      expect(
        projectResourceAuditEvent({
          ...createResourceScope.audit.recordResource.mock.calls[0][0],
          operationId: randomUUID(),
        }),
      ).not.toBeNull();
    });
  });
});
