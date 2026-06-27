import { Test, TestingModule } from '@nestjs/testing';
import { ResourcesController } from './resources.controller';
import { ResourcesService } from './resources.service';
import { Resource, DocumentationType, ResourceType } from '@attraccess/database-entities';
import { createMockResource } from '../test-utils/resource.fixtures';
import { CreateResourceDto } from './dtos/createResource.dto';
import { UpdateResourceDto } from './dtos/updateResource.dto';
import { NotFoundException } from '@nestjs/common';
import { PaginatedResponse } from '../types/response';
import { ResourceImageService } from './resourceImage.service';
import { AuthenticatedRequest } from '@attraccess/plugins-backend-sdk';

describe('ResourcesController', () => {
  let controller: ResourcesController;
  let service: ResourcesService;

  beforeEach(async () => {
    const mockResourcesService = {
      listResources: jest.fn(),
      getResourceById: jest.fn(),
      createResource: jest.fn(),
      updateResource: jest.fn(),
      deleteResource: jest.fn(),
    };

    const mockResourceImageService = {
      getPublicPath: jest.fn((id, filename) => (filename ? `public/path/${id}/${filename}` : null)),
      saveImage: jest.fn(),
      deleteImage: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ResourcesController],
      providers: [
        {
          provide: ResourcesService,
          useValue: mockResourcesService,
        },
        {
          provide: ResourceImageService,
          useValue: mockResourceImageService,
        },
      ],
    }).compile();

    controller = module.get<ResourcesController>(ResourcesController);
    service = module.get<ResourcesService>(ResourcesService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('getAll', () => {
    it('should return paginated resources', async () => {
      const resources: Resource[] = [
        createMockResource({
          id: 1,
          name: 'Test Resource',
          description: 'Test Description',
          imageFilename: 'test.jpg',
        }),
      ];

      const paginatedResponse: PaginatedResponse<Resource> = {
        data: resources,
        total: 1,
        page: 1,
        limit: 10,
      };

      jest.spyOn(service, 'listResources').mockResolvedValue(paginatedResponse);

      const result = await controller.getAll({ page: 1, limit: 10 }, {
        user: { id: 1 },
      } as AuthenticatedRequest);

      expect(result).toEqual({
        ...paginatedResponse,
        data: [
          {
            ...resources[0],
            imageFilename: 'public/path/1/test.jpg',
          },
        ],
      });
      expect(service.listResources).toHaveBeenCalledWith({ page: 1, limit: 10 });
    });
  });

  describe('getOneById', () => {
    it('should return a resource by id', async () => {
      const resource: Resource = createMockResource({
        id: 1,
        name: 'Test Resource',
        description: 'Test Description',
        imageFilename: 'test.jpg',
      });

      jest.spyOn(service, 'getResourceById').mockResolvedValue(resource);

      const result = await controller.getOneById(1);

      expect(result).toEqual({
        ...resource,
        imageFilename: 'public/path/1/test.jpg',
      });
      expect(service.getResourceById).toHaveBeenCalledWith(1);
    });

    it('should throw NotFoundException if resource not found', async () => {
      jest.spyOn(service, 'getResourceById').mockRejectedValue(new NotFoundException());

      await expect(controller.getOneById(999)).rejects.toThrow(NotFoundException);
    });
  });

  describe('createOne', () => {
    it('should create a new resource', async () => {
      const createDto: CreateResourceDto = {
        name: 'New Resource',
        type: ResourceType.Machine,
        description: 'New Description',
        documentationType: DocumentationType.URL,
        documentationUrl: 'https://example.com/docs',
        documentationMarkdown: null,
      };

      const newResource: Resource = createMockResource({
        id: 1,
        name: createDto.name,
        description: createDto.description,
        documentationType: createDto.documentationType,
        documentationMarkdown: createDto.documentationMarkdown,
        documentationUrl: createDto.documentationUrl,
        imageFilename: null,
      });

      jest.spyOn(service, 'createResource').mockResolvedValue(newResource);

      const result = await controller.createOne(createDto);

      expect(result).toEqual(newResource);
      expect(service.createResource).toHaveBeenCalledWith(createDto, undefined);
    });
  });

  describe('updateOne', () => {
    it('should update an existing resource', async () => {
      const updateDto: UpdateResourceDto = {
        name: 'Updated Resource',
        type: ResourceType.Machine,
        description: 'Updated Description',
        documentationType: DocumentationType.MARKDOWN,
        documentationMarkdown: '# Updated Documentation\n\nThis is updated documentation.',
        documentationUrl: null,
      };

      const updatedResource: Resource = createMockResource({
        id: 1,
        name: updateDto.name as string,
        description: updateDto.description as string,
        documentationType: updateDto.documentationType as DocumentationType,
        documentationMarkdown: updateDto.documentationMarkdown,
        documentationUrl: updateDto.documentationUrl,
        imageFilename: null,
        deletedAt: null as unknown as Date,
      });

      jest.spyOn(service, 'updateResource').mockResolvedValue(updatedResource);

      const result = await controller.updateOne(1, updateDto);

      expect(result).toEqual(updatedResource);
      expect(service.updateResource).toHaveBeenCalledWith(1, updateDto, undefined);
    });

    it('should throw NotFoundException if resource not found', async () => {
      const updateDto: UpdateResourceDto = {
        name: 'Updated Resource',
        type: ResourceType.Machine,
      };

      jest.spyOn(service, 'updateResource').mockRejectedValue(new NotFoundException());

      await expect(controller.updateOne(999, updateDto)).rejects.toThrow(NotFoundException);
    });
  });

  describe('deleteOne', () => {
    it('should delete a resource', async () => {
      jest.spyOn(service, 'deleteResource').mockResolvedValue(undefined);

      await controller.deleteOne(1);

      expect(service.deleteResource).toHaveBeenCalledWith(1);
    });

    it('should throw NotFoundException if resource not found', async () => {
      jest.spyOn(service, 'deleteResource').mockRejectedValue(new NotFoundException());

      await expect(controller.deleteOne(999)).rejects.toThrow(NotFoundException);
    });
  });
});
