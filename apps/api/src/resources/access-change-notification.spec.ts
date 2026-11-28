import type { Logger } from '@nestjs/common';
import type { NotificationRecipient } from '@attraccess/application-models';
import { NotificationCategory } from '../notifications/notification-types';
import { dispatchAccessChange, nameForAccessChange, notifyAccessChange } from './access-change-notification';

const flush = () => new Promise((resolve) => setImmediate(resolve));

describe('access-change notifications', () => {
  const logger = { warn: jest.fn(), error: jest.fn() } as unknown as Logger & { warn: jest.Mock; error: jest.Mock };

  beforeEach(() => {
    logger.warn.mockClear();
    logger.error.mockClear();
  });

  describe('nameForAccessChange', () => {
    it('uses the looked-up name', async () => {
      await expect(
        nameForAccessChange({ kind: 'resource', id: 8, findName: async () => 'Laser Cutter' }, logger),
      ).resolves.toBe('Laser Cutter');
    });

    it('falls back to #<id> when the subject no longer exists', async () => {
      await expect(nameForAccessChange({ kind: 'resource', id: 8, findName: async () => null }, logger)).resolves.toBe(
        '#8',
      );
      expect(logger.warn).not.toHaveBeenCalled();
    });

    it('falls back to #<id> and logs which subject failed when the lookup fails', async () => {
      const findName = async () => {
        throw new Error('database down');
      };

      await expect(nameForAccessChange({ kind: 'group', id: 8, findName }, logger)).resolves.toBe('#8');
      expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('group #8'));
      expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('database down'));
    });
  });

  describe('dispatchAccessChange', () => {
    it('sends per-language texts to push, toast and the ACCESS_CHANGE email', async () => {
      const notifications = { dispatchToUser: jest.fn().mockResolvedValue(undefined), sendEmailTemplate: jest.fn() };

      await dispatchAccessChange(notifications, {
        userId: 3,
        title: (language) => `title:${language}`,
        body: (language) => `body:${language}`,
        url: '/resources/8',
        dedupeKey: 'key',
      });

      const [userId, request] = notifications.dispatchToUser.mock.calls[0];
      expect(userId).toBe(3);
      expect(request).toEqual(
        expect.objectContaining({
          category: NotificationCategory.ACCESS_CHANGES,
          url: '/resources/8',
          dedupeKey: 'key',
        }),
      );
      const recipient = { id: 3, locale: 'de' } as NotificationRecipient;
      expect(request.title(recipient)).toBe('title:de');
      expect(request.body(recipient)).toBe('body:de');

      await request.sendEmail(recipient, 'en');
      expect(notifications.sendEmailTemplate).toHaveBeenCalledWith(recipient, NotificationCategory.ACCESS_CHANGES, {
        accessChange: { title: 'title:en', body: 'body:en', url: '/resources/8' },
      });
    });
  });

  describe('notifyAccessChange', () => {
    const notification = {
      userId: 3,
      title: () => 'title',
      body: (language: string, name: string) => `${language}:${name}`,
      url: '/resource-groups/5',
      dedupeKey: 'key',
    };

    it('returns before the lookup and passes the looked-up name into the body', async () => {
      const notifications = { dispatchToUser: jest.fn().mockResolvedValue(undefined), sendEmailTemplate: jest.fn() };

      notifyAccessChange(
        notifications,
        logger,
        { kind: 'group', id: 5, findName: async () => 'Wood shop' },
        notification,
      );
      expect(notifications.dispatchToUser).not.toHaveBeenCalled();
      await flush();

      const request = notifications.dispatchToUser.mock.calls[0][1];
      expect(request.body({ id: 3, locale: 'de' } as NotificationRecipient)).toBe('de:Wood shop');
    });

    it('logs a failed dispatch instead of rejecting', async () => {
      const notifications = {
        dispatchToUser: jest.fn().mockRejectedValue(new Error('smtp down')),
        sendEmailTemplate: jest.fn(),
      };

      notifyAccessChange(
        notifications,
        logger,
        { kind: 'group', id: 5, findName: async () => 'Wood shop' },
        notification,
      );
      await flush();

      expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('group #5: smtp down'));
    });

    it('logs a rejection that is not an Error', async () => {
      const notifications = { dispatchToUser: jest.fn().mockRejectedValue(undefined), sendEmailTemplate: jest.fn() };

      notifyAccessChange(
        notifications,
        logger,
        { kind: 'group', id: 5, findName: async () => 'Wood shop' },
        notification,
      );
      await flush();

      expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('group #5: undefined'));
    });
  });
});
