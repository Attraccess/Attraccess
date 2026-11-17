import { AUDIT_RECORDER } from '../../audit/recorder/audit-event';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Test } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { entities, ResourceGroup } from '@attraccess/database-entities';
import type { ResourceGroupRecord } from '@attraccess/application-models';
import { MetricsService } from '../../metrics/metrics.service';
import { ResourceGroupsService } from './resourceGroups.service';
import { RESOURCE_GROUP_STORE } from './resource-group-store.port';
import { TypeOrmResourceGroupStore } from '../../database/adapters/resources/resource-group-store.adapter';

const record = (overrides: Partial<ResourceGroupRecord> = {}): ResourceGroupRecord => ({
  id: 5,
  name: 'Workshop',
  description: 'Old description',
  retrainingMaxAgeDays: null,
  retrainingMaxInactivityDays: null,
  retrainingBlocksAccess: false,
  isHidden: false,
  createdAt: new Date('2030-01-01T00:00:00Z'),
  updatedAt: new Date('2030-01-01T00:00:00Z'),
  ...overrides,
});

describe('ResourceGroupsService audit events', () => {
  const store = {
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    findById: jest.fn(),
    resourceExists: jest.fn(),
    addResource: jest.fn(),
    removeResource: jest.fn(),
  };
  const audit = { record: jest.fn().mockResolvedValue(undefined) };
  let service: ResourceGroupsService;

  beforeEach(async () => {
    jest.clearAllMocks();
    service = (
      await Test.createTestingModule({
        providers: [
          ResourceGroupsService,
          { provide: RESOURCE_GROUP_STORE, useValue: store },
          { provide: EventEmitter2, useValue: { emit: jest.fn() } },
          { provide: MetricsService, useValue: { resourceGroupsTotal: { inc: jest.fn(), dec: jest.fn() } } },
          { provide: AUDIT_RECORDER, useValue: audit },
        ],
      }).compile()
    ).get(ResourceGroupsService);
  });

  it('audits group creation and safe updates', async () => {
    const group = record();
    store.create.mockResolvedValue(group);
    await service.createOne({ name: 'Workshop' }, { id: 9 });
    expect(audit.record).toHaveBeenLastCalledWith(
      expect.objectContaining({
        domain: 'resource',
        action: 'resource_group.created',
        subject: expect.objectContaining({ type: 'resource_group' }),
        details: { 'after.name': 'Workshop', 'after.isHidden': 0 },
      }),
    );

    jest.spyOn(service, 'getOne').mockResolvedValue(group);
    store.update.mockResolvedValue({ ...group, name: 'Machines', description: 'New description', isHidden: true });
    await service.updateOneById(5, { name: 'Machines', description: 'not audited', isHidden: true }, { id: 9 });
    expect(audit.record).toHaveBeenLastCalledWith(
      expect.objectContaining({
        domain: 'resource',
        action: 'resource_group.updated',
        details: {
          'before.name': 'Workshop',
          'after.name': 'Machines',
          'before.isHidden': 0,
          'after.isHidden': 1,
          changedFields: '["name","description","isHidden"]',
        },
      }),
    );
  });

  it('audits membership changes and deletion without group descriptions', async () => {
    const group = { ...record(), resources: [] as Array<{ id: number }> };
    jest.spyOn(service, 'getOne').mockResolvedValue(group);
    store.resourceExists.mockResolvedValue(true);
    await service.addResource(5, 7, { id: 9 });
    expect(audit.record).toHaveBeenLastCalledWith(
      expect.objectContaining({
        domain: 'resource',
        action: 'resource_group.resource_added',
        details: { resourceId: 7 },
      }),
    );

    group.resources = [{ id: 7 }];
    await service.removeResource(5, 7, { id: 9 });
    expect(audit.record).toHaveBeenLastCalledWith(
      expect.objectContaining({
        domain: 'resource',
        action: 'resource_group.resource_removed',
        details: { resourceId: 7 },
      }),
    );

    store.delete.mockResolvedValue(1);
    await service.deleteOne(5, { id: 9 });
    expect(audit.record).toHaveBeenLastCalledWith(
      expect.objectContaining({
        domain: 'resource',
        action: 'resource_group.deleted',
        details: { 'before.name': 'Workshop', 'before.isHidden': 0 },
      }),
    );
  });
});

describe('ResourceGroupsService partial updates', () => {
  const audit = { record: jest.fn().mockResolvedValue(undefined) };
  let source: DataSource;
  let service: ResourceGroupsService;

  beforeEach(async () => {
    source = await new DataSource({
      type: 'sqlite',
      database: ':memory:',
      entities: Object.values(entities),
      synchronize: true,
    }).initialize();
    service = new ResourceGroupsService(
      new TypeOrmResourceGroupStore(source),
      { emit: jest.fn() } as never,
      { resourceGroupsTotal: { inc: jest.fn(), dec: jest.fn() } } as never,
      audit as never,
    );
    audit.record.mockClear();
  });

  afterEach(async () => {
    await source.destroy();
  });

  it('preserves omitted fields with SQLite persistence and skips no-op audits', async () => {
    const repository = source.getRepository(ResourceGroup);
    const group = await repository.save({
      name: 'Workshop',
      description: 'Original description',
      retrainingBlocksAccess: false,
      isHidden: false,
    });

    await service.updateOneById(group.id, { isHidden: true }, { id: 9 });

    expect(await repository.findOneByOrFail({ id: group.id })).toEqual(
      expect.objectContaining({
        name: 'Workshop',
        description: 'Original description',
        isHidden: true,
      }),
    );
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        domain: 'resource',
        details: { 'before.isHidden': 0, 'after.isHidden': 1, changedFields: '["isHidden"]' },
      }),
    );

    audit.record.mockClear();
    await service.updateOneById(group.id, { isHidden: true }, { id: 9 });
    expect(audit.record).not.toHaveBeenCalled();
  });
});
