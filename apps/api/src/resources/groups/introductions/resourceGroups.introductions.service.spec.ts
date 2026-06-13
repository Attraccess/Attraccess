import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  IntroductionHistoryAction,
  ResourceIntroduction,
  ResourceIntroductionHistoryItem,
} from '@attraccess/database-entities';
import { ResourceGroupsIntroductionsService } from './resourceGroups.introductions.service';
import { NotificationDispatchService } from '../../../notifications/notification-dispatch.service';
import { NotificationCategory } from '../../../notifications/notification-types';

describe('ResourceGroupsIntroductionsService notifications', () => {
  let service: ResourceGroupsIntroductionsService;
  let introductionRepository: { findOne: jest.Mock; create: jest.Mock; save: jest.Mock; update: jest.Mock; find: jest.Mock };
  let historyRepository: { findOne: jest.Mock; create: jest.Mock; save: jest.Mock; find: jest.Mock };
  let notifications: { dispatch: jest.Mock };

  beforeEach(async () => {
    introductionRepository = {
      findOne: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockImplementation((data) => ({ id: 10, ...data })),
      save: jest.fn().mockImplementation(async (data) => ({ id: 10, ...data })),
      update: jest.fn(),
      find: jest.fn(),
    };
    historyRepository = {
      findOne: jest.fn(),
      create: jest.fn().mockImplementation((data) => data),
      save: jest.fn().mockImplementation(async (data) => ({ id: 20, ...data })),
      find: jest.fn(),
    };
    notifications = { dispatch: jest.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ResourceGroupsIntroductionsService,
        { provide: getRepositoryToken(ResourceIntroduction), useValue: introductionRepository },
        { provide: getRepositoryToken(ResourceIntroductionHistoryItem), useValue: historyRepository },
        { provide: EventEmitter2, useValue: { emit: jest.fn() } },
        { provide: NotificationDispatchService, useValue: notifications },
      ],
    }).compile();

    service = module.get(ResourceGroupsIntroductionsService);
  });

  it('notifies the user when a group introduction is granted', async () => {
    await service.grant(5, 3);

    expect(notifications.dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        category: NotificationCategory.ACCESS_CHANGES,
        recipients: [expect.objectContaining({ id: 3 })],
        title: 'Your group access changed',
        body: 'You received an introduction for group #5.',
        url: '/resource-groups/5',
      }),
    );
  });

  it('does not notify when a group introduction is granted twice without an effective access change', async () => {
    introductionRepository.findOne.mockResolvedValue({ id: 10, receiverUser: { id: 3 } });
    historyRepository.findOne.mockResolvedValue({ id: 19, action: IntroductionHistoryAction.GRANT });

    await service.grant(5, 3);

    expect(notifications.dispatch).not.toHaveBeenCalled();
  });

  it('notifies the user when a group introduction is revoked', async () => {
    introductionRepository.findOne.mockResolvedValue({ id: 10, receiverUser: { id: 3 } });
    historyRepository.findOne.mockResolvedValue({ id: 19, action: IntroductionHistoryAction.GRANT });

    await service.revoke(5, 3);

    expect(notifications.dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        category: NotificationCategory.ACCESS_CHANGES,
        recipients: [expect.objectContaining({ id: 3 })],
        body: 'Your introduction for group #5 was revoked.',
        url: '/resource-groups/5',
      }),
    );
  });

  it('does not notify when a group introduction is revoked twice without an effective access change', async () => {
    introductionRepository.findOne.mockResolvedValue({ id: 10, receiverUser: { id: 3 } });
    historyRepository.findOne.mockResolvedValue({ id: 19, action: IntroductionHistoryAction.REVOKE });

    await service.revoke(5, 3);

    expect(notifications.dispatch).not.toHaveBeenCalled();
  });

  it('does not notify when revoking a group introduction that was never granted', async () => {
    await service.revoke(5, 3);

    expect(notifications.dispatch).not.toHaveBeenCalled();
  });
});
