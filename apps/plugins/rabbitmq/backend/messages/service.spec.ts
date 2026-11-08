import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Observable, Subject } from 'rxjs';
import {
  decodeLiveIdentifier,
  encodeLiveIdentifier,
  MAX_PAYLOAD_BYTES,
  RabbitmqMessagesService,
  validateTopicFilter,
  type RabbitmqLiveEvent,
} from './service';
import { RABBITMQ_MANAGE_PERMISSION, RABBITMQ_VIEW_PERMISSION } from '../permissions';

const user = (...permissions: string[]) =>
  ({ id: 7, authenticationMethod: 'session', effectivePermissions: new Set(permissions) }) as never;

describe('topic filters and live identifiers', () => {
  it.each(['#', '+', 'a/b', 'a/+/c', 'a/#', '$SYS/#'])('accepts %s', (filter) => {
    expect(validateTopicFilter(filter)).toBe(true);
  });
  it.each(['', 'a#', 'a/#/b', 'a+/b', 'a\0b', 'x'.repeat(257)])('rejects %j', (filter) => {
    expect(validateTopicFilter(filter)).toBe(false);
  });
  it('round-trips filters with / + #', () => {
    const identifier = encodeLiveIdentifier(3, 'a/+/b/#');
    expect(identifier).toMatch(/^3\.[A-Za-z0-9_-]+$/);
    expect(decodeLiveIdentifier(identifier)).toEqual({ mqttServerId: 3, filter: 'a/+/b/#' });
  });
  it('rejects malformed identifiers', () => {
    expect(decodeLiveIdentifier(undefined)).toBeNull();
    expect(decodeLiveIdentifier('0.abc')).toBeNull();
    expect(decodeLiveIdentifier('3.not base64!')).toBeNull();
    expect(decodeLiveIdentifier(`3.${Buffer.from('a#b').toString('base64url')}`)).toBeNull();
  });
});

describe('RabbitmqMessagesService', () => {
  const getMqttServerConfig = jest.fn();
  const subscribe = jest.fn();
  const publish = jest.fn();
  const record = jest.fn();
  const register = jest.fn();
  let topic: {
    authorize: (s: unknown, u: never) => Promise<void>;
    source: (s: unknown, u: never) => Observable<{ data: RabbitmqLiveEvent }>;
  };
  let service: RabbitmqMessagesService;

  beforeEach(() => {
    jest.useFakeTimers();
    jest.resetAllMocks();
    getMqttServerConfig.mockResolvedValue({ id: 1 });
    publish.mockResolvedValue(undefined);
    record.mockResolvedValue({ status: 'recorded' });
    service = new RabbitmqMessagesService({
      getMqttServerConfig,
      mqtt: { subscribe, publish },
      audit: { record },
      liveUpdates: { register },
      logger: { warn: jest.fn() },
    } as never);
    service.onModuleInit();
    topic = register.mock.calls[0][0];
  });
  afterEach(() => jest.useRealTimers());

  describe('live topic', () => {
    const subscription = { identifier: encodeLiveIdentifier(1, '#') };

    it('requires the identifier and the manage permission', async () => {
      expect(topic).toMatchObject({ topic: 'messages', identifier: 'required' });
      await expect(topic.authorize(subscription, user(RABBITMQ_VIEW_PERMISSION))).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      await expect(topic.authorize(subscription, user(RABBITMQ_MANAGE_PERMISSION))).resolves.toBeUndefined();
    });

    it('rejects bad identifiers and unknown servers', async () => {
      const manager = user(RABBITMQ_MANAGE_PERMISSION);
      await expect(topic.authorize({ identifier: 'nope' }, manager)).rejects.toBeInstanceOf(NotFoundException);
      getMqttServerConfig.mockResolvedValue(null);
      await expect(topic.authorize(subscription, manager)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('batches, truncates and counts dropped messages', async () => {
      let handler!: (m: { topic: string; payload: Buffer }) => void;
      subscribe.mockImplementation(async (_id, _filter, h) => {
        handler = h;
        return { unsubscribe: jest.fn() };
      });
      const events: { data: RabbitmqLiveEvent }[] = [];
      const sub = topic.source(subscription, user(RABBITMQ_MANAGE_PERMISSION)).subscribe((e) => events.push(e));
      await Promise.resolve();
      handler({ topic: 'a/b', payload: Buffer.from('hi') });
      handler({ topic: 'big', payload: Buffer.alloc(MAX_PAYLOAD_BYTES + 10) });
      for (let i = 0; i < 300; i += 1) handler({ topic: 'flood', payload: Buffer.from('x') });
      jest.advanceTimersByTime(250);
      expect(events).toHaveLength(1);
      const { messages, dropped, eventType } = events[0].data as Extract<RabbitmqLiveEvent, { eventType: 'messages' }>;
      expect(eventType).toBe('messages');
      expect(messages).toHaveLength(50);
      // 302 sent, 200 kept pending, 150 of those over the batch cap.
      expect(dropped).toBe(102 + 150);
      expect(messages[0]).toMatchObject({ topic: 'a/b', size: 2, truncated: false });
      expect(Buffer.from(messages[0].payload, 'base64').toString()).toBe('hi');
      expect(messages[1]).toMatchObject({ size: MAX_PAYLOAD_BYTES + 10, truncated: true });
      expect(Buffer.from(messages[1].payload, 'base64')).toHaveLength(MAX_PAYLOAD_BYTES);
      sub.unsubscribe();
    });

    it('shares one MQTT subscription and releases it with the last viewer', async () => {
      const unsubscribe = jest.fn();
      subscribe.mockResolvedValue({ unsubscribe });
      const manager = user(RABBITMQ_MANAGE_PERMISSION);
      const first = topic.source(subscription, manager).subscribe();
      const second = topic.source(subscription, manager).subscribe();
      await Promise.resolve();
      expect(subscribe).toHaveBeenCalledTimes(1);
      first.unsubscribe();
      expect(unsubscribe).not.toHaveBeenCalled();
      second.unsubscribe();
      expect(unsubscribe).toHaveBeenCalledTimes(1);
      // A later viewer opens a fresh subscription.
      topic.source(subscription, manager).subscribe().unsubscribe();
      await Promise.resolve();
      expect(subscribe).toHaveBeenCalledTimes(2);
    });

    it('releases a subscription acknowledged after the viewer left', async () => {
      const unsubscribe = jest.fn();
      const acknowledge = new Subject<void>();
      subscribe.mockImplementation(
        () => new Promise((resolve) => acknowledge.subscribe(() => resolve({ unsubscribe }))),
      );
      const sub = topic.source(subscription, user(RABBITMQ_MANAGE_PERMISSION)).subscribe();
      sub.unsubscribe();
      acknowledge.next();
      await Promise.resolve();
      await Promise.resolve();
      expect(unsubscribe).toHaveBeenCalledTimes(1);
    });

    it('signals unavailable when the broker subscription fails and audits topic only', async () => {
      subscribe.mockRejectedValue(new Error('secret broker detail'));
      const events: { data: RabbitmqLiveEvent }[] = [];
      topic.source(subscription, user(RABBITMQ_MANAGE_PERMISSION)).subscribe((e) => events.push(e));
      await Promise.resolve();
      await Promise.resolve();
      expect(events).toEqual([{ data: { eventType: 'unavailable' } }]);
      expect(record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'rabbitmq.message_subscribe',
          principal: { userId: 7, authenticationMethod: 'session' },
          subject: { type: 'rabbitmq.mqtt_server', id: 1 },
          details: { topic: '#' },
        }),
      );
    });
  });

  describe('publish', () => {
    const actor = user(RABBITMQ_MANAGE_PERMISSION);

    it('publishes through the shared connection and audits topic and size only', async () => {
      await service.publish(actor, 1, { topic: 'a/b', payload: 'héllo', qos: 1, retain: true });
      expect(publish).toHaveBeenCalledWith(1, 'a/b', 'héllo', { qos: 1, retain: true });
      const event = record.mock.calls[0][0];
      expect(event.details).toEqual({ topic: 'a/b', size: 6, qos: 1, retain: true });
      expect(JSON.stringify(event)).not.toContain('héllo');
    });

    it('defaults to QoS 0 without retain', async () => {
      await service.publish(actor, 1, { topic: 't' });
      expect(publish).toHaveBeenCalledWith(1, 't', '', { qos: 0, retain: false });
    });

    it.each([
      [{ topic: '' }],
      [{ topic: 'a/+' }],
      [{ topic: 'a/#' }],
      [{ topic: 'a', qos: 3 as never }],
      [{ topic: 'a', payload: 'x'.repeat(256 * 1024 + 1) }],
    ])('rejects %j', async (dto) => {
      await expect(service.publish(actor, 1, dto)).rejects.toMatchObject({ status: 400 });
      expect(publish).not.toHaveBeenCalled();
    });

    it('answers 404 for an unknown server and hides broker errors', async () => {
      getMqttServerConfig.mockResolvedValue(null);
      await expect(service.publish(actor, 9, { topic: 'a' })).rejects.toMatchObject({ status: 404 });
      getMqttServerConfig.mockResolvedValue({ id: 1 });
      publish.mockRejectedValue(new Error('amqp://user:pass@host'));
      await expect(service.publish(actor, 1, { topic: 'a' })).rejects.toMatchObject({
        status: 502,
        message: 'Publishing the message failed.',
      });
      expect(record).not.toHaveBeenCalled();
    });

    it('does not fail when the audit sink throws', async () => {
      record.mockRejectedValue(new Error('down'));
      await expect(service.publish(actor, 1, { topic: 'a' })).resolves.toBeUndefined();
    });
  });
});
