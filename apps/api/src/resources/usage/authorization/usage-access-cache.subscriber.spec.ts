import { EventEmitter } from 'node:events';
import { Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Redis } from 'ioredis';
import { MetricsService } from '../../../metrics/metrics.service';
import { RbacService } from '../../../users-and-auth/rbac/rbac.service';
import { UserPermissionsChangedEvent } from '../../../users-and-auth/rbac/events/user-permissions-changed.event';
import {
  AUTHORIZATION_CACHE_INVALIDATION_CHANNEL,
  authorizationCacheInvalidationSource,
} from '../../../users-and-auth/rbac/authorization-cache-invalidation';
import { ResourceRetrainingService } from '../../retraining/resourceRetraining.service';
import { RESOURCE_USAGE_LOG_CONTEXT } from '../lifecycle/usage-lifecycle';
import { UsageAccessCache } from './usage-access-cache';
import { UsageAccessRules } from './usage-access-rules';

// A bare EventEmitter throws on an `error` nobody listens to, like ioredis' "Unhandled error event" (ATT-1230).
class FakeSubscriber extends EventEmitter {
  subscribe = jest.fn().mockResolvedValue(1);
  disconnect = jest.fn();
}

describe('UsageAccessCache authorization cache invalidation subscriber', () => {
  let subscriber: FakeSubscriber;
  let valkeyClient: { duplicate: jest.Mock };
  let eventEmitter: { emit: jest.Mock };
  let warn: jest.SpyInstance;
  let log: jest.SpyInstance;
  let error: jest.SpyInstance;

  const createCache = (client: Redis | null) =>
    new UsageAccessCache(
      {} as UsageAccessRules,
      {} as ResourceRetrainingService,
      {} as MetricsService,
      {} as RbacService,
      eventEmitter as unknown as EventEmitter2,
      client,
    );

  beforeEach(() => {
    subscriber = new FakeSubscriber();
    valkeyClient = { duplicate: jest.fn(() => subscriber) };
    eventEmitter = { emit: jest.fn() };
    warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    log = jest.spyOn(Logger.prototype, 'log').mockImplementation();
    error = jest.spyOn(Logger.prototype, 'error').mockImplementation();
  });

  afterEach(() => jest.restoreAllMocks());

  it('does nothing without Valkey', async () => {
    await expect(createCache(null).subscribe()).resolves.toBeUndefined();
    expect(warn).not.toHaveBeenCalled();
    expect(log).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
  });

  it('listens for errors before it subscribes', async () => {
    let errorListeners = -1;
    subscriber.subscribe.mockImplementation(async () => {
      errorListeners = subscriber.listenerCount('error');
      return 1;
    });

    await createCache(valkeyClient as unknown as Redis).subscribe();

    expect(subscriber.subscribe).toHaveBeenCalledWith(AUTHORIZATION_CACHE_INVALIDATION_CHANNEL);
    expect(errorListeners).toBe(1);
  });

  it('logs one warning per outage and one line when it reconnects', async () => {
    await createCache(valkeyClient as unknown as Redis).subscribe();

    subscriber.emit('ready');
    expect(log).not.toHaveBeenCalled();

    subscriber.emit('error', new Error('connect ECONNREFUSED'));
    subscriber.emit('error', new Error('connect ECONNREFUSED'));
    subscriber.emit('error', new Error('connect ECONNREFUSED'));
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('lost its Valkey connection (connect ECONNREFUSED)'));
    expect(warn.mock.contexts[0]).toMatchObject({ context: RESOURCE_USAGE_LOG_CONTEXT });

    subscriber.emit('ready');
    expect(log).toHaveBeenCalledTimes(1);
    expect(log).toHaveBeenCalledWith(expect.stringContaining('reconnected'));
    subscriber.emit('ready');
    expect(log).toHaveBeenCalledTimes(1);

    subscriber.emit('error', new Error('connect ECONNREFUSED'));
    subscriber.emit('error', new Error('connect ECONNREFUSED'));
    expect(warn).toHaveBeenCalledTimes(2);
  });

  it('starts a new subscriber without the previous outage', async () => {
    const cache = createCache(valkeyClient as unknown as Redis);
    await cache.subscribe();
    subscriber.emit('error', new Error('connect ECONNREFUSED'));
    cache.unsubscribe();
    expect(subscriber.disconnect).toHaveBeenCalled();

    const previous = subscriber;
    subscriber = new FakeSubscriber();
    await cache.subscribe();
    subscriber.emit('ready');
    subscriber.emit('error', new Error('connect ECONNREFUSED'));
    expect(log).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledTimes(2);

    previous.emit('ready');
    expect(log).toHaveBeenCalledTimes(1);
    subscriber.emit('error', new Error('connect ECONNREFUSED'));
    expect(warn).toHaveBeenCalledTimes(2);
  });

  it('logs the error message without the AUTH password, or the code when the message is empty', async () => {
    await createCache(valkeyClient as unknown as Redis).subscribe();

    const authError = Object.assign(new Error('WRONGPASS invalid username-password pair'), {
      command: { name: 'auth', args: ['default', 'secret-password'] },
    });
    subscriber.emit('error', authError);
    subscriber.emit('ready');
    subscriber.emit('error', Object.assign(new AggregateError([]), { code: 'ECONNREFUSED' }));

    expect(warn).toHaveBeenCalledTimes(2);
    expect(warn.mock.calls[0]).toEqual([expect.stringContaining('(WRONGPASS invalid username-password pair)')]);
    expect(JSON.stringify(warn.mock.calls)).not.toContain('secret-password');
    expect(warn.mock.calls[1]).toEqual([expect.stringContaining('(ECONNREFUSED)')]);
  });

  it('still forwards invalidations from other instances', async () => {
    await createCache(valkeyClient as unknown as Redis).subscribe();

    subscriber.emit(
      'message',
      AUTHORIZATION_CACHE_INVALIDATION_CHANNEL,
      JSON.stringify({ source: 'other', userId: 3 }),
    );
    subscriber.emit(
      'message',
      AUTHORIZATION_CACHE_INVALIDATION_CHANNEL,
      JSON.stringify({ source: authorizationCacheInvalidationSource, userId: 4 }),
    );

    expect(eventEmitter.emit).toHaveBeenCalledTimes(1);
    expect(eventEmitter.emit).toHaveBeenCalledWith(
      UserPermissionsChangedEvent.EVENT_NAME,
      new UserPermissionsChangedEvent(3),
    );
  });

  it('gives up and disconnects when the initial subscribe fails, logging only the message', async () => {
    subscriber.subscribe.mockRejectedValue(
      Object.assign(new Error('WRONGPASS invalid username-password pair'), {
        command: { name: 'auth', args: ['default', 'secret-password'] },
      }),
    );
    const cache = createCache(valkeyClient as unknown as Redis);

    await cache.subscribe();

    expect(subscriber.disconnect).toHaveBeenCalledTimes(1);
    expect(error).toHaveBeenCalledWith(
      'Failed to subscribe to authorization cache invalidations (WRONGPASS invalid username-password pair)',
    );
    expect(JSON.stringify(error.mock.calls)).not.toContain('secret-password');
    cache.unsubscribe();
    expect(subscriber.disconnect).toHaveBeenCalledTimes(1);
  });
});
