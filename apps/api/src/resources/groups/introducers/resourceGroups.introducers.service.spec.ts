import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ResourceIntroducer, ResourceIntroducerType, User } from '@attraccess/database-entities';
import { ResourceGroupsIntroducersService } from './resourceGroups.introducers.service';
import { NotificationDispatchService } from '../../../notifications/notification-dispatch.service';
import { NotificationCategory } from '../../../notifications/notification-types';

describe('ResourceGroupsIntroducersService notifications', () => {
  let service: ResourceGroupsIntroducersService;
  let repository: { find: jest.Mock; findOne: jest.Mock; create: jest.Mock; save: jest.Mock; remove: jest.Mock };
  let userRepository: { findOne: jest.Mock };
  let notifications: { dispatch: jest.Mock };

  beforeEach(async () => {
    repository = {
      find: jest.fn(),
      findOne: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockImplementation((data) => data),
      save: jest.fn().mockImplementation(async (data) => data),
      remove: jest.fn().mockImplementation(async (data) => data),
    };
    userRepository = { findOne: jest.fn().mockResolvedValue(null) };
    notifications = { dispatch: jest.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ResourceGroupsIntroducersService,
        { provide: getRepositoryToken(ResourceIntroducer), useValue: repository },
        { provide: getRepositoryToken(User), useValue: userRepository },
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
    repository.findOne.mockResolvedValue({ user: { id: 3 }, type: ResourceIntroducerType.INTRODUCER } as ResourceIntroducer);

    await service.revoke(5, 3);

    expect(notifications.dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        category: NotificationCategory.ACCESS_CHANGES,
        recipients: [expect.objectContaining({ id: 3 })],
        body: 'Your introducer status for group #5 was revoked.',
        url: '/resource-groups/5',
      }),
    );
  });
});
