import { AuthenticatedUser } from '@attraccess/plugins-backend-sdk';
import { LiveSubscription } from '@attraccess/shared';
import { Subject } from 'rxjs';
import { LiveTopicsService } from './live-topics.service';
import { LiveTopicProvider } from './live-topic-provider';

const user = { id: 1 } as AuthenticatedUser;

describe('live topic provider registry', () => {
  function setup() {
    const service = new LiveTopicsService();
    const source = jest.fn(() => new Subject<{ data: object }>());
    service.register({
      topics: [
        { topic: 'resource', scope: 'resource' },
        { topic: 'flow-logs', scope: 'resource' },
        { topic: 'messaging', scope: 'user' },
        { topic: 'billing', scope: 'user' },
      ],
      source,
    });
    return { service, source };
  }

  it.each([
    null,
    [],
    {},
    { topic: 'unknown' },
    { topic: 'resource' },
    { topic: 'resource', resourceId: -1 },
    { topic: 'resource', resourceId: 0 },
    { topic: 'resource', resourceId: '1' },
    { topic: 'resource', resourceId: 1.1 },
    { topic: 'resource', resourceId: Number.MAX_SAFE_INTEGER + 1 },
    { topic: 'resource', resourceId: 1, identifier: 'device' },
    { topic: 'resource', resourceId: 1, extra: true },
    { topic: 'messaging', userId: 2 },
    { topic: 'billing', resourceId: 1 },
    { topic: 'billing', identifier: undefined },
  ])('rejects invalid topic %j', (value) => {
    expect(() => setup().service.parse(value)).toThrow();
  });

  it.each(['none', 'required', 'optional'] as const)(
    'preserves plugin identifier mode %s and strict fields',
    (mode) => {
      const service = new LiveTopicsService();
      const topic = `plugin:test:${mode}` as const;
      service.register({ topics: [{ topic, scope: 'plugin', identifier: mode }], source: () => new Subject() });
      if (mode === 'required') {
        expect(() => service.parse({ topic })).toThrow();
        expect(() => service.parse({ topic, identifier: undefined })).toThrow();
      } else {
        expect(service.parse({ topic })).toEqual({ topic });
        expect(service.parse({ topic, identifier: undefined })).toEqual({ topic });
      }
      if (mode === 'none') {
        expect(() => service.parse({ topic, identifier: 'device' })).toThrow();
      } else {
        expect(service.parse({ topic, identifier: 'device' })).toEqual({ topic, identifier: 'device' });
        expect(service.parse({ topic, identifier: 'x'.repeat(128) })).toEqual({ topic, identifier: 'x'.repeat(128) });
      }
      for (const identifier of ['', null, 1, 'x'.repeat(129)]) {
        expect(() => service.parse({ topic, identifier })).toThrow();
      }
      expect(() => service.parse({ topic, resourceId: 1 })).toThrow();
      expect(() => service.parse({ topic, identifier: 'device', extra: true })).toThrow();
    },
  );

  it('routes only registered topics and can accept a provider after construction', async () => {
    const service = new LiveTopicsService();
    expect(() => service.parse({ topic: 'billing' })).toThrow('Unsupported');
    const source = jest.fn(() => new Subject<{ data: object }>());
    service.register({ topics: [{ topic: 'billing', scope: 'user' }], source });
    const subscription = service.parse({ topic: 'billing' });
    await service.source(subscription, user);
    expect(source).toHaveBeenCalledWith(subscription, user);
    expect(() => service.parse({ topic: 'messaging' })).toThrow('Unsupported');
  });

  it('rejects conflicting registrations atomically and retains the original provider', () => {
    const { service, source } = setup();
    const replacement = jest.fn();
    expect(() =>
      service.register({
        topics: [
          { topic: 'notifications', scope: 'user' },
          { topic: 'billing', scope: 'user' },
        ],
        source: replacement,
      }),
    ).toThrow('already registered');
    expect(() => service.parse({ topic: 'notifications' })).toThrow('Unsupported');
    service.source({ topic: 'billing' }, user);
    expect(source).toHaveBeenCalledTimes(1);
    expect(replacement).not.toHaveBeenCalled();
    expect(() =>
      service.register({
        topics: [
          { topic: 'notifications', scope: 'user' },
          { topic: 'notifications', scope: 'user' },
        ],
        source: replacement,
      }),
    ).toThrow('already registered');
    expect(() => service.parse({ topic: 'notifications' })).toThrow('Unsupported');
  });

  it('batches validation by provider and isolates a provider failure from other topics', async () => {
    const service = new LiveTopicsService();
    const resourceAuthorization = jest.fn(async () => new Map([['flow-logs:1', 'Forbidden']]));
    const billingAuthorization = jest.fn(async () => {
      throw new Error('Unavailable');
    });
    const source = () => new Subject<{ data: object }>();
    service.register({
      topics: [
        { topic: 'resource', scope: 'resource' },
        { topic: 'flow-logs', scope: 'resource' },
      ],
      authorize: resourceAuthorization,
      source,
    });
    service.register({ topics: [{ topic: 'billing', scope: 'user' }], authorize: billingAuthorization, source });
    service.register({ topics: [{ topic: 'messaging', scope: 'user' }], source });
    const subscriptions: LiveSubscription[] = [
      { topic: 'resource', resourceId: 1 },
      { topic: 'flow-logs', resourceId: 1 },
      { topic: 'billing' },
      { topic: 'messaging' },
    ];
    await expect(service.authorize(subscriptions, user)).resolves.toEqual(
      new Map([
        ['flow-logs:1', 'Forbidden'],
        ['billing:', 'Unavailable'],
      ]),
    );
    expect(resourceAuthorization).toHaveBeenCalledTimes(1);
    expect(resourceAuthorization).toHaveBeenCalledWith(subscriptions.slice(0, 2), user);
    await service.authorize(subscriptions, user);
    expect(resourceAuthorization).toHaveBeenCalledTimes(2);
  });

  it('dispatches presence to whichever provider owns the topic', () => {
    const service = new LiveTopicsService();
    const provider: LiveTopicProvider = {
      topics: [{ topic: 'billing', scope: 'user' }],
      source: () => new Subject(),
      setPresence: jest.fn(),
    };
    service.register(provider);
    service.setPresence({ topic: 'billing' }, user.id, 'connection', true);
    expect(provider.setPresence).toHaveBeenCalledWith({ topic: 'billing' }, user.id, 'connection', true);
  });
});
