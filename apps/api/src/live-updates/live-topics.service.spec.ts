import { AuthenticatedUser } from '@attraccess/plugins-backend-sdk';
import { Resource } from '@attraccess/database-entities';
import { Repository } from 'typeorm';
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
    const resources = { existsBy: jest.fn(async ({ id }) => id === 1) };
    const service = new LiveTopicsService(
      resources as unknown as Repository<Resource>,
      {} as ResourceEventsService,
      {} as FlowLogRecorderService,
      billing as unknown as LiveNotificationsService,
      {} as MessagingLiveService,
      {} as NotificationLiveService,
      {} as SupervisionLiveService,
    );
    return { service, billing, users };
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
    const { service } = setup();
    const user = { id: 1, effectivePermissions: new Set() } as AuthenticatedUser;
    await expect(service.authorize({ topic: 'resource', resourceId: 1 }, user)).resolves.toBeUndefined();
    await expect(service.authorize({ topic: 'resource', resourceId: 2 }, user)).rejects.toThrow('not found');
    await expect(service.authorize({ topic: 'flow-logs', resourceId: 1 }, user)).rejects.toThrow('permission');
    user.effectivePermissions.add('resources.update');
    await expect(service.authorize({ topic: 'flow-logs', resourceId: 1 }, user)).resolves.toBeUndefined();
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
