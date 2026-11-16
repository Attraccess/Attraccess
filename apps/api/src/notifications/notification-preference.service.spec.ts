import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotificationPreference } from '@attraccess/database-entities';
import { NotificationCategory, NotificationChannel } from './notification-types';
import { NotificationPreferenceService } from './notification-preference.service';
import {
  registerPluginNotificationCategories,
  unregisterPluginNotificationCategories,
} from './plugin-notification-categories';
import { BadRequestException } from '@nestjs/common';

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

  describe('plugin categories', () => {
    const key = 'plugin.booking.reminder';
    const label = { en: 'Reminder', de: 'Erinnerung' };

    beforeEach(() => registerPluginNotificationCategories('booking', [{ id: 'reminder', label }]));
    afterEach(() => unregisterPluginNotificationCategories('booking'));

    it('lists plugin categories grouped by plugin with all channels on by default', async () => {
      repository.findOne.mockResolvedValue(null);

      const result = await service.getPreferences(5);

      expect(result.pluginCategories).toEqual([
        { category: key, pluginName: 'booking', label, channels: { email: true, push: true, toast: true } },
      ]);
      expect(result.categories.some((entry) => String(entry.category).startsWith('plugin.'))).toBe(false);
    });

    it('stores a channel choice per plugin category and respects it', async () => {
      repository.findOne.mockResolvedValue(null);
      const result = await service.updatePreferences(5, { category: key, channels: { email: false } });

      expect(result.pluginCategories[0].channels).toEqual({ email: false, push: true, toast: true });
      const stored = repository.save.mock.calls[0][0].categoryChannels;
      repository.findOne.mockResolvedValue({ categoryChannels: stored });
      await expect(service.isChannelEnabled(5, key, NotificationChannel.EMAIL)).resolves.toBe(false);
      await expect(service.isChannelEnabled(5, key, NotificationChannel.PUSH)).resolves.toBe(true);
    });

    it('keeps choices for plugin categories that are currently not loaded', async () => {
      repository.findOne.mockResolvedValue({
        categoryChannels: JSON.stringify({ 'plugin.gone.thing': { email: false, push: true, toast: true } }),
      });

      await service.updatePreferences(5, { category: key, channels: { push: false } });

      expect(JSON.parse(repository.save.mock.calls[0][0].categoryChannels)['plugin.gone.thing']).toEqual({
        email: false,
        push: true,
        toast: true,
      });
    });

    it('rejects unknown categories', async () => {
      repository.findOne.mockResolvedValue(null);
      await expect(
        service.updatePreferences(5, { category: 'plugin.booking.unknown', channels: { push: false } }),
      ).rejects.toBeInstanceOf(BadRequestException);
      await expect(service.updatePreferences(5, { category: 'nonsense', channels: {} })).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });
  });
});
