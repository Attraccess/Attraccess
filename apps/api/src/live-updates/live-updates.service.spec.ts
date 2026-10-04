import { AuthenticatedUser } from '@attraccess/plugins-backend-sdk';
import { LivePacket, LiveSubscription, liveSubscriptionKey } from '@attraccess/shared';
import { Subject } from 'rxjs';
import { LiveTopicsService } from './live-topics.service';
import { LiveUpdatesService } from './live-updates.service';
import { SseInstrumentation } from '../metrics/instrumentation/sse/sse.helper';

const id = '00000000-0000-4000-8000-000000000001';
const user = { id: 1, jwtTokenId: 'session-a', effectivePermissions: new Set() } as AuthenticatedUser;

describe('bundled server lifecycle', () => {
  let service: LiveUpdatesService;
  let topics: LiveTopicsService;
  let authorize: jest.Mock;
  let sourceFor: jest.Mock;
  let presence: jest.Mock;
  let source: Subject<{ data: object }>;
  let packets: LivePacket[];
  beforeEach(() => {
    jest.useFakeTimers();
    packets = [];
    source = new Subject();
    topics = new LiveTopicsService();
    authorize = jest.fn(async () => new Map<string, string>());
    sourceFor = jest.fn(async () => source.asObservable());
    presence = jest.fn();
    topics.register({
      topics: [
        { topic: 'resource', scope: 'resource' },
        { topic: 'flow-logs', scope: 'resource' },
      ],
      authorize,
      source: sourceFor,
    });
    for (const topic of ['billing', 'messaging', 'notifications', 'supervision'] as const) {
      topics.register({
        topics: [{ topic, scope: 'user' }],
        authorize,
        source: sourceFor,
        setPresence: topic === 'notifications' ? (_subscription, ...args) => presence(...args) : undefined,
      });
    }
    const metrics = { wrapTopic: jest.fn((_topic, observable) => observable) } as unknown as SseInstrumentation;
    service = new LiveUpdatesService(topics, metrics);
  });
  afterEach(() => {
    service.onModuleDestroy();
    jest.useRealTimers();
  });
  const body = (subscriptions: LiveSubscription[], revision = 0) => ({ subscriptions, revision });

  it('deduplicates topics, changes sets in place, filters keepalives and releases on final disconnect', async () => {
    const connection = service.open(id, user).subscribe(({ data }) => packets.push(data));
    await service.update(id, user, body([{ topic: 'messaging' }, { topic: 'messaging' }]));
    expect(sourceFor).toHaveBeenCalledTimes(1);
    expect(source.observed).toBe(true);
    source.next({ data: { keepalive: true } });
    source.next({ data: { id: 3 } });
    expect(packets.filter((p) => p.type === 'event')).toEqual([
      { type: 'event', event: { topic: 'messaging', eventType: 'update', payload: { id: 3 } } },
    ]);
    await service.update(id, user, body([{ topic: 'messaging' }, { topic: 'billing' }], 1));
    expect(sourceFor).toHaveBeenCalledTimes(2);
    await service.update(id, user, body([{ topic: 'messaging' }], 2));
    expect(sourceFor).toHaveBeenCalledTimes(2);
    connection.unsubscribe();
    expect(source.observed).toBe(false);
    expect(() => service.update(id, user, body([]))).toThrow('Live connection not found');
  });

  it('rejects cross-user and cross-session controls without changing delivery', async () => {
    service.open(id, user).subscribe();
    await service.update(id, user, body([{ topic: 'billing' }]));
    expect(() => service.update(id, { ...user, id: 2 }, body([]))).toThrow('another session');
    expect(() => service.update(id, { ...user, jwtTokenId: 'other' }, body([]))).toThrow('another session');
    expect(source.observed).toBe(true);
  });

  it('retains authorized subscriptions in a mixed set and revokes forbidden ones on renewal', async () => {
    service.open(id, user).subscribe(({ data }) => packets.push(data));
    authorize.mockImplementation(
      async (subscriptions: LiveSubscription[]) =>
        new Map(subscriptions.filter((s) => s.topic === 'flow-logs').map((s) => [liveSubscriptionKey(s), 'Forbidden'])),
    );
    await service.update(id, user, body([{ topic: 'messaging' }, { topic: 'flow-logs', resourceId: 1 }]));
    expect(sourceFor).toHaveBeenCalledTimes(1);
    expect(packets).toContainEqual({
      type: 'rejected',
      subscription: { topic: 'flow-logs', resourceId: 1 },
      reason: 'Forbidden',
    });
    authorize.mockImplementation(() => {
      throw new Error('Revoked');
    });
    await service.update(id, user, body([{ topic: 'messaging' }]));
    expect(source.observed).toBe(false);
  });

  it('ignores stale revisions and removes subjects on lease expiry', async () => {
    service.open(id, user).subscribe();
    await service.update(id, user, body([{ topic: 'messaging' }], 2));
    await service.update(id, user, body([], 1));
    expect(source.observed).toBe(true);
    jest.advanceTimersByTime(30_000);
    expect(source.observed).toBe(false);
    expect(() => service.update(id, user, body([]))).toThrow('not found');
  });

  it('does not subscribe after asynchronous resource validation finishes on a disconnected tab', async () => {
    let resolve!: (rejected: Map<string, string>) => void;
    authorize.mockReturnValue(
      new Promise<Map<string, string>>((r) => {
        resolve = r;
      }),
    );
    const connection = service.open(id, user).subscribe();
    const pending = service.update(id, user, body([{ topic: 'resource', resourceId: 1 }]));
    await Promise.resolve();
    connection.unsubscribe();
    resolve(new Map());
    await pending;
    expect(sourceFor).not.toHaveBeenCalled();
    expect(source.observed).toBe(false);
  });

  it('tracks notification visibility by connection and clears it on topic removal, revocation and disconnect', async () => {
    const otherId = '00000000-0000-4000-8000-000000000002';
    const first = service.open(id, user).subscribe();
    const second = service.open(otherId, user).subscribe();
    await service.update(id, user, { ...body([{ topic: 'notifications' }]), present: true });
    await service.update(otherId, user, { ...body([{ topic: 'notifications' }]), present: false });
    expect(presence).toHaveBeenCalledWith(user.id, id, true);
    expect(presence).toHaveBeenCalledWith(user.id, otherId, false);
    await service.update(id, user, body([{ topic: 'messaging' }], 1));
    expect(presence).toHaveBeenLastCalledWith(user.id, id, false);
    await service.update(id, user, { ...body([{ topic: 'notifications' }], 2), present: true });
    authorize.mockImplementation(() => {
      throw new Error('Revoked');
    });
    await service.update(id, user, body([{ topic: 'notifications' }], 2));
    expect(presence).toHaveBeenLastCalledWith(user.id, id, false);
    second.unsubscribe();
    expect(presence).toHaveBeenLastCalledWith(user.id, otherId, false);
    first.unsubscribe();
  });

  it.each(['complete', 'error'] as const)('clears provider presence when its source emits %s', async (end) => {
    service.open(id, user).subscribe();
    await service.update(id, user, { ...body([{ topic: 'notifications' }]), present: true });
    expect(presence).toHaveBeenLastCalledWith(user.id, id, true);
    if (end === 'error') source.error(new Error('Unavailable'));
    else source.complete();
    expect(presence).toHaveBeenLastCalledWith(user.id, id, false);
    // Renewal of a synchronously closed source must not restore presence.
    presence.mockClear();
    await service.update(id, user, { ...body([{ topic: 'notifications' }]), present: true });
    expect(presence).toHaveBeenCalledTimes(1);
    expect(presence).toHaveBeenCalledWith(user.id, id, false);
  });
});
