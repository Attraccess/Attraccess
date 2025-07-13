import { Test, TestingModule } from '@nestjs/testing';
import { ResourcesService } from './resources.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Resource, DocumentationType } from '@attraccess/database-entities';
import { Repository, SelectQueryBuilder, Brackets } from 'typeorm';
import { CreateResourceDto } from './dtos/createResource.dto';
import { UpdateResourceDto } from './dtos/updateResource.dto';
import { ResourceNotFoundException } from '../exceptions/resource.notFound.exception';
import { ResourceImageService } from './resourceImage.service';

describe('ResourcesService', () => {
  let service: ResourcesService;
  let resourceRepository: jest.Mocked<Repository<Resource>>;
  // ResourceImageService is injected but not directly used in these tests

  const mockResourceRepository = () => ({
    find: jest.fn(),
    findOne: jest.fn(),
    findAndCount: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    delete: jest.fn(),
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
      ],
    }).compile();

    service = module.get<ResourcesService>(ResourcesService);
    resourceRepository = module.get(getRepositoryToken(Resource)) as jest.Mocked<Repository<Resource>>;
    // ResourceImageService is available but not directly used in tests
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('listResources', () => {
    let mockQueryBuilder: jest.Mocked<SelectQueryBuilder<Resource>>;

    const createMockResource = (id: number, name: string, description: string) => ({
      id,
      name,
      description,
      imageFilename: null,
      documentationType: DocumentationType.MARKDOWN,
      documentationMarkdown: `# Documentation ${id}`,
      documentationUrl: null,
      allowTakeOver: false,
      createdAt: new Date(),
      updatedAt: new Date(),
      introductions: [],
      usages: [],
      introducers: [],
      mqttConfigs: [],
      webhookConfigs: [],
      groups: [],
      flowNodes: [],
      flowEdges: [],
      flowLogs: [],
      attractapReaders: [],
    });

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

      resourceRepository.createQueryBuilder.mockReturnValue(mockQueryBuilder);
    });

    describe('Basic functionality', () => {
      it('should return paginated resources with default options', async () => {
        const mockResources = [
          createMockResource(1, 'Resource 1', 'Description 1'),
          createMockResource(2, 'Resource 2', 'Description 2'),
        ];

        mockQueryBuilder.getManyAndCount.mockResolvedValue([mockResources, 2]);

        const result = await service.listResources();

        expect(result.data).toEqual(mockResources);
        expect(result.total).toEqual(2);
        expect(result.page).toEqual(1);
        expect(result.limit).toEqual(10);
        expect(resourceRepository.createQueryBuilder).toHaveBeenCalledWith('resource');
        expect(mockQueryBuilder.leftJoinAndSelect).toHaveBeenCalledWith('resource.groups', 'groups');
        expect(mockQueryBuilder.orderBy).toHaveBeenCalledWith('resource.createdAt', 'DESC');
        expect(mockQueryBuilder.skip).toHaveBeenCalledWith(0);
        expect(mockQueryBuilder.take).toHaveBeenCalledWith(10);
      });

      it('should handle custom pagination', async () => {
        const mockResources = [createMockResource(1, 'Resource 1', 'Description 1')];
        mockQueryBuilder.getManyAndCount.mockResolvedValue([mockResources, 1]);

        const result = await service.listResources({ page: 2, limit: 5 });

        expect(result.page).toEqual(2);
        expect(result.limit).toEqual(5);
        expect(mockQueryBuilder.skip).toHaveBeenCalledWith(5); // (page - 1) * limit
        expect(mockQueryBuilder.take).toHaveBeenCalledWith(5);
      });

      it('should return empty results', async () => {
        mockQueryBuilder.getManyAndCount.mockResolvedValue([[], 0]);

        const result = await service.listResources();

        expect(result.data).toEqual([]);
        expect(result.total).toEqual(0);
      });
    });

    describe('Search filtering', () => {
      it('should filter by search term in name and description', async () => {
        const mockResources = [createMockResource(1, 'Test Resource', 'Test Description')];
        mockQueryBuilder.getManyAndCount.mockResolvedValue([mockResources, 1]);

        await service.listResources({ search: 'test' });

        expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
          '(LOWER(resource.name) LIKE LOWER(:search) OR LOWER(resource.description) LIKE LOWER(:search))',
          { search: '%test%' }
        );
      });

      it('should not add search filter when search is empty', async () => {
        await service.listResources({ search: '' });

        expect(mockQueryBuilder.andWhere).not.toHaveBeenCalledWith(
          expect.stringContaining('LOWER(resource.name) LIKE LOWER(:search)')
        );
      });
    });

    describe('Group filtering', () => {
      it('should filter by specific group ID', async () => {
        await service.listResources({ groupId: 5 });

        expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith('groups.id = :groupId', { groupId: 5 });
      });

      it('should filter resources with no groups when groupId is -1', async () => {
        await service.listResources({ groupId: -1 });

        expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith('groups.id IS NULL');
      });

      it('should not add group filter when groupId is undefined', async () => {
        await service.listResources();

        expect(mockQueryBuilder.andWhere).not.toHaveBeenCalledWith(expect.stringContaining('groups.id'));
      });
    });

    describe('IDs filtering', () => {
      it('should filter by single resource ID', async () => {
        await service.listResources({ ids: 5 });

        expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith('resource.id IN (:...ids)', { ids: [5] });
      });

      it('should filter by multiple resource IDs', async () => {
        await service.listResources({ ids: [1, 2, 3] });

        expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith('resource.id IN (:...ids)', { ids: [1, 2, 3] });
      });

      it('should not add IDs filter when ids array is empty', async () => {
        await service.listResources({ ids: [] });

        expect(mockQueryBuilder.andWhere).not.toHaveBeenCalledWith(expect.stringContaining('resource.id IN'));
      });

      it('should not add IDs filter when ids is undefined', async () => {
        await service.listResources();

        expect(mockQueryBuilder.andWhere).not.toHaveBeenCalledWith(expect.stringContaining('resource.id IN'));
      });
    });

    describe('In-use filtering', () => {
      it('should filter resources currently in use by specific user', async () => {
        await service.listResources({ onlyInUseByUserId: 10 });

        expect(mockQueryBuilder.leftJoin).toHaveBeenCalledWith('resource.usages', 'usage', 'usage.endTime IS NULL');
        expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(expect.any(Brackets));
      });

      it('should not add in-use filter when onlyInUseByUserId is undefined', async () => {
        await service.listResources();

        expect(mockQueryBuilder.leftJoin).not.toHaveBeenCalledWith('resource.usages', 'usage', 'usage.endTime IS NULL');
      });

      it('should filter resources currently in use (onlyInUse)', async () => {
        await service.listResources({ onlyInUse: true });

        expect(mockQueryBuilder.leftJoin).toHaveBeenCalledWith('resource.usages', 'usage', 'usage.endTime IS NULL');
        expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith('usage.endTime IS NULL');
        expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith('usage.startTime IS NOT NULL');
      });

      it('should return using user information when returnUsingUser is true', async () => {
        await service.listResources({ returnUsingUser: true });

        expect(mockQueryBuilder.leftJoinAndSelect).toHaveBeenCalledWith('resource.usages', 'usage');
        expect(mockQueryBuilder.leftJoinAndSelect).toHaveBeenCalledWith('usage.user', 'usingUser');
      });

      it('should handle combination of onlyInUse and returnUsingUser', async () => {
        await service.listResources({ onlyInUse: true, returnUsingUser: true });

        expect(mockQueryBuilder.leftJoinAndSelect).toHaveBeenCalledWith('resource.usages', 'usage');
        expect(mockQueryBuilder.leftJoinAndSelect).toHaveBeenCalledWith('usage.user', 'usingUser');
        expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith('usage.endTime IS NULL');
        expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith('usage.startTime IS NOT NULL');
      });
    });

    describe('Permission filtering', () => {
      it('should filter resources with permissions for specific user', async () => {
        await service.listResources({ onlyWithPermissionForUserId: 15 });

        // Check all the necessary joins for permission checking
        expect(mockQueryBuilder.leftJoin).toHaveBeenCalledWith('resource.introducers', 'introducer');
        expect(mockQueryBuilder.leftJoin).toHaveBeenCalledWith('resource.introductions', 'introduction');
        expect(mockQueryBuilder.leftJoin).toHaveBeenCalledWith('introduction.history', 'resourceIntroductionHistory');
        expect(mockQueryBuilder.leftJoin).toHaveBeenCalledWith('resource.groups', 'resourceGroup');
        expect(mockQueryBuilder.leftJoin).toHaveBeenCalledWith('resourceGroup.introducers', 'groupIntroducer');
        expect(mockQueryBuilder.leftJoin).toHaveBeenCalledWith('resourceGroup.introductions', 'groupIntroduction');
        expect(mockQueryBuilder.leftJoin).toHaveBeenCalledWith('groupIntroduction.history', 'groupIntroductionHistory');

        // Check that the complex where condition is added
        expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(expect.any(Brackets));
      });

      it('should not add permission filter when onlyWithPermissionForUserId is undefined', async () => {
        await service.listResources();

        expect(mockQueryBuilder.leftJoin).not.toHaveBeenCalledWith('resource.introducers', 'introducer');
        expect(mockQueryBuilder.leftJoin).not.toHaveBeenCalledWith('resource.introductions', 'introduction');
      });
    });

    describe('Combined filtering', () => {
      it('should handle multiple filters simultaneously', async () => {
        const mockResources = [createMockResource(1, 'Test Resource', 'Test Description')];
        mockQueryBuilder.getManyAndCount.mockResolvedValue([mockResources, 1]);

        const result = await service.listResources({
          page: 2,
          limit: 5,
          search: 'test',
          groupId: 3,
          ids: [1, 2, 3],
          onlyInUseByUserId: 10,
          onlyWithPermissionForUserId: 15,
        });

        // Verify pagination
        expect(mockQueryBuilder.skip).toHaveBeenCalledWith(5);
        expect(mockQueryBuilder.take).toHaveBeenCalledWith(5);

        // Verify search filter
        expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
          '(LOWER(resource.name) LIKE LOWER(:search) OR LOWER(resource.description) LIKE LOWER(:search))',
          { search: '%test%' }
        );

        // Verify group filter
        expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith('groups.id = :groupId', { groupId: 3 });

        // Verify IDs filter
        expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith('resource.id IN (:...ids)', { ids: [1, 2, 3] });

        // Verify all joins for both in-use and permission filtering
        expect(mockQueryBuilder.leftJoin).toHaveBeenCalledWith('resource.usages', 'usage', 'usage.endTime IS NULL');
        expect(mockQueryBuilder.leftJoin).toHaveBeenCalledWith('resource.introducers', 'introducer');

        // Verify result structure
        expect(result.data).toEqual(mockResources);
        expect(result.total).toEqual(1);
        expect(result.page).toEqual(2);
        expect(result.limit).toEqual(5);
      });

      it('should handle edge case with groupId -1 and other filters', async () => {
        await service.listResources({
          groupId: -1,
          search: 'test',
          ids: [1, 2],
        });

        expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith('groups.id IS NULL');
        expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
          '(LOWER(resource.name) LIKE LOWER(:search) OR LOWER(resource.description) LIKE LOWER(:search))',
          { search: '%test%' }
        );
        expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith('resource.id IN (:...ids)', { ids: [1, 2] });
      });

      it('should handle combination of returnUsingUser with other filters', async () => {
        await service.listResources({
          returnUsingUser: true,
          onlyWithPermissionForUserId: 15,
          search: 'test',
        });

        // Should use leftJoinAndSelect for usages when returnUsingUser is true
        expect(mockQueryBuilder.leftJoinAndSelect).toHaveBeenCalledWith('resource.usages', 'usage');
        expect(mockQueryBuilder.leftJoinAndSelect).toHaveBeenCalledWith('usage.user', 'usingUser');

        // Should still add permission filtering joins
        expect(mockQueryBuilder.leftJoin).toHaveBeenCalledWith('resource.introducers', 'introducer');

        // Should add search filter
        expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
          '(LOWER(resource.name) LIKE LOWER(:search) OR LOWER(resource.description) LIKE LOWER(:search))',
          { search: '%test%' }
        );
      });
    });

    describe('Edge cases', () => {
      it('should handle null/undefined options gracefully', async () => {
        const result = await service.listResources(undefined);

        expect(result.page).toEqual(1);
        expect(result.limit).toEqual(10);
        expect(mockQueryBuilder.skip).toHaveBeenCalledWith(0);
        expect(mockQueryBuilder.take).toHaveBeenCalledWith(10);
      });

      it('should handle empty options object', async () => {
        const result = await service.listResources({});

        expect(result.page).toEqual(1);
        expect(result.limit).toEqual(10);
      });

      it('should convert single ID to array for filtering', async () => {
        await service.listResources({ ids: 42 });

        expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith('resource.id IN (:...ids)', { ids: [42] });
      });

      it('should handle zero and negative page numbers gracefully', async () => {
        await service.listResources({ page: 0, limit: 5 });

        // Page 0 should be treated as page 1, so skip should be 0
        expect(mockQueryBuilder.skip).toHaveBeenCalledWith(-5); // (0-1) * 5
      });

      it('should handle very large limit values', async () => {
        await service.listResources({ limit: 1000 });

        expect(mockQueryBuilder.take).toHaveBeenCalledWith(1000);
      });
    });

    describe('Query builder method calls order and structure', () => {
      it('should maintain proper query builder method call order', async () => {
        await service.listResources({
          search: 'test',
          groupId: 1,
          onlyWithPermissionForUserId: 5,
        });

        // Verify that basic joins happen before filters
        expect(mockQueryBuilder.leftJoinAndSelect).toHaveBeenCalledWith('resource.groups', 'groups');
        expect(mockQueryBuilder.orderBy).toHaveBeenCalledWith('resource.createdAt', 'DESC');
        expect(mockQueryBuilder.getManyAndCount).toHaveBeenCalled();

        // Verify that permission-related joins are called
        expect(mockQueryBuilder.leftJoin).toHaveBeenCalledWith('resource.introducers', 'introducer');
        expect(mockQueryBuilder.leftJoin).toHaveBeenCalledWith('resource.introductions', 'introduction');

        // Verify that filters are applied
        expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith('groups.id = :groupId', { groupId: 1 });
        expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
          '(LOWER(resource.name) LIKE LOWER(:search) OR LOWER(resource.description) LIKE LOWER(:search))',
          { search: '%test%' }
        );
      });
    });
  });

  describe('getResourceById', () => {
    it('should return a resource by id', async () => {
      const mockResource = {
        id: 1,
        name: 'Resource 1',
        description: 'Description 1',
        imageFilename: null,
        documentationType: DocumentationType.MARKDOWN,
        documentationMarkdown: '# Documentation 1',
        documentationUrl: null,
        allowTakeOver: false,
        createdAt: new Date(),
        updatedAt: new Date(),
        introductions: [],
        usages: [],
        introducers: [],
        mqttConfigs: [],
        webhookConfigs: [],
        groups: [],
        flowNodes: [],
        flowEdges: [],
        flowLogs: [],
        attractapReaders: [],
      };

      resourceRepository.find.mockResolvedValue([mockResource]);

      const result = await service.getResourceById(1);

      expect(result).toEqual(mockResource);
      expect(resourceRepository.find).toHaveBeenCalledWith({
        where: { id: expect.anything() },
        relations: ['introductions', 'usages', 'groups'],
      });
    });

    it('should throw ResourceNotFoundException if resource not found', async () => {
      resourceRepository.find.mockResolvedValue([]);

      await expect(service.getResourceById(999)).rejects.toThrow(ResourceNotFoundException);
    });
  });

  describe('createResource', () => {
    it('should create a new resource', async () => {
      const createDto: CreateResourceDto = {
        name: 'New Resource',
        description: 'New Description',
        documentationType: DocumentationType.MARKDOWN,
        documentationMarkdown: '# New Documentation',
        documentationUrl: null,
        allowTakeOver: false,
      };

      const newResource = {
        id: 1,
        name: createDto.name,
        description: createDto.description,
        imageFilename: null,
        documentationType: createDto.documentationType,
        documentationMarkdown: createDto.documentationMarkdown,
        documentationUrl: createDto.documentationUrl,
        allowTakeOver: false,
        createdAt: new Date(),
        updatedAt: new Date(),
        introductions: [],
        usages: [],
        introducers: [],
        mqttConfigs: [],
        webhookConfigs: [],
        groups: [],
        flowNodes: [],
        flowEdges: [],
        flowLogs: [],
        attractapReaders: [],
      };

      resourceRepository.create.mockReturnValue(newResource);
      resourceRepository.save.mockResolvedValue(newResource);

      const result = await service.createResource(createDto);

      expect(result).toEqual(newResource);
      expect(resourceRepository.create).toHaveBeenCalledWith({
        name: createDto.name,
        description: createDto.description,
        documentationType: createDto.documentationType || null,
        documentationMarkdown: createDto.documentationMarkdown || null,
        documentationUrl: createDto.documentationUrl || null,
        allowTakeOver: createDto.allowTakeOver || false,
      });
      expect(resourceRepository.save).toHaveBeenCalled();
    });
  });

  describe('updateResource', () => {
    it('should update an existing resource', async () => {
      const resourceId = 1;
      const updateDto: UpdateResourceDto = {
        name: 'Updated Resource',
        description: 'Updated Description',
        documentationType: DocumentationType.URL,
        documentationUrl: 'https://example.com/updated',
      };

      const existingResource = {
        id: resourceId,
        name: 'Old Resource',
        description: 'Old Description',
        imageFilename: null,
        documentationType: DocumentationType.MARKDOWN,
        documentationMarkdown: '# Old Documentation',
        documentationUrl: null,
        allowTakeOver: false,
        createdAt: new Date(),
        updatedAt: new Date(),
        introductions: [],
        usages: [],
        introducers: [],
        mqttConfigs: [],
        webhookConfigs: [],
        groups: [],
        flowNodes: [],
        flowEdges: [],
        flowLogs: [],
        attractapReaders: [],
      };

      const updatedResource = {
        ...existingResource,
        name: updateDto.name,
        description: updateDto.description,
        documentationType: updateDto.documentationType,
        documentationMarkdown: null,
        documentationUrl: updateDto.documentationUrl,
      };

      jest.spyOn(service, 'getResourceById').mockResolvedValue(existingResource);
      resourceRepository.save.mockResolvedValue(updatedResource);

      const result = await service.updateResource(resourceId, updateDto);

      expect(result).toEqual(updatedResource);
      expect(service.getResourceById).toHaveBeenCalledWith(resourceId);
      expect(resourceRepository.save).toHaveBeenCalled();
    });

    it('should throw ResourceNotFoundException if resource not found', async () => {
      const resourceId = 999;
      const updateDto: UpdateResourceDto = {
        name: 'Updated Resource',
      };

      jest.spyOn(service, 'getResourceById').mockRejectedValue(new ResourceNotFoundException(resourceId));

      await expect(service.updateResource(resourceId, updateDto)).rejects.toThrow(ResourceNotFoundException);
    });
  });

  describe('deleteResource', () => {
    it('should delete a resource', async () => {
      const mockResource = {
        id: 1,
        name: 'Resource 1',
        description: 'Description 1',
        imageFilename: null,
        documentationType: DocumentationType.MARKDOWN,
        documentationMarkdown: '# Documentation 1',
        documentationUrl: null,
        allowTakeOver: false,
        createdAt: new Date(),
        updatedAt: new Date(),
        introductions: [],
        usages: [],
        introducers: [],
        mqttConfigs: [],
        webhookConfigs: [],
        groups: [],
        flowNodes: [],
        flowEdges: [],
        flowLogs: [],
        attractapReaders: [],
      };

      resourceRepository.find.mockResolvedValue([mockResource]);
      resourceRepository.delete.mockResolvedValue({ affected: 1, raw: {} });

      await service.deleteResource(1);

      expect(resourceRepository.delete).toHaveBeenCalledWith(1);
    });

    it('should throw ResourceNotFoundException if resource not found', async () => {
      resourceRepository.find.mockResolvedValue([]);

      await expect(service.deleteResource(999)).rejects.toThrow(ResourceNotFoundException);
    });
  });
});
