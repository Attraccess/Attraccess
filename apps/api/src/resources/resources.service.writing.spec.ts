/* eslint-disable @typescript-eslint/no-explicit-any */

import { DocumentationType, Resource, ResourceType } from '@attraccess/database-entities';

import { EventEmitter2 } from '@nestjs/event-emitter';

import { Test, TestingModule } from '@nestjs/testing';

import { getRepositoryToken } from '@nestjs/typeorm';

import { randomUUID } from 'node:crypto';

import { Repository } from 'typeorm';

import { projectResourceAuditEvent } from './../audit/audit-policy';

import { AuditService } from './../audit/audit.service';

import { ResourceNotFoundException } from './../exceptions/resource.notFound.exception';

import { LicenseService } from './../license/license.service';

import { MetricsService } from './../metrics/metrics.service';

import { inheritTestScope } from './../test-utils/inherit-test-scope';

import { createMockResource } from './../test-utils/resource.fixtures';

import { UpdateResourceDto } from './dtos/updateResource.dto';

import { ResourceImageService } from './resourceImage.service';

import { ResourcesService } from './resources.service';

import { mockMetricsService } from './resources.service.spec.mock-metrics-service';

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

  describe('updateResource', () => {
    const updateResourceScope = inheritTestScope(
      {
        get service() {
          return scope.service;
        },
        set service(value: typeof scope.service) {
          scope.service = value;
        },
        get resourceRepository() {
          return scope.resourceRepository;
        },
        set resourceRepository(value: typeof scope.resourceRepository) {
          scope.resourceRepository = value;
        },
        get audit() {
          return scope.audit;
        },
        get mockResourceImageService() {
          return scope.mockResourceImageService;
        },
      },
      scope,
    );

    it('should update an existing resource', async () => {
      const resourceId = 1;
      const updateDto: UpdateResourceDto = {
        name: 'Updated Resource',
        type: ResourceType.Machine,
        description: 'Updated Description',
        documentationType: DocumentationType.URL,
        documentationUrl: 'https://example.com/updated',
        metadata: { template: 'default', area: 'A2' },
      };

      const existingResource = createMockResource({
        id: resourceId,
        name: 'Old Resource',
        description: 'Old Description',
        documentationType: DocumentationType.MARKDOWN,
        documentationMarkdown: '# Old Documentation',
        documentationUrl: null,
        imageFilename: null,
      });

      const updatedResource = createMockResource({
        id: resourceId,
        name: updateDto.name,
        description: updateDto.description,
        documentationType: updateDto.documentationType,
        documentationMarkdown: null,
        documentationUrl: updateDto.documentationUrl,
        imageFilename: null,
        maintenances: [],
        metadata: updateDto.metadata ?? null,
      });

      jest.spyOn(updateResourceScope.service, 'getResourceById').mockResolvedValue(existingResource);
      updateResourceScope.resourceRepository.save.mockResolvedValue(updatedResource);

      const result = await updateResourceScope.service.updateResource(resourceId, updateDto);

      expect(result).toEqual(updatedResource);
      expect(updateResourceScope.service.getResourceById).toHaveBeenCalledWith(resourceId);
      expect(updateResourceScope.resourceRepository.save).toHaveBeenCalled();
    });

    it('audits changed safe fields without metadata or documentation', async () => {
      const existingResource = createMockResource({ id: 1, name: 'Old', type: ResourceType.Lock });
      const updatedResource = createMockResource({ id: 1, name: 'New', type: ResourceType.Machine });
      updatedResource.metadata = { password: 'secret' };
      jest.spyOn(updateResourceScope.service, 'getResourceById').mockResolvedValue(existingResource);
      updateResourceScope.resourceRepository.save.mockResolvedValue(updatedResource);

      await updateResourceScope.service.updateResource(
        1,
        { name: 'New', type: ResourceType.Machine, metadata: { password: 'secret' } },
        undefined,
        { id: 9 },
      );

      expect(updateResourceScope.audit.recordResource).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'resource.updated',
          details: {
            'before.name': 'Old',
            'after.name': 'New',
            'before.type': ResourceType.Lock,
            'after.type': ResourceType.Machine,
            changedFields: '["name","type","metadata"]',
          },
        }),
      );
    });

    it('does not audit metadata that only normalized from absent to empty', async () => {
      const existingResource = createMockResource({ id: 1, name: 'Old', metadata: null });
      const updatedResource = createMockResource({ id: 1, name: 'New', metadata: {} });
      jest.spyOn(updateResourceScope.service, 'getResourceById').mockResolvedValue(existingResource);
      updateResourceScope.resourceRepository.save.mockResolvedValue(updatedResource);

      await updateResourceScope.service.updateResource(1, { name: 'New', metadata: {} }, undefined, { id: 9 });

      expect(updateResourceScope.audit.recordResource).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'resource.updated',
          details: { 'before.name': 'Old', 'after.name': 'New', changedFields: '["name"]' },
        }),
      );
    });

    it('bounds both names in a rename audit projection', async () => {
      const existingResource = createMockResource({ id: 1, name: '"'.repeat(5000) });
      const updatedResource = createMockResource({ id: 1, name: '\\'.repeat(5000) + '🚪'.repeat(5000) });
      jest.spyOn(updateResourceScope.service, 'getResourceById').mockResolvedValue(existingResource);
      updateResourceScope.resourceRepository.save.mockResolvedValue(updatedResource);

      await updateResourceScope.service.updateResource(1, { name: updatedResource.name }, undefined, { id: 9 });

      const details = updateResourceScope.audit.recordResource.mock.calls[0][0].details;
      expect(Buffer.byteLength(JSON.stringify(details), 'utf8')).toBeLessThanOrEqual(4096);
      expect(
        projectResourceAuditEvent({
          ...updateResourceScope.audit.recordResource.mock.calls[0][0],
          operationId: randomUUID(),
        }),
      ).not.toBeNull();
    });

    it('audits a non-name update without recording its value', async () => {
      const existingResource = createMockResource({ id: 1, allowTakeOver: false });
      const updatedResource = createMockResource({ id: 1, allowTakeOver: true });
      jest.spyOn(updateResourceScope.service, 'getResourceById').mockResolvedValue(existingResource);
      updateResourceScope.resourceRepository.save.mockResolvedValue(updatedResource);

      await updateResourceScope.service.updateResource(1, { allowTakeOver: true }, undefined, { id: 9 });

      expect(updateResourceScope.audit.recordResource).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'resource.updated',
          details: { changedFields: '["allowTakeOver"]' },
        }),
      );
    });

    it('does not audit an unchanged resubmission', async () => {
      const resource = createMockResource({ id: 1, allowTakeOver: false });
      jest.spyOn(updateResourceScope.service, 'getResourceById').mockResolvedValue(resource);
      updateResourceScope.resourceRepository.save.mockResolvedValue(resource);

      await updateResourceScope.service.updateResource(1, { allowTakeOver: false }, undefined, { id: 9 });

      expect(updateResourceScope.audit.recordResource).not.toHaveBeenCalled();
    });

    it('audits an image-only update without persisting the filename', async () => {
      const resource = createMockResource({ id: 1, imageFilename: null });
      const updatedResource = createMockResource({ id: 1, imageFilename: 'resource-1.png' });
      jest.spyOn(updateResourceScope.service, 'getResourceById').mockResolvedValue(resource);
      updateResourceScope.mockResourceImageService.saveImage.mockResolvedValue('resource-1.png');
      updateResourceScope.resourceRepository.save.mockResolvedValue(updatedResource);

      await updateResourceScope.service.updateResource(1, {}, {} as never, { id: 9 });

      expect(updateResourceScope.audit.recordResource).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'resource.updated',
          details: { changedFields: '["image"]' },
        }),
      );
    });

    it('should throw ResourceNotFoundException if resource not found', async () => {
      const resourceId = 999;
      const updateDto: UpdateResourceDto = {
        name: 'Updated Resource',
        type: ResourceType.Machine,
      };

      jest
        .spyOn(updateResourceScope.service, 'getResourceById')
        .mockRejectedValue(new ResourceNotFoundException(resourceId));

      await expect(updateResourceScope.service.updateResource(resourceId, updateDto)).rejects.toThrow(
        ResourceNotFoundException,
      );
    });
  });

  describe('deleteResource', () => {
    const deleteResourceScope = inheritTestScope(
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

    it('should delete a resource', async () => {
      (deleteResourceScope.resourceRepository.softDelete as jest.Mock).mockResolvedValue({
        affected: 1,
        raw: {},
        generatedMaps: [],
      });

      await deleteResourceScope.service.deleteResource(1);

      expect(deleteResourceScope.resourceRepository.softDelete).toHaveBeenCalledWith(1);
    });

    it('audits deletion with the pre-delete safe projection', async () => {
      const resource = createMockResource({ id: 1, name: 'Lathe', type: ResourceType.Machine });
      jest.spyOn(deleteResourceScope.service, 'getResourceById').mockResolvedValue(resource);
      deleteResourceScope.resourceRepository.softDelete.mockResolvedValue({ affected: 1 } as never);

      await deleteResourceScope.service.deleteResource(1, { id: 9 });

      expect(deleteResourceScope.audit.recordResource).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'resource.deleted',
          actorId: 9,
          details: { 'before.name': 'Lathe', 'before.type': ResourceType.Machine },
        }),
      );
    });

    it('bounds an oversized resource name in a deletion audit projection', async () => {
      const resource = createMockResource({
        id: 1,
        name: '\0'.repeat(5000) + '🙂'.repeat(5000),
        type: ResourceType.Machine,
      });
      jest.spyOn(deleteResourceScope.service, 'getResourceById').mockResolvedValue(resource);
      deleteResourceScope.resourceRepository.softDelete.mockResolvedValue({ affected: 1 } as never);

      await deleteResourceScope.service.deleteResource(1, { id: 9 });

      const details = deleteResourceScope.audit.recordResource.mock.calls[0][0].details;
      expect(details['before.name']).toMatch(/\.\.\.$/);
      expect(Buffer.byteLength(JSON.stringify(details), 'utf8')).toBeLessThanOrEqual(4096);
      expect(
        projectResourceAuditEvent({
          ...deleteResourceScope.audit.recordResource.mock.calls[0][0],
          operationId: randomUUID(),
        }),
      ).not.toBeNull();
    });

    it('should throw ResourceNotFoundException if resource not found', async () => {
      (deleteResourceScope.resourceRepository.softDelete as jest.Mock).mockResolvedValue({
        affected: 0,
        raw: {},
        generatedMaps: [],
      });

      await expect(deleteResourceScope.service.deleteResource(999)).rejects.toThrow(ResourceNotFoundException);
    });
  });
});
