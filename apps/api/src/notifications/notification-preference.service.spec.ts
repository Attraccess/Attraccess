import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotificationPreference } from '@attraccess/database-entities';
import { NotificationCategory, NotificationChannel } from './notification-types';
import { NotificationPreferenceService } from './notification-preference.service';

describe('NotificationPreferenceService', () => {
  let service: NotificationPreferenceService;
  let repository: { findOne: jest.Mock; create: jest.Mock; save: jest.Mock };

  beforeEach(async () => {
    repository = {
      findOne: jest.fn(),
      create: jest.fn().mockImplementation((data) => ({ ...data })),
      save: jest.fn().mockImplementation(async (data) => data),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationPreferenceService,
        { provide: getRepositoryToken(NotificationPreference), useValue: repository },
      ],
    }).compile();

    service = module.get(NotificationPreferenceService);
  });

  it('returns default enabled channel preferences when the user has no row', async () => {
    repository.findOne.mockResolvedValue(null);

    const result = await service.getPreferences(5);

    expect(result.categories).toEqual(
      expect.arrayContaining([
        {
          category: NotificationCategory.MESSAGES,
          channels: { email: true, push: true, toast: true },
        },
        {
          category: NotificationCategory.RESOURCE_TAKEOVER,
          channels: { email: false, push: true, toast: true },
        },
      ]),
    );
  });

  it('maps legacy messaging booleans into the structured message category', async () => {
    repository.findOne.mockResolvedValue({
      messagesEmailOnOffline: false,
      messagesPushEnabled: true,
      categoryChannels: null,
    });

    const result = await service.getPreferences(5);
    const messages = result.categories.find((entry) => entry.category === NotificationCategory.MESSAGES);

    expect(messages?.channels).toEqual({ email: false, push: true, toast: true });
  });

  it('creates a row and updates one channel without changing other defaults', async () => {
    repository.findOne.mockResolvedValue(null);

    const result = await service.updatePreferences(5, {
      category: NotificationCategory.MAINTENANCE_REQUESTS,
      channels: { push: false },
    });
    const maintenance = result.categories.find((entry) => entry.category === NotificationCategory.MAINTENANCE_REQUESTS);

    expect(repository.create).toHaveBeenCalledWith({ userId: 5, categoryChannels: expect.any(String) });
    expect(maintenance?.channels).toEqual({ email: true, push: false, toast: true });
  });

  it('checks whether a single category channel is enabled', async () => {
    repository.findOne.mockResolvedValue({
      categoryChannels: JSON.stringify({
        [NotificationCategory.PROJECT_INVITATIONS]: { email: true, push: false, toast: true },
      }),
    });

    await expect(
      service.isChannelEnabled(5, NotificationCategory.PROJECT_INVITATIONS, NotificationChannel.PUSH),
    ).resolves.toBe(false);
    await expect(
      service.isChannelEnabled(5, NotificationCategory.PROJECT_INVITATIONS, NotificationChannel.EMAIL),
    ).resolves.toBe(true);
  });
});
