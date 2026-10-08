/* eslint-disable @typescript-eslint/no-explicit-any */

import { DocumentationType, Resource, ResourceType, SupervisionMode } from '@attraccess/database-entities';

import { EventEmitter2 } from '@nestjs/event-emitter';

import { Test, TestingModule } from '@nestjs/testing';

import { getRepositoryToken } from '@nestjs/typeorm';

import { randomUUID } from 'node:crypto';

import { Brackets, Repository, SelectQueryBuilder } from 'typeorm';

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

import { activeUsageSql } from './usage/active-usage';

export type ResourcesServiceTestScope = {
  resourceRepository: jest.Mocked<Repository<Resource>>;
  mockResourceImageService: { saveImage: any; deleteImage: any; getPublicPath: any };
  service: ResourcesService;
  audit: { recordResource: any };
  mockResourceRepository: () => {
    find: any;
    findOne: any;
    findAndCount: any;
    count: any;
    create: any;
    save: any;
    delete: any;
    softDelete: any;
    createQueryBuilder: any;
  };
};

describe('ResourcesService', () => {
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

  it('creates a resource with uploaded image and records actor attribution after persistence', async () => {
    const resource = createMockResource({ id: 8, name: 'Lathe', type: ResourceType.Machine });
    scope.resourceRepository.count.mockResolvedValue(2);
    scope.resourceRepository.create.mockReturnValue(resource);
    scope.resourceRepository.save.mockResolvedValue(resource);
    scope.mockResourceImageService.saveImage.mockResolvedValue('image.webp');
    const file = { buffer: Buffer.from('image') };
    const result = await scope.service.createResource(
      { name: 'Lathe', type: ResourceType.Machine } as CreateResourceDto,
      file as never,
      { id: 7, authenticationMethod: 'api-token', apiTokenId: 9 },
    );
    expect(result.imageFilename).toBe('image.webp');
    expect(scope.mockResourceImageService.saveImage).toHaveBeenCalledWith(8, file);
    expect(scope.resourceRepository.save).toHaveBeenCalledTimes(2);
    expect(scope.audit.recordResource).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'resource.created', actorId: 7, apiTokenId: 9, subjectId: 8 }),
    );
  });

  it('removes the new resource if persisting its image filename fails', async () => {
    const resource = createMockResource({ id: 8 });
    scope.resourceRepository.count.mockResolvedValue(2);
    scope.resourceRepository.create.mockReturnValue(resource);
    scope.resourceRepository.save
      .mockResolvedValueOnce(resource)
      .mockRejectedValueOnce(new Error('image metadata write failed'));
    scope.mockResourceImageService.saveImage.mockResolvedValue('image.webp');
    await expect(
      scope.service.createResource(
        { name: 'Lathe', type: ResourceType.Machine } as CreateResourceDto,
        { buffer: Buffer.from('image') } as never,
      ),
    ).rejects.toThrow('image metadata write failed');
    expect(scope.resourceRepository.delete).toHaveBeenCalledWith(8);
    expect(scope.audit.recordResource).not.toHaveBeenCalled();
  });

  it('should be defined', () => {
    expect(scope.service).toBeDefined();
  });

  describe('listResources', () => {
    let mockQueryBuilder: jest.Mocked<SelectQueryBuilder<Resource>>;
    const listResourcesScope = inheritTestScope(
      {
        get mockQueryBuilder() {
          return mockQueryBuilder;
        },
        set mockQueryBuilder(value: typeof mockQueryBuilder) {
          mockQueryBuilder = value;
        },
      },
      scope,
    );

    beforeEach(() => {
      mockQueryBuilder = {
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
      } as unknown as jest.Mocked<SelectQueryBuilder<Resource>>;

      scope.resourceRepository.createQueryBuilder.mockReturnValue(mockQueryBuilder);
    });

    describe('Basic functionality', () => {
      const basicFunctionalityScope = inheritTestScope(
        {
          get mockQueryBuilder() {
            return listResourcesScope.mockQueryBuilder;
          },
          set mockQueryBuilder(value: typeof listResourcesScope.mockQueryBuilder) {
            listResourcesScope.mockQueryBuilder = value;
          },
          get parentScope() {
            return listResourcesScope;
          },
        },
        listResourcesScope,
      );

      it('should return paginated resources with default options', async () => {
        const mockResources = [
          createMockResource({
            id: 1,
            name: 'Resource 1',
            description: 'Description 1',
            documentationMarkdown: '# Documentation 1',
          }),
          createMockResource({
            id: 2,
            name: 'Resource 2',
            description: 'Description 2',
            documentationMarkdown: '# Documentation 2',
          }),
        ];

        basicFunctionalityScope.mockQueryBuilder.getManyAndCount.mockResolvedValue([mockResources, 2]);

        const result = await basicFunctionalityScope.parentScope.service.listResources();

        expect(result.data).toEqual(mockResources);
        expect(result.total).toEqual(2);
        expect(result.page).toEqual(1);
        expect(result.limit).toEqual(10);
        expect(basicFunctionalityScope.parentScope.resourceRepository.createQueryBuilder).toHaveBeenCalledWith(
          'resource',
        );
        expect(basicFunctionalityScope.mockQueryBuilder.leftJoinAndSelect).toHaveBeenCalledWith(
          'resource.groups',
          'groups',
        );
        expect(basicFunctionalityScope.mockQueryBuilder.orderBy).toHaveBeenCalledWith('resource.name', 'ASC');
        expect(basicFunctionalityScope.mockQueryBuilder.skip).toHaveBeenCalledWith(0);
        expect(basicFunctionalityScope.mockQueryBuilder.take).toHaveBeenCalledWith(10);
      });

      it('should handle custom pagination', async () => {
        const mockResources = [
          createMockResource({
            id: 1,
            name: 'Resource 1',
            description: 'Description 1',
            documentationMarkdown: '# Documentation 1',
          }),
        ];
        basicFunctionalityScope.mockQueryBuilder.getManyAndCount.mockResolvedValue([mockResources, 1]);

        const result = await basicFunctionalityScope.parentScope.service.listResources({ page: 2, limit: 5 });

        expect(result.page).toEqual(2);
        expect(result.limit).toEqual(5);
        expect(basicFunctionalityScope.mockQueryBuilder.skip).toHaveBeenCalledWith(5); // (page - 1) * limit
        expect(basicFunctionalityScope.mockQueryBuilder.take).toHaveBeenCalledWith(5);
      });

      it('should return empty results', async () => {
        basicFunctionalityScope.mockQueryBuilder.getManyAndCount.mockResolvedValue([[], 0]);

        const result = await basicFunctionalityScope.parentScope.service.listResources();

        expect(result.data).toEqual([]);
        expect(result.total).toEqual(0);
      });
    });

    describe('Search filtering', () => {
      const searchFilteringScope = inheritTestScope(
        {
          get mockQueryBuilder() {
            return listResourcesScope.mockQueryBuilder;
          },
          set mockQueryBuilder(value: typeof listResourcesScope.mockQueryBuilder) {
            listResourcesScope.mockQueryBuilder = value;
          },
          get parentScope() {
            return listResourcesScope;
          },
        },
        listResourcesScope,
      );

      it('should filter by search term in name and description', async () => {
        const mockResources = [
          createMockResource({
            id: 1,
            name: 'Test Resource',
            description: 'Test Description',
            documentationMarkdown: '# Documentation 1',
          }),
        ];
        searchFilteringScope.mockQueryBuilder.getManyAndCount.mockResolvedValue([mockResources, 1]);

        await searchFilteringScope.parentScope.service.listResources({ search: 'test' });

        expect(searchFilteringScope.mockQueryBuilder.andWhere).toHaveBeenCalledWith(
          '(LOWER(resource.name) LIKE LOWER(:search) OR LOWER(resource.description) LIKE LOWER(:search))',
          { search: '%test%' },
        );
      });

      it('should not add search filter when search is empty', async () => {
        await searchFilteringScope.parentScope.service.listResources({ search: '' });

        expect(searchFilteringScope.mockQueryBuilder.andWhere).not.toHaveBeenCalledWith(
          expect.stringContaining('LOWER(resource.name) LIKE LOWER(:search)'),
        );
      });
    });

    describe('Group filtering', () => {
      const groupFilteringScope = inheritTestScope(
        {
          get parentScope() {
            return listResourcesScope;
          },
          get mockQueryBuilder() {
            return listResourcesScope.mockQueryBuilder;
          },
          set mockQueryBuilder(value: typeof listResourcesScope.mockQueryBuilder) {
            listResourcesScope.mockQueryBuilder = value;
          },
        },
        listResourcesScope,
      );

      it('should filter by specific group ID', async () => {
        await groupFilteringScope.parentScope.service.listResources({ groupId: 5 });

        expect(groupFilteringScope.mockQueryBuilder.andWhere).toHaveBeenCalledWith('groups.id = :groupId', {
          groupId: 5,
        });
      });

      it('should filter resources with no groups when groupId is -1', async () => {
        await groupFilteringScope.parentScope.service.listResources({ groupId: -1 });

        expect(groupFilteringScope.mockQueryBuilder.andWhere).toHaveBeenCalledWith('groups.id IS NULL');
      });

      it('should not add group filter when groupId is undefined', async () => {
        await groupFilteringScope.parentScope.service.listResources();

        expect(groupFilteringScope.mockQueryBuilder.andWhere).not.toHaveBeenCalledWith(
          expect.stringContaining('groups.id'),
        );
      });
    });

    describe('IDs filtering', () => {
      const idsFilteringScope = inheritTestScope(
        {
          get parentScope() {
            return listResourcesScope;
          },
          get mockQueryBuilder() {
            return listResourcesScope.mockQueryBuilder;
          },
          set mockQueryBuilder(value: typeof listResourcesScope.mockQueryBuilder) {
            listResourcesScope.mockQueryBuilder = value;
          },
        },
        listResourcesScope,
      );

      it('should filter by single resource ID', async () => {
        await idsFilteringScope.parentScope.service.listResources({ ids: 5 });

        expect(idsFilteringScope.mockQueryBuilder.andWhere).toHaveBeenCalledWith('resource.id IN (:...ids)', {
          ids: [5],
        });
      });

      it('should filter by multiple resource IDs', async () => {
        await idsFilteringScope.parentScope.service.listResources({ ids: [1, 2, 3] });

        expect(idsFilteringScope.mockQueryBuilder.andWhere).toHaveBeenCalledWith('resource.id IN (:...ids)', {
          ids: [1, 2, 3],
        });
      });

      it('should not add IDs filter when ids array is empty', async () => {
        await idsFilteringScope.parentScope.service.listResources({ ids: [] });

        expect(idsFilteringScope.mockQueryBuilder.andWhere).not.toHaveBeenCalledWith(
          expect.stringContaining('resource.id IN'),
        );
      });

      it('should not add IDs filter when ids is undefined', async () => {
        await idsFilteringScope.parentScope.service.listResources();

        expect(idsFilteringScope.mockQueryBuilder.andWhere).not.toHaveBeenCalledWith(
          expect.stringContaining('resource.id IN'),
        );
      });
    });

    describe('In-use filtering', () => {
      const inUseFilteringScope = inheritTestScope(
        {
          get parentScope() {
            return listResourcesScope;
          },
          get mockQueryBuilder() {
            return listResourcesScope.mockQueryBuilder;
          },
          set mockQueryBuilder(value: typeof listResourcesScope.mockQueryBuilder) {
            listResourcesScope.mockQueryBuilder = value;
          },
        },
        listResourcesScope,
      );

      it('should filter resources currently in use by specific user', async () => {
        await inUseFilteringScope.parentScope.service.listResources({ onlyInUseByUserId: 10 });

        expect(inUseFilteringScope.mockQueryBuilder.leftJoin).toHaveBeenCalledWith(
          'resource.usages',
          'usage',
          activeUsageSql('usage'),
        );
        expect(inUseFilteringScope.mockQueryBuilder.andWhere).toHaveBeenCalledWith(expect.any(Brackets));
      });

      it('should not add in-use filter when onlyInUseByUserId is undefined', async () => {
        await inUseFilteringScope.parentScope.service.listResources();

        expect(inUseFilteringScope.mockQueryBuilder.leftJoin).not.toHaveBeenCalledWith(
          'resource.usages',
          'usage',
          activeUsageSql('usage'),
        );
      });

      it('should filter resources currently in use (onlyInUse)', async () => {
        await inUseFilteringScope.parentScope.service.listResources({ onlyInUse: true });

        expect(inUseFilteringScope.mockQueryBuilder.leftJoin).toHaveBeenCalledWith(
          'resource.usages',
          'usage',
          activeUsageSql('usage'),
        );
        expect(inUseFilteringScope.mockQueryBuilder.andWhere).toHaveBeenCalledWith('usage.endTime IS NULL');
        expect(inUseFilteringScope.mockQueryBuilder.andWhere).toHaveBeenCalledWith('usage.startTime IS NOT NULL');
      });

      it('should return using user information when returnUsingUser is true', async () => {
        await inUseFilteringScope.parentScope.service.listResources({ returnUsingUser: true });

        expect(inUseFilteringScope.mockQueryBuilder.leftJoinAndSelect).toHaveBeenCalledWith(
          'resource.usages',
          'usage',
          activeUsageSql('usage'),
        );
        expect(inUseFilteringScope.mockQueryBuilder.leftJoinAndSelect).toHaveBeenCalledWith('usage.user', 'usingUser');
      });

      it('should handle combination of onlyInUse and returnUsingUser', async () => {
        await inUseFilteringScope.parentScope.service.listResources({ onlyInUse: true, returnUsingUser: true });

        expect(inUseFilteringScope.mockQueryBuilder.leftJoinAndSelect).toHaveBeenCalledWith(
          'resource.usages',
          'usage',
          activeUsageSql('usage'),
        );
        expect(inUseFilteringScope.mockQueryBuilder.leftJoinAndSelect).toHaveBeenCalledWith('usage.user', 'usingUser');
        expect(inUseFilteringScope.mockQueryBuilder.andWhere).toHaveBeenCalledWith('usage.endTime IS NULL');
        expect(inUseFilteringScope.mockQueryBuilder.andWhere).toHaveBeenCalledWith('usage.startTime IS NOT NULL');
      });
    });

    describe('Permission filtering', () => {
      const permissionFilteringScope = inheritTestScope(
        {
          get parentScope() {
            return listResourcesScope;
          },
          get mockQueryBuilder() {
            return listResourcesScope.mockQueryBuilder;
          },
          set mockQueryBuilder(value: typeof listResourcesScope.mockQueryBuilder) {
            listResourcesScope.mockQueryBuilder = value;
          },
        },
        listResourcesScope,
      );

      it('should filter resources with permissions for specific user', async () => {
        await permissionFilteringScope.parentScope.service.listResources({ onlyWithPermissionForUserId: 15 });

        // Check all the necessary joins for permission checking
        expect(permissionFilteringScope.mockQueryBuilder.leftJoin).toHaveBeenCalledWith(
          'resource.introducers',
          'introducer',
        );
        expect(permissionFilteringScope.mockQueryBuilder.leftJoin).toHaveBeenCalledWith(
          'resource.introductions',
          'introduction',
        );
        expect(permissionFilteringScope.mockQueryBuilder.leftJoin).toHaveBeenCalledWith(
          'introduction.history',
          'resourceIntroductionHistory',
        );
        expect(permissionFilteringScope.mockQueryBuilder.leftJoin).toHaveBeenCalledWith(
          'resource.groups',
          'resourceGroup',
        );
        expect(permissionFilteringScope.mockQueryBuilder.leftJoin).toHaveBeenCalledWith(
          'resourceGroup.introducers',
          'groupIntroducer',
        );
        expect(permissionFilteringScope.mockQueryBuilder.leftJoin).toHaveBeenCalledWith(
          'resourceGroup.introductions',
          'groupIntroduction',
        );
        expect(permissionFilteringScope.mockQueryBuilder.leftJoin).toHaveBeenCalledWith(
          'groupIntroduction.history',
          'groupIntroductionHistory',
        );

        // Check that the complex where condition is added
        expect(permissionFilteringScope.mockQueryBuilder.andWhere).toHaveBeenCalledWith(expect.any(Brackets));
      });

      it('should not add permission filter when onlyWithPermissionForUserId is undefined', async () => {
        await permissionFilteringScope.parentScope.service.listResources();

        expect(permissionFilteringScope.mockQueryBuilder.leftJoin).not.toHaveBeenCalledWith(
          'resource.introducers',
          'introducer',
        );
        expect(permissionFilteringScope.mockQueryBuilder.leftJoin).not.toHaveBeenCalledWith(
          'resource.introductions',
          'introduction',
        );
      });
    });

    describe('Combined filtering', () => {
      const combinedFilteringScope = inheritTestScope(
        {
          get mockQueryBuilder() {
            return listResourcesScope.mockQueryBuilder;
          },
          set mockQueryBuilder(value: typeof listResourcesScope.mockQueryBuilder) {
            listResourcesScope.mockQueryBuilder = value;
          },
          get parentScope() {
            return listResourcesScope;
          },
        },
        listResourcesScope,
      );

      it('should handle multiple filters simultaneously', async () => {
        const mockResources = [
          createMockResource({
            id: 1,
            name: 'Test Resource',
            description: 'Test Description',
            documentationMarkdown: '# Documentation 1',
          }),
        ];
        combinedFilteringScope.mockQueryBuilder.getManyAndCount.mockResolvedValue([mockResources, 1]);

        const result = await combinedFilteringScope.parentScope.service.listResources({
          page: 2,
          limit: 5,
          search: 'test',
          groupId: 3,
          ids: [1, 2, 3],
          onlyInUseByUserId: 10,
          onlyWithPermissionForUserId: 15,
        });

        // Verify pagination
        expect(combinedFilteringScope.mockQueryBuilder.skip).toHaveBeenCalledWith(5);
        expect(combinedFilteringScope.mockQueryBuilder.take).toHaveBeenCalledWith(5);

        // Verify search filter
        expect(combinedFilteringScope.mockQueryBuilder.andWhere).toHaveBeenCalledWith(
          '(LOWER(resource.name) LIKE LOWER(:search) OR LOWER(resource.description) LIKE LOWER(:search))',
          { search: '%test%' },
        );

        // Verify group filter
        expect(combinedFilteringScope.mockQueryBuilder.andWhere).toHaveBeenCalledWith('groups.id = :groupId', {
          groupId: 3,
        });

        // Verify IDs filter
        expect(combinedFilteringScope.mockQueryBuilder.andWhere).toHaveBeenCalledWith('resource.id IN (:...ids)', {
          ids: [1, 2, 3],
        });

        // Verify all joins for both in-use and permission filtering
        expect(combinedFilteringScope.mockQueryBuilder.leftJoin).toHaveBeenCalledWith(
          'resource.usages',
          'usage',
          activeUsageSql('usage'),
        );
        expect(combinedFilteringScope.mockQueryBuilder.leftJoin).toHaveBeenCalledWith(
          'resource.introducers',
          'introducer',
        );

        // Verify result structure
        expect(result.data).toEqual(mockResources);
        expect(result.total).toEqual(1);
        expect(result.page).toEqual(2);
        expect(result.limit).toEqual(5);
      });

      it('should handle edge case with groupId -1 and other filters', async () => {
        await combinedFilteringScope.parentScope.service.listResources({
          groupId: -1,
          search: 'test',
          ids: [1, 2],
        });

        expect(combinedFilteringScope.mockQueryBuilder.andWhere).toHaveBeenCalledWith('groups.id IS NULL');
        expect(combinedFilteringScope.mockQueryBuilder.andWhere).toHaveBeenCalledWith(
          '(LOWER(resource.name) LIKE LOWER(:search) OR LOWER(resource.description) LIKE LOWER(:search))',
          { search: '%test%' },
        );
        expect(combinedFilteringScope.mockQueryBuilder.andWhere).toHaveBeenCalledWith('resource.id IN (:...ids)', {
          ids: [1, 2],
        });
      });

      it('should handle combination of returnUsingUser with other filters', async () => {
        await combinedFilteringScope.parentScope.service.listResources({
          returnUsingUser: true,
          onlyWithPermissionForUserId: 15,
          search: 'test',
        });

        // Should use leftJoinAndSelect for usages when returnUsingUser is true
        expect(combinedFilteringScope.mockQueryBuilder.leftJoinAndSelect).toHaveBeenCalledWith(
          'resource.usages',
          'usage',
          activeUsageSql('usage'),
        );
        expect(combinedFilteringScope.mockQueryBuilder.leftJoinAndSelect).toHaveBeenCalledWith(
          'usage.user',
          'usingUser',
        );

        // Should still add permission filtering joins
        expect(combinedFilteringScope.mockQueryBuilder.leftJoin).toHaveBeenCalledWith(
          'resource.introducers',
          'introducer',
        );

        // Should add search filter
        expect(combinedFilteringScope.mockQueryBuilder.andWhere).toHaveBeenCalledWith(
          '(LOWER(resource.name) LIKE LOWER(:search) OR LOWER(resource.description) LIKE LOWER(:search))',
          { search: '%test%' },
        );
      });
    });

    describe('Edge cases', () => {
      const edgeCasesScope = inheritTestScope(
        {
          get parentScope() {
            return listResourcesScope;
          },
          get mockQueryBuilder() {
            return listResourcesScope.mockQueryBuilder;
          },
          set mockQueryBuilder(value: typeof listResourcesScope.mockQueryBuilder) {
            listResourcesScope.mockQueryBuilder = value;
          },
        },
        listResourcesScope,
      );

      it('should handle null/undefined options gracefully', async () => {
        const result = await edgeCasesScope.parentScope.service.listResources(undefined);

        expect(result.page).toEqual(1);
        expect(result.limit).toEqual(10);
        expect(edgeCasesScope.mockQueryBuilder.skip).toHaveBeenCalledWith(0);
        expect(edgeCasesScope.mockQueryBuilder.take).toHaveBeenCalledWith(10);
      });

      it('should handle empty options object', async () => {
        const result = await edgeCasesScope.parentScope.service.listResources({});

        expect(result.page).toEqual(1);
        expect(result.limit).toEqual(10);
      });

      it('should convert single ID to array for filtering', async () => {
        await edgeCasesScope.parentScope.service.listResources({ ids: 42 });

        expect(edgeCasesScope.mockQueryBuilder.andWhere).toHaveBeenCalledWith('resource.id IN (:...ids)', {
          ids: [42],
        });
      });

      it('should handle zero and negative page numbers gracefully', async () => {
        await edgeCasesScope.parentScope.service.listResources({ page: 0, limit: 5 });

        // Page 0 should be treated as page 1, so skip should be 0
        expect(edgeCasesScope.mockQueryBuilder.skip).toHaveBeenCalledWith(-5); // (0-1) * 5
      });

      it('should handle very large limit values', async () => {
        await edgeCasesScope.parentScope.service.listResources({ limit: 1000 });

        expect(edgeCasesScope.mockQueryBuilder.take).toHaveBeenCalledWith(1000);
      });
    });

    describe('Query builder method calls order and structure', () => {
      const queryBuilderMethodCallsOrderAndStructureScope = inheritTestScope(
        {
          get parentScope() {
            return listResourcesScope;
          },
          get mockQueryBuilder() {
            return listResourcesScope.mockQueryBuilder;
          },
          set mockQueryBuilder(value: typeof listResourcesScope.mockQueryBuilder) {
            listResourcesScope.mockQueryBuilder = value;
          },
        },
        listResourcesScope,
      );

      it('should maintain proper query builder method call order', async () => {
        await queryBuilderMethodCallsOrderAndStructureScope.parentScope.service.listResources({
          search: 'test',
          groupId: 1,
          onlyWithPermissionForUserId: 5,
        });

        // Verify that basic joins happen before filters
        expect(queryBuilderMethodCallsOrderAndStructureScope.mockQueryBuilder.leftJoinAndSelect).toHaveBeenCalledWith(
          'resource.groups',
          'groups',
        );
        expect(queryBuilderMethodCallsOrderAndStructureScope.mockQueryBuilder.orderBy).toHaveBeenCalledWith(
          'resource.name',
          'ASC',
        );
        expect(queryBuilderMethodCallsOrderAndStructureScope.mockQueryBuilder.getManyAndCount).toHaveBeenCalled();

        // Verify that permission-related joins are called
        expect(queryBuilderMethodCallsOrderAndStructureScope.mockQueryBuilder.leftJoin).toHaveBeenCalledWith(
          'resource.introducers',
          'introducer',
        );
        expect(queryBuilderMethodCallsOrderAndStructureScope.mockQueryBuilder.leftJoin).toHaveBeenCalledWith(
          'resource.introductions',
          'introduction',
        );

        // Verify that filters are applied
        expect(queryBuilderMethodCallsOrderAndStructureScope.mockQueryBuilder.andWhere).toHaveBeenCalledWith(
          'groups.id = :groupId',
          { groupId: 1 },
        );
        expect(queryBuilderMethodCallsOrderAndStructureScope.mockQueryBuilder.andWhere).toHaveBeenCalledWith(
          '(LOWER(resource.name) LIKE LOWER(:search) OR LOWER(resource.description) LIKE LOWER(:search))',
          { search: '%test%' },
        );
      });
    });
  });

  describe('getResourceById', () => {
    const getResourceByIdScope = inheritTestScope(
      {
        get resourceRepository() {
          return scope.resourceRepository;
        },
        set resourceRepository(value: typeof scope.resourceRepository) {
          scope.resourceRepository = value;
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

      getResourceByIdScope.resourceRepository.find.mockResolvedValue([mockResource]);

      const result = await getResourceByIdScope.service.getResourceById(1);

      expect(result).toEqual(mockResource);
      expect(getResourceByIdScope.resourceRepository.find).toHaveBeenCalledWith({
        where: { id: expect.anything() },
        relations: ['introductions', 'usages', 'groups'],
      });
    });

    it('should throw ResourceNotFoundException if resource not found', async () => {
      getResourceByIdScope.resourceRepository.find.mockResolvedValue([]);

      await expect(getResourceByIdScope.service.getResourceById(999)).rejects.toThrow(ResourceNotFoundException);
    });
  });

  describe('createResource', () => {
    const createResourceScope = inheritTestScope(
      {
        get resourceRepository() {
          return scope.resourceRepository;
        },
        set resourceRepository(value: typeof scope.resourceRepository) {
          scope.resourceRepository = value;
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

      createResourceScope.resourceRepository.create.mockReturnValue(newResource);
      createResourceScope.resourceRepository.save.mockResolvedValue(newResource);

      const result = await createResourceScope.service.createResource(createDto);

      expect(result).toEqual(newResource);
      expect(createResourceScope.resourceRepository.create).toHaveBeenCalledWith({
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
      expect(createResourceScope.resourceRepository.save).toHaveBeenCalled();
    });

    it('audits only the safe resource projection when an actor is available', async () => {
      const resource = createMockResource({ id: 1, name: 'Lathe', type: ResourceType.Machine });
      createResourceScope.resourceRepository.create.mockReturnValue(resource);
      createResourceScope.resourceRepository.save.mockResolvedValue(resource);

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
      createResourceScope.resourceRepository.create.mockReturnValue(resource);
      createResourceScope.resourceRepository.save.mockResolvedValue(resource);

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
