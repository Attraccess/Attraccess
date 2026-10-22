import { ResourceHealthPersistence } from './persistence/port';
import { Resource, ResourceHealthState } from '@attraccess/application-models';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Test, TestingModule } from '@nestjs/testing';
import { AuditService } from '../../audit/audit.service';
import { ResourceHealthService } from './resource-health.service';

const stubResource = (id: number): Resource => ({ id, name: `Resource ${id}` }) as unknown as Resource;
export function registerResourceHealthServiceFixture() {
  let service: ResourceHealthService;

  let persistence: jest.Mocked<ResourceHealthPersistence>;

  let eventEmitter: EventEmitter2;

  const audit = { recordResource: jest.fn().mockResolvedValue(undefined) };

  const records: ResourceHealthState[] = [];

  beforeEach(async () => {
    records.length = 0;
    audit.recordResource.mockClear();

    persistence = {
      findEntry: jest.fn(
        async (resourceId, identifier) =>
          records.find((row) => row.resourceId === resourceId && row.identifier === identifier) ?? null,
      ),
      findEntryById: jest.fn(
        async (resourceId, entryId) =>
          records.find((row) => row.resourceId === resourceId && row.id === entryId) ?? null,
      ),
      listEntries: jest.fn(async (resourceIds) => records.filter((row) => resourceIds.includes(row.resourceId))),
      countUnhealthy: jest.fn(
        async (resourceId) =>
          records.filter((row) => row.resourceId === resourceId && row.status === 'unhealthy').length,
      ),
      findResource: jest.fn(async (resourceId) => (resourceId === 999 ? null : stubResource(resourceId))),
      storeEntry: jest.fn(async (entry) => {
        const index = records.findIndex(
          (row) => row.resourceId === entry.resourceId && row.identifier === entry.identifier,
        );
        if (index >= 0) {
          records[index] = { ...records[index], ...entry };
          return records[index];
        }
        const row = {
          id: records.length + 1,
          createdAt: new Date(),
          updatedAt: new Date(),
          ...entry,
        } as ResourceHealthState;
        records.push(row);
        return row;
      }),
      removeEntry: jest.fn(async (entry) => {
        const index = records.findIndex((row) => row.id === entry.id);
        if (index >= 0) records.splice(index, 1);
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ResourceHealthService,
        { provide: ResourceHealthPersistence, useValue: persistence },
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
