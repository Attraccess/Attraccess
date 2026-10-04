import { AuthenticatedUser } from '@attraccess/plugins-backend-sdk';
import { LivePacket, LiveSubscription } from '@attraccess/shared';
import { Subject } from 'rxjs';
import { LiveTopicsService } from './live-topics.service';
import { LiveUpdatesService } from './live-updates.service';
import { SseInstrumentation } from '../metrics/instrumentation/sse/sse.helper';

const id = '00000000-0000-4000-8000-000000000001';
const user = { id: 1, jwtTokenId: 'session-a', effectivePermissions: new Set() } as AuthenticatedUser;

describe('bundled server lifecycle', () => {
  let service: LiveUpdatesService;
  let topics: { parse: jest.Mock; authorize: jest.Mock; source: jest.Mock; setWebPresence: jest.Mock };
  let source: Subject<{ data: object }>;
  let packets: LivePacket[];
  beforeEach(() => {
    jest.useFakeTimers();
    packets = [];
    source = new Subject();
    topics = {
      parse: jest.fn((value) => value),
      authorize: jest.fn(async (_subscription: LiveSubscription) => undefined),
      source: jest.fn(async (_subscription: LiveSubscription) => source.asObservable()),
      setWebPresence: jest.fn(),
    };
    const metrics = { wrapTopic: jest.fn((_topic, observable) => observable) } as unknown as SseInstrumentation;
    service = new LiveUpdatesService(topics as unknown as LiveTopicsService, metrics);
  });
  afterEach(() => {
    service.onModuleDestroy();
    jest.useRealTimers();
  });
  const body = (subscriptions: LiveSubscription[], revision = 0) => ({ subscriptions, revision });

  it('deduplicates topics, changes sets in place, filters keepalives and releases on final disconnect', async () => {
    const connection = service.open(id, user).subscribe(({ data }) => packets.push(data));
    await service.update(id, user, body([{ topic: 'messaging' }, { topic: 'messaging' }]));
    expect(topics.source).toHaveBeenCalledTimes(1);
    expect(source.observed).toBe(true);
    source.next({ data: { keepalive: true } });
    source.next({ data: { id: 3 } });
    expect(packets.filter((p) => p.type === 'event')).toEqual([
      { type: 'event', event: { topic: 'messaging', eventType: 'update', payload: { id: 3 } } },
    ]);
    await service.update(id, user, body([{ topic: 'messaging' }, { topic: 'billing' }], 1));
    expect(topics.source).toHaveBeenCalledTimes(2);
    await service.update(id, user, body([{ topic: 'messaging' }], 2));
    expect(topics.source).toHaveBeenCalledTimes(2);
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
    topics.authorize.mockImplementation(async (s) => {
      if (s.topic === 'flow-logs') throw new Error('Forbidden');
    });
    await service.update(id, user, body([{ topic: 'messaging' }, { topic: 'flow-logs', resourceId: 1 }]));
    expect(topics.source).toHaveBeenCalledTimes(1);
    expect(packets).toContainEqual({
      type: 'rejected',
      subscription: { topic: 'flow-logs', resourceId: 1 },
      reason: 'Forbidden',
    });
    topics.authorize.mockRejectedValue(new Error('Revoked'));
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

  it('does not subscribe after asynchronous authorization finishes on a disconnected tab', async () => {
    let resolve!: () => void;
    topics.authorize.mockReturnValue(
      new Promise<void>((r) => {
        resolve = r;
      }),
    );
    const connection = service.open(id, user).subscribe();
    const pending = service.update(id, user, body([{ topic: 'resource', resourceId: 1 }]));
    await Promise.resolve();
    connection.unsubscribe();
    resolve();
    await pending;
    expect(topics.source).not.toHaveBeenCalled();
    expect(source.observed).toBe(false);
  });
});
