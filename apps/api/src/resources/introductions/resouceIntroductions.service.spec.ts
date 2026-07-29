import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  IntroductionHistoryAction,
  ResourceIntroduction,
  ResourceIntroductionHistoryItem,
} from '@attraccess/database-entities';
import { ResourceIntroductionsService } from './resouceIntroductions.service';
import { MetricsService } from '../../metrics/metrics.service';
import { NotificationDispatchService } from '../../notifications/notification-dispatch.service';
import { NotificationCategory } from '../../notifications/notification-types';

describe('ResourceIntroductionsService notifications', () => {
  let service: ResourceIntroductionsService;
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
        ResourceIntroductionsService,
        { provide: getRepositoryToken(ResourceIntroduction), useValue: introductionRepository },
        { provide: getRepositoryToken(ResourceIntroductionHistoryItem), useValue: historyRepository },
        { provide: EventEmitter2, useValue: { emit: jest.fn() } },
        { provide: MetricsService, useValue: { resourceIntroductionsTotal: { inc: jest.fn() } } },
        { provide: NotificationDispatchService, useValue: notifications },
      ],
    }).compile();

    service = module.get(ResourceIntroductionsService);
  });

  it('notifies the user when a resource introduction is granted', async () => {
    await service.grant(7, 3);

    expect(notifications.dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        category: NotificationCategory.ACCESS_CHANGES,
        recipients: [expect.objectContaining({ id: 3 })],
        title: 'Your resource access changed',
        body: 'You received an introduction for resource #7.',
        url: '/resources/7',
      }),
    );
  });

  it('does not notify when a resource introduction is granted twice without an effective access change', async () => {
    introductionRepository.findOne.mockResolvedValue({ id: 10, receiverUser: { id: 3 } });
    historyRepository.findOne.mockResolvedValue({ id: 19, action: IntroductionHistoryAction.GRANT });

    await service.grant(7, 3);

    expect(notifications.dispatch).not.toHaveBeenCalled();
  });

  it('notifies the user when a resource introduction is revoked', async () => {
    introductionRepository.findOne.mockResolvedValue({ id: 10, receiverUser: { id: 3 } });
    historyRepository.findOne.mockResolvedValue({ id: 19, action: IntroductionHistoryAction.GRANT });
    await service.revoke(7, 3);

    expect(notifications.dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        category: NotificationCategory.ACCESS_CHANGES,
        recipients: [expect.objectContaining({ id: 3 })],
        body: 'Your introduction for resource #7 was revoked.',
        url: '/resources/7',
      }),
    );
  });

  it('does not notify when a resource introduction is revoked twice without an effective access change', async () => {
    introductionRepository.findOne.mockResolvedValue({ id: 10, receiverUser: { id: 3 } });
    historyRepository.findOne.mockResolvedValue({ id: 19, action: IntroductionHistoryAction.REVOKE });

    await service.revoke(7, 3);

    expect(notifications.dispatch).not.toHaveBeenCalled();
  });

  it('does not notify when revoking a resource introduction that was never granted', async () => {
    await service.revoke(7, 3);

    expect(notifications.dispatch).not.toHaveBeenCalled();
  });
});
