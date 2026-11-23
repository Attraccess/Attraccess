import { Test, TestingModule } from '@nestjs/testing';
import { ResourcesController } from './resources.controller';
import { ResourcesService } from './resources.service';

import { toResourceDto } from './dtos/resource.dto';
import { DocumentationType, ResourceType } from '@attraccess/application-models';
import { createMockResource } from '../test-utils/resource.fixtures';
import { CreateResourceDto } from './dtos/createResource.dto';
import { UpdateResourceDto } from './dtos/updateResource.dto';
import { NotFoundException, type ExecutionContext } from '@nestjs/common';
import { PaginatedResponse } from '../types/response';
import { ResourceImageService } from './resourceImage.service';
import { ResourceActivityVisibilityService } from './usage/authorization/resource-activity-visibility.service';
import { ResourceIntroducersService } from './introducers/resourceIntroducers.service';
import { AuthenticatedRequest, DualAuthGuard } from '@attraccess/plugins-backend-sdk';
import supertest from 'supertest';
import { ResourceListVisibilityService } from './visibility/resource-list-visibility.service';

// Only the documented columns and the relations a read loaded leave the controller, never a whole entity.
type Resource = ReturnType<typeof createMockResource>;
const dto = (resource: Resource, imageFilename = resource.imageFilename) =>
  toResourceDto({ ...resource, imageFilename } as never);

describe('ResourcesController', () => {
  let controller: ResourcesController;
  let service: ResourcesService;
  let listVisibility: { permittedForUserId: jest.Mock };
  const request = { user: { id: 9 } } as AuthenticatedRequest;

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
          provide: ResourceListVisibilityService,
          useValue: { canSee: jest.fn(async () => true), permittedForUserId: jest.fn(async () => undefined) },
        },
        {
          provide: ResourcesService,
          useValue: mockResourcesService,
        },
        {
          provide: ResourceImageService,
          useValue: mockResourceImageService,
        },
        {
          provide: ResourceActivityVisibilityService,
          useValue: {
            resolveMany: jest.fn(async (_user: unknown, ids: number[]) => new Map(ids.map((id) => [id, 'full']))),
            applyToResources: jest.fn((resources: Resource[]) => resources),
          },
        },
        { provide: ResourceIntroducersService, useValue: { canViewAccessLists: jest.fn(async () => true) } },
      ],
    }).compile();

    controller = module.get<ResourcesController>(ResourcesController);
    service = module.get<ResourcesService>(ResourcesService);
    listVisibility = module.get(ResourceListVisibilityService);
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

      // Permission check is the RBAC guard's responsibility; unit tests bypass guards,
      // so only the fields the controller itself uses (user.id) are needed here.
      const result = await controller.getAll({ page: 1, limit: 10 }, {
        user: { id: 1 },
      } as AuthenticatedRequest);

      expect(result).toEqual({
        ...paginatedResponse,
        visibilityScope: 'all',
        data: [dto(resources[0], 'public/path/1/test.jpg')],
      });
      expect(service.listResources).toHaveBeenCalledWith({ page: 1, limit: 10 });
    });
  });

  describe('narrowed to permitted machines (ATT-843)', () => {
    const reader = { user: { id: 7, effectivePermissions: new Set(['resources.read']) } } as AuthenticatedRequest;

    beforeEach(() => {
      listVisibility.permittedForUserId.mockResolvedValue(7);
    });

    it('getAll filters the query to the caller and says the list is narrowed', async () => {
      jest.spyOn(service, 'listResources').mockResolvedValue({ data: [], total: 0, page: 1, limit: 10 });

      const result = await controller.getAll({ page: 1, limit: 10 }, reader);

      expect(listVisibility.permittedForUserId).toHaveBeenCalledWith(reader.user);
      expect(service.listResources).toHaveBeenCalledWith(expect.objectContaining({ permittedForUserId: 7 }));
      expect(result).toEqual({ data: [], total: 0, page: 1, limit: 10, visibilityScope: 'permitted' });
    });

    it('getAllInUse filters every page of the query to the caller', async () => {
      jest.spyOn(service, 'listResources').mockResolvedValue({ data: [], total: 0, page: 1, limit: 100 });

      expect(await controller.getAllInUse(reader)).toEqual([]);

      expect(service.listResources).toHaveBeenCalledWith(
        expect.objectContaining({ onlyInUse: true, permittedForUserId: 7 }),
      );
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

      const result = await controller.getOneById(1, request);

      expect(result).toEqual(dto(resource, 'public/path/1/test.jpg'));
      expect(service.getResourceById).toHaveBeenCalledWith(1);
    });

    it('should throw NotFoundException if resource not found', async () => {
      jest.spyOn(service, 'getResourceById').mockRejectedValue(new NotFoundException());

      await expect(controller.getOneById(999, request)).rejects.toThrow(NotFoundException);
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

      const result = await controller.createOne(createDto, request);

      expect(result).toEqual(dto(newResource));
      expect(service.createResource).toHaveBeenCalledWith(createDto, undefined, request.user);
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

      const result = await controller.updateOne(1, updateDto, request);

      expect(result).toEqual(dto(updatedResource));
      expect(service.updateResource).toHaveBeenCalledWith(1, updateDto, undefined, request.user);
    });

    it('should throw NotFoundException if resource not found', async () => {
      const updateDto: UpdateResourceDto = {
        name: 'Updated Resource',
        type: ResourceType.Machine,
      };

      jest.spyOn(service, 'updateResource').mockRejectedValue(new NotFoundException());

      await expect(controller.updateOne(999, updateDto, request)).rejects.toThrow(NotFoundException);
    });
  });

  describe('deleteOne', () => {
    it('rejects update-only users at the HTTP endpoint and allows delete-authorized users', async () => {
      const permissions = new Set(['resources.update']);
      const module = await Test.createTestingModule({
        controllers: [ResourcesController],
        providers: [
          {
            provide: ResourceListVisibilityService,
            useValue: { canSee: jest.fn(async () => true), permittedForUserId: jest.fn(async () => undefined) },
          },
          { provide: ResourcesService, useValue: service },
          { provide: ResourceImageService, useValue: {} },
          {
            provide: ResourceActivityVisibilityService,
            useValue: {
              resolveMany: jest.fn(async (_user: unknown, ids: number[]) => new Map(ids.map((id) => [id, 'full']))),
              applyToResources: jest.fn((resources: Resource[]) => resources),
            },
          },
          { provide: ResourceIntroducersService, useValue: { canViewAccessLists: jest.fn(async () => true) } },
        ],
      })
        .overrideGuard(DualAuthGuard)
        .useValue({
          canActivate: (context: ExecutionContext) => {
            context.switchToHttp().getRequest().user = { id: 9, effectivePermissions: permissions };
            return true;
          },
        })
        .compile();
      const app = module.createNestApplication();
      await app.init();
      try {
        await supertest(app.getHttpServer()).delete('/resources/1').expect(403);
        expect(service.deleteResource).not.toHaveBeenCalled();
        permissions.clear();
        permissions.add('resources.delete');
        await supertest(app.getHttpServer()).delete('/resources/1').expect(200);
        expect(service.deleteResource).toHaveBeenCalledTimes(1);
        expect(service.deleteResource).toHaveBeenCalledWith(1, expect.objectContaining({ id: 9 }));
      } finally {
        await app.close();
      }
    });

    it('should delete a resource', async () => {
      jest.spyOn(service, 'deleteResource').mockResolvedValue(undefined);

      await controller.deleteOne(1, request);

      expect(service.deleteResource).toHaveBeenCalledWith(1, request.user);
    });

    it('should throw NotFoundException if resource not found', async () => {
      jest.spyOn(service, 'deleteResource').mockRejectedValue(new NotFoundException());

      await expect(controller.deleteOne(999, request)).rejects.toThrow(NotFoundException);
    });
  });
});
