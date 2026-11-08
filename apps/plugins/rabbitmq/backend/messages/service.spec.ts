import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Observable, Subject } from 'rxjs';
import {
  decodeLiveIdentifier,
  encodeLiveIdentifier,
  MAX_BATCH,
  MAX_BATCH_PAYLOAD_CHARS,
  MAX_FILTER_BYTES,
  MAX_PAYLOAD_BYTES,
  RabbitmqMessagesService,
  validateTopicFilter,
  type RabbitmqLiveEvent,
} from './service';
import { RABBITMQ_MANAGE_PERMISSION, RABBITMQ_VIEW_PERMISSION } from '../permissions';

const user = (...permissions: string[]) =>
  ({ id: 7, authenticationMethod: 'session', effectivePermissions: new Set(permissions) }) as never;

describe('topic filters and live identifiers', () => {
  it.each(['#', '+', 'a/b', 'a/+/c', 'a/#', '$SYS/#', 'x'.repeat(MAX_FILTER_BYTES)])('accepts %s', (filter) => {
    expect(validateTopicFilter(filter)).toBe(true);
  });
  it.each([
    '',
    'a#',
    'a/#/b',
    'a+/b',
    'a\0b',
    'x'.repeat(MAX_FILTER_BYTES + 1),
    // Multi-byte characters count in bytes.
    'ä'.repeat(43),
    '$share/group/#',
    '$share/g/a/b',
    '$queue/a/b',
  ])('rejects %j', (filter) => {
    expect(validateTopicFilter(filter)).toBe(false);
  });
  it('keeps the longest identifier within the host limit of 128 characters', () => {
    const identifier = encodeLiveIdentifier(9_999_999_999, 'x'.repeat(MAX_FILTER_BYTES));
    expect(identifier.length).toBeLessThanOrEqual(128);
    expect(decodeLiveIdentifier(identifier)).toEqual({
      mqttServerId: 9_999_999_999,
      filter: 'x'.repeat(MAX_FILTER_BYTES),
    });
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
    expect(decodeLiveIdentifier(encodeLiveIdentifier(3, '$share/g/#'))).toBeNull();
  });
  it('rejects identifiers for filters over the byte limit or over 128 characters', () => {
    expect(decodeLiveIdentifier(encodeLiveIdentifier(3, 'x'.repeat(MAX_FILTER_BYTES + 1)))).toBeNull();
    expect(decodeLiveIdentifier(`3.${'A'.repeat(115)}`)).toBeNull();
    expect(decodeLiveIdentifier(`3.${'A'.repeat(200)}`)).toBeNull();
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

    it('denies a user without permissions or without effective permissions', async () => {
      await expect(topic.authorize(subscription, user())).rejects.toBeInstanceOf(ForbiddenException);
      await expect(
        topic.authorize(subscription, { id: 7, authenticationMethod: 'session' } as never),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(getMqttServerConfig).not.toHaveBeenCalled();
    });

    it('rejects bad identifiers and unknown servers', async () => {
      const manager = user(RABBITMQ_MANAGE_PERMISSION);
      await expect(topic.authorize({ identifier: 'nope' }, manager)).rejects.toBeInstanceOf(NotFoundException);
      getMqttServerConfig.mockResolvedValue(null);
      await expect(topic.authorize(subscription, manager)).rejects.toBeInstanceOf(NotFoundException);
    });

    const streams = () => (service as unknown as { streams: Map<string, unknown> }).streams;

    const capture = () => {
      let handler!: (m: { topic: string; payload: Buffer }) => void;
      subscribe.mockImplementation(async (_id, _filter, h) => {
        handler = h;
        return { unsubscribe: jest.fn() };
      });
      const events: RabbitmqLiveEvent[] = [];
      const sub = topic.source(subscription, user(RABBITMQ_MANAGE_PERMISSION)).subscribe((e) => events.push(e.data));
      return { send: (m: { topic: string; payload: Buffer }) => handler(m), events, sub };
    };

    it('batches, truncates and counts dropped messages', async () => {
      const { send, events, sub } = capture();
      await Promise.resolve();
      send({ topic: 'a/b', payload: Buffer.from('hi') });
      send({ topic: 'big', payload: Buffer.alloc(MAX_PAYLOAD_BYTES + 10) });
      for (let i = 0; i < 300; i += 1) send({ topic: 'flood', payload: Buffer.from('x') });
      jest.advanceTimersByTime(250);
      expect(events).toHaveLength(1);
      const { messages, dropped, eventType } = events[0];
      expect(eventType).toBe('messages');
      expect(messages).toHaveLength(MAX_BATCH);
      // 302 sent, MAX_BATCH kept, the rest dropped before encoding.
      expect(dropped).toBe(302 - MAX_BATCH);
      expect(messages[0]).toMatchObject({ topic: 'a/b', size: 2, truncated: false });
      expect(Buffer.from(messages[0].payload, 'base64').toString()).toBe('hi');
      expect(messages[1]).toMatchObject({ size: MAX_PAYLOAD_BYTES + 10, truncated: true });
      expect(Buffer.from(messages[1].payload, 'base64')).toHaveLength(MAX_PAYLOAD_BYTES);

      // The next flush starts with an empty batch and a reset dropped count.
      send({ topic: 'later', payload: Buffer.from('y') });
      jest.advanceTimersByTime(250);
      expect(events[1]).toEqual({
        eventType: 'messages',
        messages: [expect.objectContaining({ topic: 'later' })],
        dropped: 0,
      });
      // Nothing pending and nothing dropped: no empty frame.
      jest.advanceTimersByTime(250);
      expect(events).toHaveLength(2);
      sub.unsubscribe();
    });

    it('caps the base64 payload per flush and counts the overflow as dropped', async () => {
      const { send, events, sub } = capture();
      await Promise.resolve();
      // Each full-size payload encodes to 87384 characters; 6 fit in 512 KiB.
      const perMessage = Math.ceil(MAX_PAYLOAD_BYTES / 3) * 4;
      const fitting = Math.floor(MAX_BATCH_PAYLOAD_CHARS / perMessage);
      for (let i = 0; i < 10; i += 1) send({ topic: 'big', payload: Buffer.alloc(MAX_PAYLOAD_BYTES) });
      // A small message still fits in the remaining budget.
      send({ topic: 'small', payload: Buffer.from('s') });
      jest.advanceTimersByTime(250);
      const { messages, dropped } = events[0];
      expect(messages).toHaveLength(fitting + 1);
      expect(dropped).toBe(10 - fitting);
      expect(messages.reduce((total, m) => total + m.payload.length, 0)).toBeLessThanOrEqual(MAX_BATCH_PAYLOAD_CHARS);
      expect(messages[fitting].topic).toBe('small');

      // The budget resets with each flush.
      send({ topic: 'big', payload: Buffer.alloc(MAX_PAYLOAD_BYTES) });
      jest.advanceTimersByTime(250);
      expect(events[1]).toMatchObject({ dropped: 0, messages: [expect.objectContaining({ topic: 'big' })] });
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
      expect(streams().size).toBe(0);
      expect(jest.getTimerCount()).toBe(0);
      // A later viewer opens a fresh subscription.
      topic.source(subscription, manager).subscribe().unsubscribe();
      await Promise.resolve();
      expect(subscribe).toHaveBeenCalledTimes(2);
      expect(streams().size).toBe(0);
      expect(jest.getTimerCount()).toBe(0);
    });

    it('releases a subscription acknowledged after the viewer left', async () => {
      const unsubscribe = jest.fn();
      const acknowledge = new Subject<void>();
      subscribe.mockImplementation(
        () => new Promise((resolve) => acknowledge.subscribe(() => resolve({ unsubscribe }))),
      );
      const sub = topic.source(subscription, user(RABBITMQ_MANAGE_PERMISSION)).subscribe();
      sub.unsubscribe();
      expect(streams().size).toBe(0);
      expect(jest.getTimerCount()).toBe(0);
      acknowledge.next();
      await Promise.resolve();
      await Promise.resolve();
      expect(unsubscribe).toHaveBeenCalledTimes(1);
    });

    it('errors the shared stream when the broker subscription fails, so the next viewer retries', async () => {
      subscribe.mockRejectedValueOnce(new Error('secret broker detail'));
      const manager = user(RABBITMQ_MANAGE_PERMISSION);
      const errors: unknown[] = [];
      const events: unknown[] = [];
      topic.source(subscription, manager).subscribe({ next: (e) => events.push(e), error: (e) => errors.push(e) });
      // A second viewer joins the same stream before the broker answers.
      topic.source(subscription, manager).subscribe({ error: (e) => errors.push(e) });
      expect(subscribe).toHaveBeenCalledTimes(1);
      await Promise.resolve();
      await Promise.resolve();
      expect(events).toEqual([]);
      expect(errors).toHaveLength(2);
      expect(String((errors[0] as Error).message)).not.toContain('secret');
      expect(streams().size).toBe(0);
      expect(jest.getTimerCount()).toBe(0);

      const unsubscribe = jest.fn();
      subscribe.mockResolvedValue({ unsubscribe });
      const later = topic.source(subscription, manager).subscribe();
      expect(subscribe).toHaveBeenCalledTimes(2);
      await Promise.resolve();
      later.unsubscribe();
      expect(unsubscribe).toHaveBeenCalledTimes(1);
    });

    it('does not error a stream whose viewers already left when the subscription fails', async () => {
      let reject!: (error: Error) => void;
      subscribe.mockImplementation(() => new Promise((_resolve, r) => (reject = r)));
      const error = jest.fn();
      const sub = topic.source(subscription, user(RABBITMQ_MANAGE_PERMISSION)).subscribe({ error });
      sub.unsubscribe();
      reject(new Error('late'));
      await Promise.resolve();
      await Promise.resolve();
      expect(error).not.toHaveBeenCalled();
      expect(streams().size).toBe(0);
    });

    it('audits the subscribed topic only', async () => {
      subscribe.mockResolvedValue({ unsubscribe: jest.fn() });
      topic.source(subscription, user(RABBITMQ_MANAGE_PERMISSION)).subscribe().unsubscribe();
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
