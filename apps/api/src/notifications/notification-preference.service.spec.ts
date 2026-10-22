import { NotificationPersistence } from './persistence/port';
import { Test, TestingModule } from '@nestjs/testing';
import { NotificationPreference } from '@attraccess/application-models';
import { NotificationCategory, NotificationChannel } from './notification-types';
import { NotificationPreferenceService } from './notification-preference.service';

describe('NotificationPreferenceService', () => {
  let service: NotificationPreferenceService;
  let persistence: jest.Mocked<NotificationPersistence>;

  beforeEach(async () => {
    persistence = {
      readPreferences: jest.fn(),
      saveCategoryChannels: jest.fn(
        async (userId, categoryChannels, existing) =>
          ({ ...existing, userId, categoryChannels }) as NotificationPreference,
      ),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [NotificationPreferenceService, { provide: NotificationPersistence, useValue: persistence }],
    }).compile();

    service = module.get(NotificationPreferenceService);
  });

  it('returns default enabled channel preferences when the user has no row', async () => {
    persistence.readPreferences.mockResolvedValue(null);

    const result = await service.getPreferences(5);

    expect(result.categories).toEqual(
      expect.arrayContaining([
        {
          category: NotificationCategory.MESSAGES,
          channels: { email: true, push: true, toast: true },
        },
        {
          category: NotificationCategory.RESOURCE_TAKEOVER,
          channels: { email: true, push: true, toast: true },
        },
        {
          category: NotificationCategory.ACCESS_CHANGES,
          channels: { email: true, push: true, toast: true },
        },
        {
          category: NotificationCategory.NFC_CARDS,
          channels: { email: true, push: true, toast: true },
        },
      ]),
    );
  });

  it('maps legacy messaging booleans into the structured message category', async () => {
    persistence.readPreferences.mockResolvedValue({
      messagesEmailOnOffline: false,
      messagesPushEnabled: true,
      categoryChannels: null,
    } as NotificationPreference);

    const result = await service.getPreferences(5);
    const messages = result.categories.find((entry) => entry.category === NotificationCategory.MESSAGES);

    expect(messages?.channels).toEqual({ email: false, push: true, toast: true });
  });

  it('creates a row and updates one channel without changing other defaults', async () => {
    persistence.readPreferences.mockResolvedValue(null);

    const result = await service.updatePreferences(5, {
      category: NotificationCategory.MAINTENANCE_REQUESTS,
      channels: { push: false },
    });
    const maintenance = result.categories.find((entry) => entry.category === NotificationCategory.MAINTENANCE_REQUESTS);

    expect(persistence.saveCategoryChannels).toHaveBeenCalledWith(5, expect.any(String), null);
    expect(maintenance?.channels).toEqual({ email: true, push: false, toast: true });
  });

  it('checks whether a single category channel is enabled', async () => {
    persistence.readPreferences.mockResolvedValue({
      categoryChannels: JSON.stringify({
        [NotificationCategory.PROJECT_INVITATIONS]: { email: true, push: false, toast: true },
      }),
    } as NotificationPreference);

    await expect(
      service.isChannelEnabled(5, NotificationCategory.PROJECT_INVITATIONS, NotificationChannel.PUSH),
    ).resolves.toBe(false);
    await expect(
      service.isChannelEnabled(5, NotificationCategory.PROJECT_INVITATIONS, NotificationChannel.EMAIL),
    ).resolves.toBe(true);
  });
});
