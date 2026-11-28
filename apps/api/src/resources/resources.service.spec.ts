import { AUDIT_RECORDER } from '../audit/recorder/audit-event';

import { DocumentationType, ResourceType, SupervisionMode } from '@attraccess/application-models';

import { ForbiddenException } from '@nestjs/common';

import { EventEmitter2 } from '@nestjs/event-emitter';

import { Test, TestingModule } from '@nestjs/testing';

import { projectAuditRow } from './../audit/recorder/audit-row';

import { ResourceNotFoundException } from './../exceptions/resource.notFound.exception';

import { LicenseError, LicenseService } from './../license/license.service';

import { MetricsService } from './../metrics/metrics.service';

import { createMockResource } from './../test-utils/resource.fixtures';

import { CreateResourceDto } from './dtos/createResource.dto';

import { ResourceImageService } from './resourceImage.service';

import { ResourcesService } from './resources.service';

import { mockMetricsService } from './resources.service.spec.mock-metrics-service';

import { RESOURCE_STORE } from './resource-store.port';

describe('ResourcesService', () => {
  let service: ResourcesService;

  let store: Record<string, jest.Mock>;

  const audit = { record: jest.fn().mockResolvedValue(undefined) };

  const mockResourceImageService = {
    saveImage: jest.fn(),
    deleteImage: jest.fn(),
    getPublicPath: jest.fn(),
  };

  const license = { verifyLicense: jest.fn() };

  beforeEach(async () => {
    store = {
      findDetailed: jest.fn(),
      list: jest.fn().mockResolvedValue({ data: [], total: 0 }),
      count: jest.fn().mockResolvedValue(0),
      create: jest.fn(),
      save: jest.fn(),
      setImageFilename: jest.fn().mockResolvedValue(undefined),
      hardDelete: jest.fn().mockResolvedValue(undefined),
      softDelete: jest.fn(),
      countFlowParts: jest.fn(),
    };
    license.verifyLicense.mockReset().mockResolvedValue({ valid: true, payload: { cfg: {} } });
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ResourcesService,
        { provide: RESOURCE_STORE, useValue: store },
        { provide: ResourceImageService, useValue: mockResourceImageService },
        { provide: LicenseService, useValue: license },
        { provide: EventEmitter2, useValue: { emit: jest.fn() } },
        { provide: MetricsService, useValue: mockMetricsService },
        { provide: AUDIT_RECORDER, useValue: audit },
      ],
    }).compile();

    service = module.get<ResourcesService>(ResourcesService);
    audit.record.mockClear();
  });

  it('creates a resource with uploaded image and records actor attribution after persistence', async () => {
    const resource = createMockResource({ id: 8, name: 'Lathe', type: ResourceType.Machine });
    store.count.mockResolvedValue(2);
    store.create.mockResolvedValue(resource);
    mockResourceImageService.saveImage.mockResolvedValue('image.webp');
    const file = { buffer: Buffer.from('image') };
    const result = await service.createResource(
      { name: 'Lathe', type: ResourceType.Machine } as CreateResourceDto,
      file as never,
      {
        id: 7,
        authenticationMethod: 'api-token',
        apiTokenId: 9,
      },
    );
    expect(result.imageFilename).toBe('image.webp');
    expect(mockResourceImageService.saveImage).toHaveBeenCalledWith(8, file);
    expect(store.setImageFilename).toHaveBeenCalledWith(8, 'image.webp');
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        domain: 'resource',
        action: 'resource.created',
        actor: expect.objectContaining({ id: 7, apiTokenId: 9 }),
        subject: expect.objectContaining({ id: 8 }),
      }),
    );
  });

  it('removes the new resource if persisting its image filename fails', async () => {
    store.count.mockResolvedValue(2);
    store.create.mockResolvedValue(createMockResource({ id: 8 }));
    store.setImageFilename.mockRejectedValue(new Error('image metadata write failed'));
    mockResourceImageService.saveImage.mockResolvedValue('image.webp');
    await expect(
      service.createResource(
        { name: 'Lathe', type: ResourceType.Machine } as CreateResourceDto,
        {
          buffer: Buffer.from('image'),
        } as never,
      ),
    ).rejects.toThrow('image metadata write failed');
    expect(store.hardDelete).toHaveBeenCalledWith(8);
    expect(audit.record).not.toHaveBeenCalled();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('blocks creation when the license resource limit is reached', async () => {
    store.count.mockResolvedValue(5);
    license.verifyLicense.mockRejectedValue(new LicenseError('Resource limit reached'));
    await expect(
      service.createResource({ name: 'Lathe', type: ResourceType.Machine } as CreateResourceDto),
    ).rejects.toThrow(ForbiddenException);
    expect(license.verifyLicense).toHaveBeenCalledWith({ usageLimits: { resources: 5 } });
    expect(store.create).not.toHaveBeenCalled();
  });

  describe('listResources', () => {
    it('passes the defaults, a single id as a list and the filters to the store', async () => {
      store.list.mockResolvedValue({ data: [createMockResource({ id: 1 })], total: 1 });

      const result = await service.listResources({ ids: 4, search: 'laser', groupId: -1, onlyInUse: true });

      expect(store.list).toHaveBeenCalledWith({
        page: 1,
        limit: 10,
        ids: [4],
        search: 'laser',
        groupId: -1,
        onlyInUse: true,
      });
      expect(result).toEqual({ data: [expect.objectContaining({ id: 1 })], total: 1, page: 1, limit: 10 });
    });

    it('accepts missing options and keeps a custom page window', async () => {
      await service.listResources();
      expect(store.list).toHaveBeenLastCalledWith({ page: 1, limit: 10, ids: undefined });
      expect(await service.listResources({ page: 3, limit: 5, onlyWithPermissionForUserId: 7 })).toMatchObject({
        page: 3,
        limit: 5,
      });
      expect(store.list).toHaveBeenLastCalledWith({
        page: 3,
        limit: 5,
        onlyWithPermissionForUserId: 7,
        ids: undefined,
      });
    });
  });

  describe('getResourceById', () => {
    it('should return a resource by id', async () => {
      const mockResource = createMockResource({
        id: 1,
        name: 'Resource 1',
        description: 'Description 1',
        documentationMarkdown: '# Documentation 1',
      });
      store.findDetailed.mockResolvedValue([mockResource]);

      const result = await service.getResourceById(1);

      expect(result).toEqual(mockResource);
      expect(store.findDetailed).toHaveBeenCalledWith([1]);
    });

    it('answers a list of ids with the resources and an empty list without asking the store', async () => {
      store.findDetailed.mockResolvedValue([createMockResource({ id: 1 }), createMockResource({ id: 2 })]);
      expect(await service.getResourceById([1, 2])).toHaveLength(2);
      store.findDetailed.mockClear();
      expect(await service.getResourceById([])).toEqual([]);
      expect(await service.getResourceById(Array.of() as number[])).toEqual([]);
      expect(store.findDetailed).not.toHaveBeenCalled();
    });

    it('should throw ResourceNotFoundException if resource not found', async () => {
      store.findDetailed.mockResolvedValue([]);

      await expect(service.getResourceById(999)).rejects.toThrow(ResourceNotFoundException);
      store.findDetailed.mockResolvedValue([createMockResource({ id: 1 })]);
      await expect(service.getResourceById([1, 2])).rejects.toThrow(ResourceNotFoundException);
    });
  });

  describe('createResource', () => {
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

      const newResource = createMockResource({ id: 1, name: createDto.name });
      store.create.mockResolvedValue(newResource);

      const result = await service.createResource(createDto);

      expect(result).toEqual(newResource);
      expect(store.create).toHaveBeenCalledWith({
        name: createDto.name,
        type: createDto.type,
        description: createDto.description,
        documentationType: createDto.documentationType || null,
        documentationMarkdown: createDto.documentationMarkdown || null,
        documentationUrl: createDto.documentationUrl || null,
        allowTakeOver: createDto.allowTakeOver || false,
        // On unless the creator says otherwise.
        askMaintenanceCheckOnSessionEnd: true,
        maxParallelSessions: createDto.maxParallelSessions ?? 1,
        maxSessionDurationMinutes: null,
        requireSessionDurationEstimate: false,
        defaultSessionDurationEstimateMinutes: null,
        separateUnlockAndUnlatch: false,
        accessOnly: false,
        metadata: createDto.metadata ?? null,
        retrainingMaxAgeDays: createDto.retrainingMaxAgeDays ?? null,
        retrainingMaxInactivityDays: createDto.retrainingMaxInactivityDays ?? null,
        retrainingBlocksAccess: createDto.retrainingBlocksAccess ?? false,
        supervisionMode: SupervisionMode.INTRODUCTION_REQUIRED,
        supervisedUsagesUntilIntroduction: null,
        autoIntroductionTarget: null,
        autoIntroductionGroupId: null,
      });
    });

    it('creates a resource without the maintenance check when asked to', async () => {
      store.create.mockResolvedValue(createMockResource({ id: 1 }));

      await service.createResource({
        name: 'Lathe',
        type: ResourceType.Machine,
        askMaintenanceCheckOnSessionEnd: false,
      });

      expect(store.create).toHaveBeenCalledWith(expect.objectContaining({ askMaintenanceCheckOnSessionEnd: false }));
    });

    it('audits only the safe resource projection when an actor is available', async () => {
      store.create.mockResolvedValue(createMockResource({ id: 1, name: 'Lathe', type: ResourceType.Machine }));

      await service.createResource({ name: 'Lathe', type: ResourceType.Machine }, undefined, { id: 9 });

      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          domain: 'resource',
          action: 'resource.created',
          actor: expect.objectContaining({ id: 9 }),
          subject: expect.objectContaining({ id: 1 }),
          details: { 'after.name': 'Lathe', 'after.type': ResourceType.Machine },
        }),
      );
    });

    it('bounds an oversized resource name in the audit projection', async () => {
      const resource = createMockResource({ id: 1, name: '"\\\0🙂'.repeat(5000), type: ResourceType.Machine });
      store.create.mockResolvedValue(resource);

      await service.createResource({ name: resource.name, type: ResourceType.Machine }, undefined, { id: 9 });

      const details = audit.record.mock.calls[0][0].details;
      expect(details['after.name']).toMatch(/\.\.\.$/);
      expect(Buffer.byteLength(JSON.stringify(details), 'utf8')).toBeLessThanOrEqual(4096);
      expect(projectAuditRow(audit.record.mock.calls[0][0])).not.toBeNull();
    });
  });
});
