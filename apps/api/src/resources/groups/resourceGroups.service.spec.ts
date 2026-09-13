import { Resource, ResourceGroup, ResourceIntroducer, ResourceIntroduction } from '@attraccess/database-entities';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Test } from '@nestjs/testing';
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
