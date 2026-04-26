import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { NotFoundException } from '@nestjs/common';
import {
  Resource,
  ResourceHealthSource,
  ResourceHealthState,
  ResourceHealthStatus,
} from '@attraccess/database-entities';
import { ResourceHealthService } from './resource-health.service';
import { ResourceHealthChangedEvent } from './events/resource-health-changed.event';

type MockRepository<T = unknown> = Partial<Record<keyof Repository<T>, jest.Mock>>;

const stubResource = (id: number): Resource => ({ id, name: `Resource ${id}` } as unknown as Resource);

describe('ResourceHealthService', () => {
  let service: ResourceHealthService;
  let healthRepo: MockRepository<ResourceHealthState>;
  let resourceRepo: MockRepository<Resource>;
  let eventEmitter: EventEmitter2;

  const records: ResourceHealthState[] = [];

  beforeEach(async () => {
    records.length = 0;

    healthRepo = {
      findOne: jest.fn(async ({ where }: { where: Partial<ResourceHealthState> }) =>
        records.find((r) => r.resourceId === where.resourceId && r.identifier === where.identifier) ?? null,
      ),
      find: jest.fn(async ({ where }: { where: Partial<ResourceHealthState> }) =>
        records.filter((r) => r.resourceId === where.resourceId),
      ),
      count: jest.fn(async ({ where }: { where: Partial<ResourceHealthState> }) =>
        records.filter((r) => {
          if (where.resourceId !== undefined && r.resourceId !== where.resourceId) return false;
          if (where.status !== undefined && r.status !== where.status) return false;
          return true;
        }).length,
      ),
      create: jest.fn((data: Partial<ResourceHealthState>) => ({ ...data })),
      save: jest.fn(async (entity: ResourceHealthState) => {
        const existingIdx = records.findIndex(
          (r) => r.resourceId === entity.resourceId && r.identifier === entity.identifier,
        );
        if (existingIdx >= 0) {
          records[existingIdx] = { ...records[existingIdx], ...entity };
          return records[existingIdx];
        }
        const persisted = { id: records.length + 1, createdAt: new Date(), updatedAt: new Date(), ...entity };
        records.push(persisted as ResourceHealthState);
        return persisted as ResourceHealthState;
      }),
    };

    resourceRepo = {
      findOne: jest.fn(async ({ where }: { where: { id: number } }) =>
        where.id === 999 ? null : stubResource(where.id),
      ),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ResourceHealthService,
        { provide: getRepositoryToken(ResourceHealthState), useValue: healthRepo },
        { provide: getRepositoryToken(Resource), useValue: resourceRepo },
        EventEmitter2,
      ],
    }).compile();

    service = module.get(ResourceHealthService);
    eventEmitter = module.get(EventEmitter2);
  });

  describe('reportHealth', () => {
    it('creates a new healthy entry when none exists', async () => {
      const result = await service.reportHealth({
        resourceId: 1,
        identifier: 'Shelly',
        status: ResourceHealthStatus.HEALTHY,
        source: ResourceHealthSource.MANUAL,
      });

      expect(result.identifier).toBe('Shelly');
      expect(result.status).toBe(ResourceHealthStatus.HEALTHY);
      expect(result.reason).toBeNull();
      expect(records).toHaveLength(1);
    });

    it('normalises empty/undefined identifiers to empty string', async () => {
      await service.reportHealth({
        resourceId: 1,
        identifier: undefined,
        status: ResourceHealthStatus.HEALTHY,
        source: ResourceHealthSource.MANUAL,
      });
      expect(records[0].identifier).toBe('');
    });

    it('trims identifier whitespace', async () => {
      await service.reportHealth({
        resourceId: 1,
        identifier: '  primary  ',
        status: ResourceHealthStatus.HEALTHY,
        source: ResourceHealthSource.MANUAL,
      });
      expect(records[0].identifier).toBe('primary');
    });

    it('clears reason when transitioning to healthy', async () => {
      records.push({
        id: 1,
        resourceId: 1,
        identifier: '',
        status: ResourceHealthStatus.UNHEALTHY,
        reason: 'broken',
        source: ResourceHealthSource.MANUAL,
        lastReportedAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      } as ResourceHealthState);

      const result = await service.reportHealth({
        resourceId: 1,
        identifier: '',
        status: ResourceHealthStatus.HEALTHY,
        reason: 'whatever',
        source: ResourceHealthSource.MANUAL,
      });

      expect(result.reason).toBeNull();
    });

    it('falls back to null reason when unhealthy with empty reason', async () => {
      const result = await service.reportHealth({
        resourceId: 1,
        identifier: '',
        status: ResourceHealthStatus.UNHEALTHY,
        reason: '   ',
        source: ResourceHealthSource.MANUAL,
      });
      expect(result.reason).toBeNull();
    });

    it('emits ResourceHealthChangedEvent only when status changes', async () => {
      const emitSpy = jest.spyOn(eventEmitter, 'emit');

      await service.reportHealth({
        resourceId: 1,
        identifier: '',
        status: ResourceHealthStatus.HEALTHY,
        source: ResourceHealthSource.MANUAL,
      });
      expect(emitSpy).toHaveBeenCalledWith(
        ResourceHealthChangedEvent.EVENT_NAME,
        expect.objectContaining({
          resourceId: 1,
          status: ResourceHealthStatus.HEALTHY,
          previousStatus: null,
        }),
      );

      emitSpy.mockClear();
      await service.reportHealth({
        resourceId: 1,
        identifier: '',
        status: ResourceHealthStatus.HEALTHY,
        source: ResourceHealthSource.MANUAL,
      });
      expect(emitSpy).not.toHaveBeenCalled();

      await service.reportHealth({
        resourceId: 1,
        identifier: '',
        status: ResourceHealthStatus.UNHEALTHY,
        reason: 'ka-pow',
        source: ResourceHealthSource.MANUAL,
      });
      expect(emitSpy).toHaveBeenCalledWith(
        ResourceHealthChangedEvent.EVENT_NAME,
        expect.objectContaining({
          resourceId: 1,
          status: ResourceHealthStatus.UNHEALTHY,
          previousStatus: ResourceHealthStatus.HEALTHY,
          reason: 'ka-pow',
        }),
      );
    });

    it('updates an existing record without creating duplicates', async () => {
      await service.reportHealth({
        resourceId: 1,
        identifier: '',
        status: ResourceHealthStatus.HEALTHY,
        source: ResourceHealthSource.MANUAL,
      });
      await service.reportHealth({
        resourceId: 1,
        identifier: '',
        status: ResourceHealthStatus.UNHEALTHY,
        reason: 'gone',
        source: ResourceHealthSource.HEARTBEAT,
      });
      expect(records).toHaveLength(1);
      expect(records[0].source).toBe(ResourceHealthSource.HEARTBEAT);
      expect(records[0].reason).toBe('gone');
    });

    it('keeps separate records per identifier', async () => {
      await service.reportHealth({
        resourceId: 1,
        identifier: 'Shelly',
        status: ResourceHealthStatus.HEALTHY,
        source: ResourceHealthSource.MANUAL,
      });
      await service.reportHealth({
        resourceId: 1,
        identifier: 'Internal',
        status: ResourceHealthStatus.UNHEALTHY,
        reason: 'fault',
        source: ResourceHealthSource.MANUAL,
      });
      expect(records).toHaveLength(2);
    });
  });

  describe('isResourceUnhealthy', () => {
    it('returns false when no entries exist', async () => {
      expect(await service.isResourceUnhealthy(1)).toBe(false);
    });

    it('returns true when at least one entry is unhealthy', async () => {
      await service.reportHealth({
        resourceId: 1,
        identifier: 'a',
        status: ResourceHealthStatus.HEALTHY,
        source: ResourceHealthSource.MANUAL,
      });
      await service.reportHealth({
        resourceId: 1,
        identifier: 'b',
        status: ResourceHealthStatus.UNHEALTHY,
        reason: 'bad',
        source: ResourceHealthSource.MANUAL,
      });
      expect(await service.isResourceUnhealthy(1)).toBe(true);
    });

    it('does not consider unhealthy entries from other resources', async () => {
      await service.reportHealth({
        resourceId: 2,
        identifier: '',
        status: ResourceHealthStatus.UNHEALTHY,
        reason: 'bad',
        source: ResourceHealthSource.MANUAL,
      });
      expect(await service.isResourceUnhealthy(1)).toBe(false);
    });
  });

  describe('getSummary', () => {
    it('throws NotFoundException when resource does not exist', async () => {
      await expect(service.getSummary(999)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('reports healthy when no entries exist', async () => {
      const summary = await service.getSummary(1);
      expect(summary.isHealthy).toBe(true);
      expect(summary.entries).toEqual([]);
      expect(summary.unhealthyEntries).toEqual([]);
    });

    it('separates healthy and unhealthy entries', async () => {
      await service.reportHealth({
        resourceId: 1,
        identifier: 'a',
        status: ResourceHealthStatus.HEALTHY,
        source: ResourceHealthSource.MANUAL,
      });
      await service.reportHealth({
        resourceId: 1,
        identifier: 'b',
        status: ResourceHealthStatus.UNHEALTHY,
        reason: 'broken',
        source: ResourceHealthSource.PAYLOAD,
      });

      const summary = await service.getSummary(1);
      expect(summary.isHealthy).toBe(false);
      expect(summary.entries).toHaveLength(2);
      expect(summary.unhealthyEntries).toHaveLength(1);
      expect(summary.unhealthyEntries[0].reason).toBe('broken');
    });
  });
});
