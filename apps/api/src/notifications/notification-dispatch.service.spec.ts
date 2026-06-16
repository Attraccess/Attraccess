import { Test, TestingModule } from '@nestjs/testing';
import { Logger } from '@nestjs/common';
import { User } from '@attraccess/database-entities';
import { NotificationDispatchService } from './notification-dispatch.service';
import { NotificationPreferenceService } from './notification-preference.service';
import { NotificationLiveService } from './notification-live.service';
import { NotificationCategory, NotificationChannel } from './notification-types';
import { PushService } from '../push/push.service';
import { EmailService } from '../email/email.service';

describe('NotificationDispatchService', () => {
  let service: NotificationDispatchService;
  let preferences: { isChannelEnabled: jest.Mock };
  let push: { sendToUser: jest.Mock };
  let live: { emitToUser: jest.Mock };
  let email: { sendMaintenanceRequestedEmail: jest.Mock; sendResourceTakeoverEmail: jest.Mock };

  const recipient = { id: 2, email: 'recipient@example.com' } as User;

  beforeEach(async () => {
    preferences = { isChannelEnabled: jest.fn().mockResolvedValue(true) };
    push = { sendToUser: jest.fn().mockResolvedValue(undefined) };
    live = { emitToUser: jest.fn() };
    email = {
      sendMaintenanceRequestedEmail: jest.fn(),
      sendResourceTakeoverEmail: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationDispatchService,
        { provide: NotificationPreferenceService, useValue: preferences },
        { provide: PushService, useValue: push },
        { provide: NotificationLiveService, useValue: live },
        { provide: EmailService, useValue: email },
      ],
    }).compile();

    service = module.get(NotificationDispatchService);
  });

  it('sends enabled email, push, and toast channels to each recipient', async () => {
    const sendEmail = jest.fn().mockResolvedValue(undefined);

    await service.dispatch({
      category: NotificationCategory.MAINTENANCE_REQUESTS,
      recipients: [recipient],
      title: 'Maintenance requested',
      body: 'Laser cutter needs help',
      url: '/resources/4/maintenance',
      sendEmail,
    });

    expect(sendEmail).toHaveBeenCalledWith(recipient);
    expect(push.sendToUser).toHaveBeenCalledWith(2, {
      title: 'Maintenance requested',
      body: 'Laser cutter needs help',
      url: '/resources/4/maintenance',
      tag: 'maintenance_requests',
    });
    expect(live.emitToUser).toHaveBeenCalledWith(2, {
      category: NotificationCategory.MAINTENANCE_REQUESTS,
      title: 'Maintenance requested',
      body: 'Laser cutter needs help',
      url: '/resources/4/maintenance',
      severity: 'info',
    });
  });

  it('skips disabled channels without affecting enabled channels', async () => {
    preferences.isChannelEnabled.mockImplementation(async (_userId, _category, channel) => {
      return channel !== NotificationChannel.PUSH;
    });
    const sendEmail = jest.fn().mockResolvedValue(undefined);

    await service.dispatch({
      category: NotificationCategory.PROJECT_INVITATIONS,
      recipients: [recipient],
      title: 'Project invite',
      body: 'You were invited',
      sendEmail,
    });

    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(push.sendToUser).not.toHaveBeenCalled();
    expect(live.emitToUser).toHaveBeenCalledTimes(1);
  });

  it('only checks and sends requested channels when a channel subset is provided', async () => {
    await service.dispatch({
      category: NotificationCategory.MESSAGES,
      recipients: [recipient],
      channels: [NotificationChannel.TOAST],
      title: 'alice',
      body: 'Hello there',
      url: '/messages?conversation=10',
    });

    expect(preferences.isChannelEnabled).toHaveBeenCalledWith(2, NotificationCategory.MESSAGES, NotificationChannel.TOAST);
    expect(preferences.isChannelEnabled).not.toHaveBeenCalledWith(
      2,
      NotificationCategory.MESSAGES,
      NotificationChannel.EMAIL,
    );
    expect(preferences.isChannelEnabled).not.toHaveBeenCalledWith(
      2,
      NotificationCategory.MESSAGES,
      NotificationChannel.PUSH,
    );
    expect(push.sendToUser).not.toHaveBeenCalled();
    expect(live.emitToUser).toHaveBeenCalledWith(2, {
      category: NotificationCategory.MESSAGES,
      title: 'alice',
      body: 'Hello there',
      url: '/messages?conversation=10',
      severity: 'info',
    });
  });

  it('excludes the actor from recipients', async () => {
    await service.dispatch({
      category: NotificationCategory.RESOURCE_USAGE_NOTES,
      recipients: [recipient],
      actorId: 2,
      title: 'Note added',
      body: 'A note was added',
    });

    expect(preferences.isChannelEnabled).not.toHaveBeenCalled();
    expect(push.sendToUser).not.toHaveBeenCalled();
    expect(live.emitToUser).not.toHaveBeenCalled();
  });

  it('continues other channels when one channel rejects', async () => {
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const sendEmail = jest.fn().mockRejectedValue(new Error('SMTP down'));

    await service.dispatch({
      category: NotificationCategory.RESOURCE_HEALTH,
      recipients: [recipient],
      title: 'Health changed',
      body: 'Resource is degraded',
      sendEmail,
    });

    expect(push.sendToUser).toHaveBeenCalledTimes(1);
    expect(live.emitToUser).toHaveBeenCalledTimes(1);
  });

  it('maps resource takeover email templates to the email service', async () => {
    await service.sendEmailTemplate(recipient, NotificationCategory.RESOURCE_TAKEOVER, {
      resource: { id: 4, name: 'Laser cutter' },
      takeover: { actorName: 'alice' },
    });

    expect(email.sendResourceTakeoverEmail).toHaveBeenCalledWith(
      recipient,
      { id: 4, name: 'Laser cutter' },
      { actorName: 'alice' },
    );
  });

  it('sends resource takeover email when email channel is enabled', async () => {
    const sendEmail = jest.fn().mockResolvedValue(undefined);

    await service.dispatch({
      category: NotificationCategory.RESOURCE_TAKEOVER,
      recipients: [recipient],
      title: 'Laser cutter was taken over',
      body: 'alice took over your active resource session.',
      sendEmail,
    });

    expect(sendEmail).toHaveBeenCalledWith(recipient);
  });

  it('does not send resource takeover email when email channel is disabled', async () => {
    preferences.isChannelEnabled.mockImplementation(async (_userId, _category, channel) => {
      return channel !== NotificationChannel.EMAIL;
    });
    const sendEmail = jest.fn().mockResolvedValue(undefined);

    await service.dispatch({
      category: NotificationCategory.RESOURCE_TAKEOVER,
      recipients: [recipient],
      title: 'Laser cutter was taken over',
      body: 'alice took over your active resource session.',
      sendEmail,
    });

    expect(sendEmail).not.toHaveBeenCalled();
    expect(push.sendToUser).toHaveBeenCalledTimes(1);
    expect(live.emitToUser).toHaveBeenCalledTimes(1);
  });
});
