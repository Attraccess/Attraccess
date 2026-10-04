import { AuthenticatedUser } from '@attraccess/plugins-backend-sdk';
import { LiveSubscription } from '@attraccess/shared';
import { Resource } from '@attraccess/database-entities';
import { In, Repository } from 'typeorm';
import { Subject } from 'rxjs';
import { LiveTopicsService } from './live-topics.service';
import { ResourceEventsService } from '../resources/sse/resource-events.service';
import { FlowLogRecorderService } from '../resources/flows/flow-log-recorder.service';
import { LiveNotificationsService } from '../billing/liveNotificationsService';
import { MessagingLiveService } from '../messaging/messaging-live.service';
import { NotificationLiveService } from '../notifications/notification-live.service';
import { SupervisionLiveService } from '../resources/supervision/supervision-live.service';

describe('live topic validation and user routing', () => {
  function setup() {
    const users = new Map<number, Subject<{ data: object }>>();
    const billing = {
      getTransactionSubject: jest.fn((userId: number) => {
        if (!users.has(userId)) users.set(userId, new Subject());
        return users.get(userId);
      }),
      deleteSubjectIfUnobserved: jest.fn(),
    };
    const resources = { find: jest.fn(async () => [{ id: 1 }]) };
    const service = new LiveTopicsService(
      resources as unknown as Repository<Resource>,
      {} as ResourceEventsService,
      {} as FlowLogRecorderService,
      billing as unknown as LiveNotificationsService,
      {} as MessagingLiveService,
      {} as NotificationLiveService,
      {} as SupervisionLiveService,
    );
    return { service, billing, users, resources };
  }
  it.each([
    null,
    {},
    { topic: 'unknown' },
    { topic: 'resource' },
    { topic: 'resource', resourceId: -1 },
    { topic: 'resource', resourceId: '1' },
    { topic: 'resource', resourceId: 1.1 },
    { topic: 'messaging', userId: 2 },
    { topic: 'billing', resourceId: 1 },
  ])('rejects invalid topic %j', (value) => {
    expect(() => setup().service.parse(value)).toThrow();
  });
  it('checks resource existence and flow-log permission independently', async () => {
    const { service, resources } = setup();
    const user = { id: 1, effectivePermissions: new Set() } as AuthenticatedUser;
    const subscriptions: LiveSubscription[] = [
      { topic: 'resource', resourceId: 1 },
      { topic: 'flow-logs', resourceId: 1 },
      { topic: 'resource', resourceId: 2 },
      { topic: 'resource', resourceId: 1 },
    ];
    const ids = await service.existingResourceIds(subscriptions);
    expect(resources.find).toHaveBeenCalledTimes(1);
    expect(resources.find).toHaveBeenCalledWith({ where: { id: In([1, 2]) }, select: { id: true } });
    expect(() => service.authorize({ topic: 'resource', resourceId: 1 }, user, ids)).not.toThrow();
    expect(() => service.authorize({ topic: 'resource', resourceId: 2 }, user, ids)).toThrow('not found');
    expect(() => service.authorize({ topic: 'flow-logs', resourceId: 1 }, user, ids)).toThrow('permission');
    user.effectivePermissions.add('resources.update');
    expect(() => service.authorize({ topic: 'flow-logs', resourceId: 1 }, user, ids)).not.toThrow();
    user.effectivePermissions.clear();
    const renewed = await service.existingResourceIds(subscriptions);
    expect(resources.find).toHaveBeenCalledTimes(2);
    expect(() => service.authorize({ topic: 'flow-logs', resourceId: 1 }, user, renewed)).toThrow('permission');
  });
  it('does not query resources when renewing only user topics', async () => {
    const { service, resources } = setup();
    await expect(service.existingResourceIds([{ topic: 'notifications' }, { topic: 'messaging' }])).resolves.toEqual(
      new Set(),
    );
    expect(resources.find).not.toHaveBeenCalled();
  });
  it('uses session user identity and isolates events between users', async () => {
    const { service, billing, users } = setup();
    const first: unknown[] = [],
      second: unknown[] = [];
    const a = (await service.source({ topic: 'billing' }, { id: 1 } as AuthenticatedUser)).subscribe((v) =>
      first.push(v),
    );
    const b = (await service.source({ topic: 'billing' }, { id: 2 } as AuthenticatedUser)).subscribe((v) =>
      second.push(v),
    );
    users.get(1).next({ data: { id: 5 } });
    expect(first).toEqual([{ data: { id: 5 } }]);
    expect(second).toEqual([]);
    a.unsubscribe();
    b.unsubscribe();
    expect(billing.deleteSubjectIfUnobserved.mock.calls).toEqual([[1], [2]]);
  });
});
