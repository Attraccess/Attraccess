import { ResourceType } from '@attraccess/application-models';
import { BadRequestException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Test } from '@nestjs/testing';
import { AUDIT_RECORDER } from '../audit/recorder/audit-event';
import { LicenseService } from '../license/license.service';
import { MetricsService } from '../metrics/metrics.service';
import { createMockResource } from '../test-utils/resource.fixtures';
import { CreateResourceDto } from './dtos/createResource.dto';
import { UpdateResourceDto } from './dtos/updateResource.dto';
import { RESOURCE_STORE } from './resource-store.port';
import { ResourceImageService } from './resourceImage.service';
import { ResourcesService } from './resources.service';
import { mockMetricsService } from './resources.service.spec.mock-metrics-service';

/** Validation and audit of the per-machine session duration settings (ATT-43). */
describe('ResourcesService session duration settings', () => {
  let service: ResourcesService;
  let store: Record<string, jest.Mock>;
  const audit = { record: jest.fn().mockResolvedValue(undefined) };

  const durationSettings = (resource: Record<string, unknown>) => ({
    maxSessionDurationMinutes: resource.maxSessionDurationMinutes,
    requireSessionDurationEstimate: resource.requireSessionDurationEstimate,
    defaultSessionDurationEstimateMinutes: resource.defaultSessionDurationEstimateMinutes,
  });

  const machineWith = (settings: Record<string, unknown>) =>
    createMockResource({
      id: 1,
      type: ResourceType.Machine,
      maxSessionDurationMinutes: null,
      requireSessionDurationEstimate: false,
      defaultSessionDurationEstimateMinutes: null,
      ...settings,
    });

  beforeEach(async () => {
    store = {
      findDetailed: jest.fn(),
      count: jest.fn().mockResolvedValue(0),
      create: jest.fn(async (values) => createMockResource({ id: 1, ...values })),
      save: jest.fn(async (resource) => ({ ...resource })),
      setImageFilename: jest.fn(),
      hardDelete: jest.fn(),
    };
    audit.record.mockClear();
    const module = await Test.createTestingModule({
      providers: [
        ResourcesService,
        { provide: RESOURCE_STORE, useValue: store },
        { provide: ResourceImageService, useValue: { saveImage: jest.fn(), deleteImage: jest.fn() } },
        {
          provide: LicenseService,
          useValue: { verifyLicense: jest.fn().mockResolvedValue({ valid: true, payload: { cfg: {} } }) },
        },
        { provide: EventEmitter2, useValue: { emit: jest.fn() } },
        { provide: MetricsService, useValue: mockMetricsService },
        { provide: AUDIT_RECORDER, useValue: audit },
      ],
    }).compile();
    service = module.get(ResourcesService);
  });

  describe('createResource', () => {
    it('rejects a default estimate longer than the maximum', async () => {
      const dto: CreateResourceDto = {
        name: 'Laser',
        type: ResourceType.Machine,
        maxSessionDurationMinutes: 60,
        requireSessionDurationEstimate: true,
        defaultSessionDurationEstimateMinutes: 90,
      };

      await expect(service.createResource(dto)).rejects.toThrow(BadRequestException);
      expect(store.create).not.toHaveBeenCalled();
    });

    it('stores the settings of a machine', async () => {
      await service.createResource({
        name: 'Laser',
        type: ResourceType.Machine,
        maxSessionDurationMinutes: 120,
        requireSessionDurationEstimate: true,
        defaultSessionDurationEstimateMinutes: 120,
      });

      expect(durationSettings(store.create.mock.calls[0][0])).toEqual({
        maxSessionDurationMinutes: 120,
        requireSessionDurationEstimate: true,
        defaultSessionDurationEstimateMinutes: 120,
      });
    });

    it('stores no limits for a door, even an invalid combination', async () => {
      await service.createResource({
        name: 'Front door',
        type: ResourceType.Door,
        maxSessionDurationMinutes: 60,
        requireSessionDurationEstimate: true,
        defaultSessionDurationEstimateMinutes: 90,
      });

      expect(durationSettings(store.create.mock.calls[0][0])).toEqual({
        maxSessionDurationMinutes: null,
        requireSessionDurationEstimate: false,
        defaultSessionDurationEstimateMinutes: null,
      });
    });
  });

  describe('updateResource', () => {
    it('checks a new default estimate against the maximum already stored', async () => {
      store.findDetailed.mockResolvedValue([machineWith({ maxSessionDurationMinutes: 60 })]);

      await expect(
        service.updateResource(1, { defaultSessionDurationEstimateMinutes: 61 } as UpdateResourceDto),
      ).rejects.toThrow(BadRequestException);
      expect(store.save).not.toHaveBeenCalled();
    });

    it('checks a new maximum against the default estimate already stored', async () => {
      store.findDetailed.mockResolvedValue([machineWith({ defaultSessionDurationEstimateMinutes: 120 })]);

      await expect(service.updateResource(1, { maxSessionDurationMinutes: 60 } as UpdateResourceDto)).rejects.toThrow(
        BadRequestException,
      );
      expect(store.save).not.toHaveBeenCalled();
    });

    it('accepts a default estimate equal to the maximum', async () => {
      store.findDetailed.mockResolvedValue([machineWith({ maxSessionDurationMinutes: 60 })]);

      await service.updateResource(1, { defaultSessionDurationEstimateMinutes: 60 } as UpdateResourceDto);

      expect(store.save).toHaveBeenCalledWith(
        expect.objectContaining({ maxSessionDurationMinutes: 60, defaultSessionDurationEstimateMinutes: 60 }),
      );
    });

    it('clears all three settings when a machine becomes a door', async () => {
      store.findDetailed.mockResolvedValue([
        machineWith({
          maxSessionDurationMinutes: 240,
          requireSessionDurationEstimate: true,
          defaultSessionDurationEstimateMinutes: 60,
        }),
      ]);

      await service.updateResource(1, { type: ResourceType.Door } as UpdateResourceDto);

      expect(durationSettings(store.save.mock.calls[0][0])).toEqual({
        maxSessionDurationMinutes: null,
        requireSessionDurationEstimate: false,
        defaultSessionDurationEstimateMinutes: null,
      });
    });

    it('lists the changed settings in the audit details', async () => {
      store.findDetailed.mockResolvedValue([machineWith({ maxSessionDurationMinutes: 60 })]);

      await service.updateResource(
        1,
        { maxSessionDurationMinutes: 120, requireSessionDurationEstimate: true } as UpdateResourceDto,
        undefined,
        { id: 9 },
      );

      const details = audit.record.mock.calls[0][0].details;
      expect(JSON.parse(details.changedFields)).toEqual([
        'maxSessionDurationMinutes',
        'requireSessionDurationEstimate',
      ]);
    });

    it('lists only the default estimate when nothing else changed', async () => {
      store.findDetailed.mockResolvedValue([machineWith({ requireSessionDurationEstimate: true })]);

      await service.updateResource(1, { defaultSessionDurationEstimateMinutes: 45 } as UpdateResourceDto, undefined, {
        id: 9,
      });

      expect(JSON.parse(audit.record.mock.calls[0][0].details.changedFields)).toEqual([
        'defaultSessionDurationEstimateMinutes',
      ]);
    });
  });
});
