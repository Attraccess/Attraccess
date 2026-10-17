import { Resource, ResourceHealthState } from '@attraccess/database-entities';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditService } from '../../audit/audit.service';
import { ResourceHealthService } from './resource-health.service';

type MockRepository<T = unknown> = Partial<Record<keyof Repository<T>, jest.Mock>>;

const stubResource = (id: number): Resource => ({ id, name: `Resource ${id}` }) as unknown as Resource;
export function registerResourceHealthServiceFixture() {
  let service: ResourceHealthService;

  let healthRepo: MockRepository<ResourceHealthState>;

  let resourceRepo: MockRepository<Resource>;

  let eventEmitter: EventEmitter2;

  const audit = { recordResource: jest.fn().mockResolvedValue(undefined) };

  const records: ResourceHealthState[] = [];

  beforeEach(async () => {
    records.length = 0;
    audit.recordResource.mockClear();

    healthRepo = {
      findOne: jest.fn(
        async ({ where }: { where: Partial<ResourceHealthState> }) =>
          records.find((r) => {
            if (where.id !== undefined && r.id !== where.id) return false;
            if (where.resourceId !== undefined && r.resourceId !== where.resourceId) return false;
            if (where.identifier !== undefined && r.identifier !== where.identifier) return false;
            return true;
          }) ?? null,
      ),
      find: jest.fn(async ({ where }: { where: Partial<ResourceHealthState> }) =>
        records.filter((r) => r.resourceId === where.resourceId),
      ),
      count: jest.fn(
        async ({ where }: { where: Partial<ResourceHealthState> }) =>
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
      remove: jest.fn(async (entity: ResourceHealthState) => {
        const idx = records.findIndex((r) => r.id === entity.id);
        if (idx >= 0) records.splice(idx, 1);
        return entity;
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
        { provide: AuditService, useValue: audit },
      ],
    }).compile();

    service = module.get(ResourceHealthService);
    eventEmitter = module.get(EventEmitter2);
  });
  return {
    get service() {
      return service;
    },
    get eventEmitter() {
      return eventEmitter;
    },
    get audit() {
      return audit;
    },
    get records() {
      return records;
    },
  };
}
