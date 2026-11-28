import type { Logger } from '@nestjs/common';
import type { NotificationRecipient } from '@attraccess/application-models';
import { NotificationCategory } from '../notifications/notification-types';
import { dispatchAccessChange, nameForAccessChange } from './access-change-notification';

describe('access-change notifications', () => {
  const logger = { warn: jest.fn() } as unknown as Logger & { warn: jest.Mock };

  beforeEach(() => logger.warn.mockClear());

  describe('nameForAccessChange', () => {
    it('uses the looked-up name', async () => {
      await expect(nameForAccessChange(8, async () => 'Laser Cutter', logger)).resolves.toBe('Laser Cutter');
    });

    it('falls back to #<id> when the subject no longer exists', async () => {
      await expect(nameForAccessChange(8, async () => null, logger)).resolves.toBe('#8');
      expect(logger.warn).not.toHaveBeenCalled();
    });

    it('falls back to #<id> and logs when the lookup fails', async () => {
      await expect(
        nameForAccessChange(
          8,
          async () => {
            throw new Error('database down');
          },
          logger,
        ),
      ).resolves.toBe('#8');
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
});
