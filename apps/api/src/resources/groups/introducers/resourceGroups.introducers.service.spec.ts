import { Test, TestingModule } from '@nestjs/testing';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ResourceIntroducerType } from '@attraccess/application-models';
import { ResourceGroupsIntroducersService } from './resourceGroups.introducers.service';
import { NotificationDispatchService } from '../../../notifications/notification-dispatch.service';
import { RESOURCE_GROUP_INTRODUCER_STORE } from '../resource-group-store.port';
import { NotificationCategory } from '../../../notifications/notification-types';

describe('ResourceGroupsIntroducersService notifications', () => {
  let service: ResourceGroupsIntroducersService;
  let repository: { list: jest.Mock; find: jest.Mock; insert: jest.Mock; remove: jest.Mock };
  let notifications: { dispatch: jest.Mock };

  beforeEach(async () => {
    repository = {
      list: jest.fn(),
      find: jest.fn().mockResolvedValue(null),
      insert: jest.fn().mockImplementation(async (groupId, userId, type) => ({ id: 1, userId, type })),
      remove: jest.fn().mockResolvedValue(undefined),
    };
    notifications = { dispatch: jest.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ResourceGroupsIntroducersService,
        { provide: RESOURCE_GROUP_INTRODUCER_STORE, useValue: repository },
        { provide: EventEmitter2, useValue: { emit: jest.fn() } },
        { provide: NotificationDispatchService, useValue: notifications },
      ],
    }).compile();

    service = module.get(ResourceGroupsIntroducersService);
  });

  it('notifies the user when group maintainer status is granted', async () => {
    await service.grant(5, 3, ResourceIntroducerType.MAINTAINER);

    expect(notifications.dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        category: NotificationCategory.ACCESS_CHANGES,
        recipients: [expect.objectContaining({ id: 3 })],
        title: 'Your group access changed',
        body: 'You were made a maintainer for group #5.',
        url: '/resource-groups/5',
      }),
    );
  });

  it('notifies the user when group introducer or maintainer status is revoked', async () => {
    repository.find.mockResolvedValue({ id: 8, userId: 3, type: ResourceIntroducerType.INTRODUCER });

    await service.revoke(5, 3, ResourceIntroducerType.INTRODUCER);

    expect(notifications.dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        category: NotificationCategory.ACCESS_CHANGES,
        recipients: [expect.objectContaining({ id: 3 })],
        body: 'Your introducer status for group #5 was revoked.',
        url: '/resource-groups/5',
      }),
    );
  });

  it('creates a second role without overwriting an existing one', async () => {
    repository.find.mockImplementation((_groupId, _userId, type) =>
      Promise.resolve(
        type === ResourceIntroducerType.INTRODUCER ? { id: 2, type: ResourceIntroducerType.INTRODUCER } : null,
      ),
    );

    await service.grant(5, 3, ResourceIntroducerType.MAINTAINER);

    expect(repository.find).toHaveBeenCalledWith(5, 3, ResourceIntroducerType.MAINTAINER);
    expect(repository.insert).toHaveBeenCalledWith(5, 3, ResourceIntroducerType.MAINTAINER);
  });

  it('removes the revoked grant by id and tells nothing when there is none', async () => {
    repository.find.mockResolvedValue({ id: 8, userId: 3, type: ResourceIntroducerType.INTRODUCER });
    await service.revoke(5, 3);
    expect(repository.remove).toHaveBeenCalledWith(8);

    repository.remove.mockClear();
    repository.find.mockResolvedValue(null);
    expect(await service.revoke(5, 3)).toBeUndefined();
    expect(repository.remove).not.toHaveBeenCalled();
  });
});
