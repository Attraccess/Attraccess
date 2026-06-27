import { Logger } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { UserPermissionsService } from './user-permissions.service';
import { User } from '@attraccess/database-entities';
import { NotificationDispatchService } from '../../notifications/notification-dispatch.service';
import { NotificationCategory } from '../../notifications/notification-types';

describe('UserPermissionsService', () => {
  let service: UserPermissionsService;
  let notifications: { dispatch: jest.Mock; sendEmailTemplate: jest.Mock };
  const user = { id: 1, username: 'alice' } as User;

  beforeEach(async () => {
    notifications = {
      dispatch: jest.fn().mockResolvedValue(undefined),
      sendEmailTemplate: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [UserPermissionsService, { provide: NotificationDispatchService, useValue: notifications }],
    }).compile();

    service = module.get<UserPermissionsService>(UserPermissionsService);
  });

  it('dispatches a notification to the affected user', () => {
    service.notifyPermissionsChanged(user, 99);

    expect(notifications.dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        category: NotificationCategory.ACCESS_CHANGES,
        recipients: [user],
        actorId: 99,
        sendEmail: expect.any(Function),
      }),
    );
  });

  it('does not throw when notification dispatch fails', async () => {
    notifications.dispatch.mockRejectedValue(new Error('push unavailable'));
    const loggerSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation();

    expect(() => service.notifyPermissionsChanged(user, 99)).not.toThrow();

    // Allow promise to settle
    await new Promise((r) => setTimeout(r, 0));
    expect(loggerSpy).toHaveBeenCalledWith(expect.stringContaining('push unavailable'));
    loggerSpy.mockRestore();
  });
});
