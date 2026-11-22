import { AUDIT_RECORDER } from '../../audit/recorder/audit-event';
import type { ResourceHealthRecord } from '@attraccess/application-models';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Test, TestingModule } from '@nestjs/testing';
import { ResourceHealthService } from './resource-health.service';
import { RESOURCE_HEALTH_STORE, type ResourceHealthStore } from './resource-health-store.port';

/** An in-memory health store: one entry per (resource, identifier), as the real one keeps. */
function createInMemoryHealthStore(
  records: ResourceHealthRecord[],
): ResourceHealthStore & { hasUnhealthyEntry: jest.Mock } {
  return {
    resourceExists: async (resourceId) => resourceId !== 999,
    upsertReport: async (report) => {
      const existing = records.find((r) => r.resourceId === report.resourceId && r.identifier === report.identifier);
      if (existing) {
        const previousStatus = existing.status;
        Object.assign(existing, report);
        return { record: existing, previousStatus };
      }
      const record = { id: records.length + 1, ...report };
      records.push(record);
      return { record, previousStatus: null };
    },
    listForResource: async (resourceId) => records.filter((r) => r.resourceId === resourceId),
    listForResources: async (resourceIds) => records.filter((r) => resourceIds.includes(r.resourceId)),
    listBySourceAndPrefix: async (source, prefix, resourceId) =>
      records.filter(
        (r) =>
          r.source === source &&
          r.identifier.startsWith(prefix) &&
          (resourceId === undefined || r.resourceId === resourceId),
      ),
    hasUnhealthyEntry: jest.fn(async (resourceId: number) =>
      records.some((r) => r.resourceId === resourceId && r.status === 'unhealthy'),
    ),
    findEntry: async (resourceId, entryId) =>
      records.find((r) => r.id === entryId && r.resourceId === resourceId) ?? null,
    removeEntry: async (entryId) => {
      const index = records.findIndex((r) => r.id === entryId);
      if (index >= 0) records.splice(index, 1);
    },
  };
}

export function registerResourceHealthServiceFixture() {
  let service: ResourceHealthService;
  let eventEmitter: EventEmitter2;
  let store: ReturnType<typeof createInMemoryHealthStore>;

  const audit = { record: jest.fn().mockResolvedValue(undefined) };

  const records: ResourceHealthRecord[] = [];

  beforeEach(async () => {
    records.length = 0;
    audit.record.mockClear();
    store = createInMemoryHealthStore(records);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ResourceHealthService,
        { provide: RESOURCE_HEALTH_STORE, useValue: store },
        EventEmitter2,
        { provide: AUDIT_RECORDER, useValue: audit },
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
    get store() {
      return store;
    },
  };
}
