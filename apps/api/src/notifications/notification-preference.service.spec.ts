import { Test, TestingModule } from '@nestjs/testing';
import { NotificationCategory, NotificationChannel } from './notification-types';
import { NotificationPreferenceService } from './notification-preference.service';
import {
  registerPluginNotificationCategories,
  unregisterPluginNotificationCategories,
} from './plugin-notification-categories';
import { BadRequestException } from '@nestjs/common';
import { NOTIFICATION_PREFERENCE_STORE } from './notification-preference-store.port';

describe('NotificationPreferenceService', () => {
  let service: NotificationPreferenceService;
  let store: { findForUser: jest.Mock; saveCategoryChannels: jest.Mock };

  beforeEach(async () => {
    store = {
      findForUser: jest.fn(),
      saveCategoryChannels: jest.fn().mockImplementation(async (userId: number, categoryChannels: string) => ({
        userId,
        messagesEmailOnOffline: true,
        messagesPushEnabled: true,
        categoryChannels,
      })),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [NotificationPreferenceService, { provide: NOTIFICATION_PREFERENCE_STORE, useValue: store }],
    }).compile();

    service = module.get(NotificationPreferenceService);
  });

  it('returns default enabled channel preferences when the user has no row', async () => {
    store.findForUser.mockResolvedValue(null);

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
    store.findForUser.mockResolvedValue({
      messagesEmailOnOffline: false,
      messagesPushEnabled: true,
      categoryChannels: null,
    });

    const result = await service.getPreferences(5);
    const messages = result.categories.find((entry) => entry.category === NotificationCategory.MESSAGES);

    expect(messages?.channels).toEqual({ email: false, push: true, toast: true });
  });

  it('creates a row and updates one channel without changing other defaults', async () => {
    store.findForUser.mockResolvedValue(null);

    const result = await service.updatePreferences(5, {
      category: NotificationCategory.MAINTENANCE_REQUESTS,
      channels: { push: false },
    });
    const maintenance = result.categories.find((entry) => entry.category === NotificationCategory.MAINTENANCE_REQUESTS);

    expect(store.saveCategoryChannels).toHaveBeenCalledWith(5, expect.any(String));
    expect(maintenance?.channels).toEqual({ email: true, push: false, toast: true });
  });

  it('checks whether a single category channel is enabled', async () => {
    store.findForUser.mockResolvedValue({
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

  describe('plugin categories', () => {
    const key = 'plugin.booking.reminder';
    const label = { en: 'Reminder', de: 'Erinnerung' };

    beforeEach(() => registerPluginNotificationCategories('booking', [{ id: 'reminder', label }]));
    afterEach(() => unregisterPluginNotificationCategories('booking'));

    it('lists plugin categories grouped by plugin with all channels on by default', async () => {
      store.findForUser.mockResolvedValue(null);

      const result = await service.getPreferences(5);

      expect(result.pluginCategories).toEqual([
        { category: key, pluginName: 'booking', label, channels: { email: true, push: true, toast: true } },
      ]);
      expect(result.categories.some((entry) => String(entry.category).startsWith('plugin.'))).toBe(false);
    });

    it('stores a channel choice per plugin category and respects it', async () => {
      store.findForUser.mockResolvedValue(null);
      const result = await service.updatePreferences(5, { category: key, channels: { email: false } });

      expect(result.pluginCategories[0].channels).toEqual({ email: false, push: true, toast: true });
      const stored = store.saveCategoryChannels.mock.calls[0][1];
      store.findForUser.mockResolvedValue({ categoryChannels: stored });
      await expect(service.isChannelEnabled(5, key, NotificationChannel.EMAIL)).resolves.toBe(false);
      await expect(service.isChannelEnabled(5, key, NotificationChannel.PUSH)).resolves.toBe(true);
    });

    it('keeps choices for plugin categories that are currently not loaded', async () => {
      store.findForUser.mockResolvedValue({
        categoryChannels: JSON.stringify({ 'plugin.gone.thing': { email: false, push: true, toast: true } }),
      });

      await service.updatePreferences(5, { category: key, channels: { push: false } });

      expect(JSON.parse(store.saveCategoryChannels.mock.calls[0][1])['plugin.gone.thing']).toEqual({
        email: false,
        push: true,
        toast: true,
      });
    });

    it('rejects unknown categories', async () => {
      store.findForUser.mockResolvedValue(null);
      await expect(
        service.updatePreferences(5, { category: 'plugin.booking.unknown', channels: { push: false } }),
      ).rejects.toBeInstanceOf(BadRequestException);
      await expect(service.updatePreferences(5, { category: 'nonsense', channels: {} })).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });
  });
});
