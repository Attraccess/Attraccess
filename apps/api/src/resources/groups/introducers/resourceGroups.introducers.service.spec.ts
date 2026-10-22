import { GroupIntroducerPersistence } from '../persistence/port';
import { Test, TestingModule } from '@nestjs/testing';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ResourceIntroducer, ResourceIntroducerType } from '@attraccess/application-models';
import { ResourceGroupsIntroducersService } from './resourceGroups.introducers.service';
import { NotificationDispatchService } from '../../../notifications/notification-dispatch.service';
import { NotificationCategory } from '../../../notifications/notification-types';

describe('ResourceGroupsIntroducersService notifications', () => {
  let service: ResourceGroupsIntroducersService;
  let persistence: jest.Mocked<GroupIntroducerPersistence>;
  let notifications: { dispatch: jest.Mock };

  beforeEach(async () => {
    persistence = {
      grants: jest.fn(),
      grant: jest.fn().mockResolvedValue(null),
      createGrant: jest.fn(
        async (groupId, userId, type) =>
          ({ resourceGroupId: groupId, user: { id: userId }, type }) as ResourceIntroducer,
      ),
      removeGrant: jest.fn(async (grant) => grant),
    };
    notifications = { dispatch: jest.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ResourceGroupsIntroducersService,
        { provide: GroupIntroducerPersistence, useValue: persistence },
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
    persistence.grant.mockResolvedValue({
      user: { id: 3 },
      type: ResourceIntroducerType.INTRODUCER,
    } as ResourceIntroducer);

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
    persistence.grant.mockImplementation((_groupId, _userId, type) =>
      Promise.resolve(
        type === ResourceIntroducerType.INTRODUCER
          ? ({ type: ResourceIntroducerType.INTRODUCER } as ResourceIntroducer)
          : null,
      ),
    );

    await service.grant(5, 3, ResourceIntroducerType.MAINTAINER);

    expect(persistence.grant).toHaveBeenCalledWith(5, 3, ResourceIntroducerType.MAINTAINER);
    expect(persistence.createGrant).toHaveBeenCalledWith(5, 3, ResourceIntroducerType.MAINTAINER);
  });
});
