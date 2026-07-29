import { Test, TestingModule } from '@nestjs/testing';
import { Resource, User } from '@attraccess/database-entities';
import { ResourceUsageSessionEndedEvent, ResourceUsageSessionTakenOverEvent } from './events/resource-usage.events';
import { ResourceSessionNotificationListener } from './resource-session-notification.listener';
import { NotificationDispatchService } from '../../notifications/notification-dispatch.service';
import { NotificationCategory } from '../../notifications/notification-types';

describe('ResourceSessionNotificationListener', () => {
  let listener: ResourceSessionNotificationListener;
  let notifications: { dispatch: jest.Mock; sendEmailTemplate: jest.Mock };

  beforeEach(async () => {
    notifications = {
      dispatch: jest.fn().mockResolvedValue(undefined),
      sendEmailTemplate: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ResourceSessionNotificationListener,
        { provide: NotificationDispatchService, useValue: notifications },
      ],
    }).compile();

    listener = module.get(ResourceSessionNotificationListener);
  });

  it('notifies the previous user when their resource session is taken over', async () => {
    const bob = { id: 2, username: 'bob', locale: 'en' } as User;
    await listener.handleTakenOver(
      new ResourceUsageSessionTakenOverEvent(
        { id: 4, name: 'Laser cutter' } as Resource,
        new Date('2026-01-01T12:00:00.000Z'),
        { id: 1, username: 'alice' } as User,
        bob,
      ),
    );

    expect(notifications.dispatch).toHaveBeenCalledWith({
      category: NotificationCategory.RESOURCE_TAKEOVER,
      recipients: [expect.objectContaining({ id: 2 })],
      actorId: 1,
      title: expect.any(Function),
      body: expect.any(Function),
      url: '/resources/4',
      severity: 'warning',
      sendEmail: expect.any(Function),
    });

    const req = notifications.dispatch.mock.calls[0][0];
    expect(req.title(bob)).toBe('Laser cutter was taken over');
    expect(req.body(bob)).toBe('alice took over your active resource session.');
  });

  it('sends resource takeover email through the notification dispatcher callback', async () => {
    await listener.handleTakenOver(
      new ResourceUsageSessionTakenOverEvent(
        { id: 4, name: 'Laser cutter' } as Resource,
        new Date('2026-01-01T12:00:00.000Z'),
        { id: 1, username: 'alice' } as User,
        { id: 2, username: 'bob' } as User,
      ),
    );

    const dispatchRequest = notifications.dispatch.mock.calls[0][0];
    await dispatchRequest.sendEmail({ id: 2, email: 'bob@example.com' } as User);

    expect(notifications.sendEmailTemplate).toHaveBeenCalledWith(
      expect.objectContaining({ id: 2 }),
      NotificationCategory.RESOURCE_TAKEOVER,
      {
        resource: { id: 4, name: 'Laser cutter' },
        takeover: { actorName: 'alice' },
      },
    );
  });

  it('notifies the session owner when another actor ends their resource session', async () => {
    const owner = { id: 2, username: 'bob', email: 'bob@example.com', locale: 'en' } as User;
    const actor = { id: 1, username: 'alice' } as User;
    const resource = { id: 4, name: 'Laser cutter' } as Resource;

    await listener.handleSessionEnded(
      new ResourceUsageSessionEndedEvent(
        {
          id: 10,
          user: owner,
          userId: owner.id,
          resource,
          resourceId: resource.id,
          endTime: new Date('2026-01-01T12:00:00.000Z'),
        } as never,
        actor,
      ),
    );

    expect(notifications.dispatch).toHaveBeenCalledWith({
      category: NotificationCategory.RESOURCE_SESSION_ENDED,
      recipients: [owner],
      actorId: actor.id,
      title: expect.any(Function),
      body: expect.any(Function),
      url: '/resources/4',
      severity: 'warning',
      dedupeKey: 'resource_session_ended:10',
      sendEmail: expect.any(Function),
    });

    const request = notifications.dispatch.mock.calls[0][0];
    expect(request.title(owner)).toBe('Laser cutter session ended');
    expect(request.body(owner)).toBe('alice ended your active resource session.');
    await request.sendEmail(owner);
    expect(notifications.sendEmailTemplate).toHaveBeenCalledWith(owner, NotificationCategory.RESOURCE_SESSION_ENDED, {
      resource: { id: 4, name: 'Laser cutter' },
      session: { id: 10, endedAt: new Date('2026-01-01T12:00:00.000Z'), endedBy: 'alice' },
    });
  });

  it('does not notify when the user ends their own session', async () => {
    const owner = { id: 2, username: 'bob', email: 'bob@example.com' } as User;
    const resource = { id: 4, name: 'Laser cutter' } as Resource;

    await listener.handleSessionEnded(
      new ResourceUsageSessionEndedEvent(
        {
          id: 10,
          user: owner,
          userId: owner.id,
          resource,
          resourceId: resource.id,
          endTime: new Date('2026-01-01T12:00:00.000Z'),
        } as never,
        { id: owner.id, username: owner.username },
      ),
    );

    expect(notifications.dispatch).not.toHaveBeenCalled();
  });

  it('notifies when the system (null endedBy) ends the session', async () => {
    const owner = { id: 2, username: 'bob', email: 'bob@example.com', locale: 'en' } as User;
    const resource = { id: 4, name: 'Laser cutter' } as Resource;

    await listener.handleSessionEnded(
      new ResourceUsageSessionEndedEvent(
        {
          id: 10,
          user: owner,
          userId: owner.id,
          resource,
          resourceId: resource.id,
          endTime: new Date('2026-01-01T12:00:00.000Z'),
        } as never,
        null,
      ),
    );

    const request = notifications.dispatch.mock.calls[0][0];
    expect(request.category).toBe(NotificationCategory.RESOURCE_SESSION_ENDED);
    expect(request.body(owner)).toBe('The system ended your active resource session.');
  });
});
