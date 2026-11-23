import { AUDIT_RECORDER } from '../../audit/recorder/audit-event';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Test } from '@nestjs/testing';
import type { ResourceGroupRecord } from '@attraccess/application-models';
import { MetricsService } from '../../metrics/metrics.service';
import { ResourceGroupsService } from './resourceGroups.service';
import { RESOURCE_GROUP_STORE } from './resource-group-store.port';
import { RESOURCE_FORM_STORE } from '../forms/forms-store.port';
import { UNIT_OF_WORK } from '../../database/unit-of-work';

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
    isVisible: jest.fn(),
    resourceExists: jest.fn(),
    addResource: jest.fn(),
    removeResource: jest.fn(),
  };
  const audit = { record: jest.fn().mockResolvedValue(undefined) };
  const formStore = { softDeleteGroupForms: jest.fn().mockResolvedValue(0) };
  const scope = { isOpen: true };
  const unitOfWork = { run: jest.fn((work: (scope: unknown) => Promise<unknown>) => work(scope)) };
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
          { provide: RESOURCE_FORM_STORE, useValue: formStore },
          { provide: UNIT_OF_WORK, useValue: unitOfWork },
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
    // The group's forms are deleted softly in the same unit of work as the group.
    expect(formStore.softDeleteGroupForms).toHaveBeenCalledWith(5, scope);
    expect(store.delete).toHaveBeenCalledWith(5, scope);
    expect(audit.record).toHaveBeenLastCalledWith(
      expect.objectContaining({
        domain: 'resource',
        action: 'resource_group.deleted',
        details: { 'before.name': 'Workshop', 'before.isHidden': 0 },
      }),
    );
  });

  describe('getOne for a narrowed viewer (ATT-843)', () => {
    const narrowed = { userId: 7, canUpdateResources: false, permittedOnly: true };

    it('answers 404 for a group without a machine the viewer may see', async () => {
      store.findById.mockResolvedValue(record());
      store.isVisible.mockResolvedValue(false);
      await expect(service.getOne({ id: 5 }, undefined, narrowed)).rejects.toMatchObject({ status: 404 });
      expect(store.isVisible).toHaveBeenCalledWith(5, narrowed);
    });

    it('returns a group the viewer may see', async () => {
      store.findById.mockResolvedValue(record());
      store.isVisible.mockResolvedValue(true);
      await expect(service.getOne({ id: 5 }, undefined, narrowed)).resolves.toMatchObject({ id: 5 });
    });

    it('does not ask the store for a resource manager or a viewer who sees every machine', async () => {
      store.findById.mockResolvedValue(record());
      await expect(
        service.getOne({ id: 5 }, undefined, { ...narrowed, canUpdateResources: true }),
      ).resolves.toMatchObject({ id: 5 });
      await expect(service.getOne({ id: 5 }, undefined, { ...narrowed, permittedOnly: false })).resolves.toMatchObject({
        id: 5,
      });
      await expect(service.getOne({ id: 5 })).resolves.toMatchObject({ id: 5 });
      expect(store.isVisible).not.toHaveBeenCalled();
    });
  });
});
