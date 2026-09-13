import { Resource, ResourceGroup, ResourceIntroducer, ResourceIntroduction } from '@attraccess/database-entities';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Test } from '@nestjs/testing';
import { DataSource, EntitySchema } from 'typeorm';
import { AuditService } from '../../audit/audit.service';
import { MetricsService } from '../../metrics/metrics.service';
import { ResourceGroupsService } from './resourceGroups.service';

describe('ResourceGroupsService audit events', () => {
  const groupRepository = { create: jest.fn(), save: jest.fn(), findOne: jest.fn(), delete: jest.fn() };
  const resourceRepository = { findOne: jest.fn() };
  const audit = { recordResource: jest.fn().mockResolvedValue(undefined) };
  let service: ResourceGroupsService;

  beforeEach(async () => {
    jest.clearAllMocks();
    service = (await Test.createTestingModule({
      providers: [
        ResourceGroupsService,
        { provide: getRepositoryToken(ResourceGroup), useValue: groupRepository },
        { provide: getRepositoryToken(Resource), useValue: resourceRepository },
        { provide: getRepositoryToken(ResourceIntroducer), useValue: {} },
        { provide: getRepositoryToken(ResourceIntroduction), useValue: {} },
        { provide: EventEmitter2, useValue: { emit: jest.fn() } },
        { provide: MetricsService, useValue: { resourceGroupsTotal: { inc: jest.fn(), dec: jest.fn() } } },
        { provide: AuditService, useValue: audit },
      ],
    }).compile()).get(ResourceGroupsService);
  });

  it('audits group creation and safe updates', async () => {
    const group = { id: 5, name: 'Workshop', description: 'Old description', isHidden: false } as ResourceGroup;
    groupRepository.create.mockReturnValue(group);
    groupRepository.save.mockResolvedValue(group);
    await service.createOne({ name: 'Workshop' }, { id: 9 });
    expect(audit.recordResource).toHaveBeenLastCalledWith(expect.objectContaining({
      action: 'resource_group.created', subjectType: 'resource_group', details: { 'after.name': 'Workshop', 'after.isHidden': 0 },
    }));

    jest.spyOn(service, 'getOne').mockResolvedValue(group);
    groupRepository.save.mockResolvedValue({ ...group, name: 'Machines', description: 'New description', isHidden: true });
    await service.updateOneById(5, { name: 'Machines', description: 'not audited', isHidden: true }, { id: 9 });
    expect(audit.recordResource).toHaveBeenLastCalledWith(expect.objectContaining({
      action: 'resource_group.updated', details: {
        'before.name': 'Workshop', 'after.name': 'Machines', 'before.isHidden': 0, 'after.isHidden': 1,
        changedFields: '["name","description","isHidden"]',
      },
    }));
  });

  it('audits membership changes and deletion without group descriptions', async () => {
    const group = { id: 5, name: 'Workshop', isHidden: false, resources: [] } as ResourceGroup;
    jest.spyOn(service, 'getOne').mockResolvedValue(group);
    resourceRepository.findOne.mockResolvedValue({ id: 7 });
    groupRepository.save.mockResolvedValue(group);
    await service.addResource(5, 7, { id: 9 });
    expect(audit.recordResource).toHaveBeenLastCalledWith(expect.objectContaining({
      action: 'resource_group.resource_added', details: { resourceId: 7 },
    }));

    group.resources = [{ id: 7 }] as never;
    await service.removeResource(5, 7, { id: 9 });
    expect(audit.recordResource).toHaveBeenLastCalledWith(expect.objectContaining({
      action: 'resource_group.resource_removed', details: { resourceId: 7 },
    }));

    groupRepository.delete.mockResolvedValue({ affected: 1 });
    await service.deleteOne(5, { id: 9 });
    expect(audit.recordResource).toHaveBeenLastCalledWith(expect.objectContaining({
      action: 'resource_group.deleted', details: { 'before.name': 'Workshop', 'before.isHidden': 0 },
    }));
  });
});

describe('ResourceGroupsService partial updates', () => {
  const resourceGroupSchema = new EntitySchema({
    name: 'resource_group',
    columns: {
      id: { type: Number, primary: true, generated: true },
      name: { type: String },
      description: { type: String, nullable: true },
      retrainingMaxAgeDays: { type: Number, nullable: true },
      retrainingMaxInactivityDays: { type: Number, nullable: true },
      retrainingBlocksAccess: { type: Boolean, default: false },
      isHidden: { type: Boolean, default: false },
    },
  });
  const audit = { recordResource: jest.fn().mockResolvedValue(undefined) };
  let source: DataSource;
  let service: ResourceGroupsService;

  beforeEach(async () => {
    source = await new DataSource({ type: 'sqlite', database: ':memory:', entities: [resourceGroupSchema], synchronize: true }).initialize();
    service = new ResourceGroupsService(
      source.getRepository('resource_group') as never,
      {} as never,
      {} as never,
      {} as never,
      { emit: jest.fn() } as never,
      { resourceGroupsTotal: { inc: jest.fn(), dec: jest.fn() } } as never,
      audit as never,
    );
    audit.recordResource.mockClear();
  });

  afterEach(async () => {
    await source.destroy();
  });

  it('preserves omitted fields with SQLite persistence and skips no-op audits', async () => {
    const repository = source.getRepository('resource_group');
    const group = await repository.save({
      name: 'Workshop',
      description: 'Original description',
      retrainingBlocksAccess: false,
      isHidden: false,
    });

    await service.updateOneById(group.id, { isHidden: true }, { id: 9 });

    expect(await repository.findOneByOrFail({ id: group.id })).toEqual(expect.objectContaining({
      name: 'Workshop', description: 'Original description', isHidden: true,
    }));
    expect(audit.recordResource).toHaveBeenCalledWith(expect.objectContaining({
      details: { 'before.isHidden': 0, 'after.isHidden': 1, changedFields: '["isHidden"]' },
    }));

    audit.recordResource.mockClear();
    await service.updateOneById(group.id, { isHidden: true }, { id: 9 });
    expect(audit.recordResource).not.toHaveBeenCalled();
  });
});
