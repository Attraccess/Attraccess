import { Subject } from 'rxjs';
import { MqttExplorerService } from './mqtt-explorer.service';
import { MAX_BATCH, MAX_BATCH_PAYLOAD_CHARS, MAX_PAYLOAD_BYTES, MqttExplorerEvent } from './mqtt-explorer.constants';

const user = { id: 7, authenticationMethod: 'session' } as never;

describe('MqttExplorerService', () => {
  const findOneBy = jest.fn();
  const subscribe = jest.fn();
  const publish = jest.fn();
  const recordAdministration = jest.fn();
  let service: MqttExplorerService;

  beforeEach(() => {
    jest.useFakeTimers();
    jest.resetAllMocks();
    findOneBy.mockResolvedValue({ id: 1, name: 'Broker' });
    publish.mockResolvedValue(undefined);
    recordAdministration.mockResolvedValue(undefined);
    service = new MqttExplorerService(
      { findOneBy } as never,
      { subscribe } as never,
      { publish } as never,
      { recordAdministration } as never,
    );
  });
  afterEach(() => jest.useRealTimers());

  const streams = () => (service as unknown as { streams: Map<string, unknown> }).streams;

  describe('subscribe', () => {
    const capture = async () => {
      let handler!: (topic: string, payload: Buffer) => void;
      subscribe.mockImplementation(async (_id, _filter, h) => {
        handler = h;
        return { unsubscribe: jest.fn() };
      });
      const events: MqttExplorerEvent[] = [];
      const stream = await service.subscribe(user, 1, '#');
      const sub = stream.subscribe((e) => events.push(e.data));
      return { send: (topic: string, payload: Buffer) => handler(topic, payload), events, sub };
    };

    it('answers 404 for an unknown server', async () => {
      findOneBy.mockResolvedValue(null);
      await expect(service.subscribe(user, 9, '#')).rejects.toMatchObject({ status: 404 });
    });

    it('batches, truncates and counts dropped messages', async () => {
      const { send, events, sub } = await capture();
      await Promise.resolve();
      send('a/b', Buffer.from('hi'));
      send('big', Buffer.alloc(MAX_PAYLOAD_BYTES + 10));
      for (let i = 0; i < 300; i += 1) send('flood', Buffer.from('x'));
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
      send('later', Buffer.from('y'));
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
      const { send, events, sub } = await capture();
      await Promise.resolve();
      // Each full-size payload encodes to 87384 characters; 6 fit in 512 KiB.
      const perMessage = Math.ceil(MAX_PAYLOAD_BYTES / 3) * 4;
      const fitting = Math.floor(MAX_BATCH_PAYLOAD_CHARS / perMessage);
      for (let i = 0; i < 10; i += 1) send('big', Buffer.alloc(MAX_PAYLOAD_BYTES));
      // A small message still fits in the remaining budget.
      send('small', Buffer.from('s'));
      jest.advanceTimersByTime(250);
      const { messages, dropped } = events[0];
      expect(messages).toHaveLength(fitting + 1);
      expect(dropped).toBe(10 - fitting);
      expect(messages.reduce((total, m) => total + m.payload.length, 0)).toBeLessThanOrEqual(MAX_BATCH_PAYLOAD_CHARS);
      expect(messages[fitting].topic).toBe('small');

      // The budget resets with each flush.
      send('big', Buffer.alloc(MAX_PAYLOAD_BYTES));
      jest.advanceTimersByTime(250);
      expect(events[1]).toMatchObject({ dropped: 0, messages: [expect.objectContaining({ topic: 'big' })] });
      sub.unsubscribe();
    });

    it('shares one broker subscription and releases it with the last viewer', async () => {
      const unsubscribe = jest.fn();
      subscribe.mockResolvedValue({ unsubscribe });
      const first = (await service.subscribe(user, 1, '#')).subscribe();
      const second = (await service.subscribe(user, 1, '#')).subscribe();
      await Promise.resolve();
      expect(subscribe).toHaveBeenCalledTimes(1);
      first.unsubscribe();
      expect(unsubscribe).not.toHaveBeenCalled();
      second.unsubscribe();
      expect(unsubscribe).toHaveBeenCalledTimes(1);
      expect(streams().size).toBe(0);
      expect(jest.getTimerCount()).toBe(0);
      // A later viewer opens a fresh subscription.
      (await service.subscribe(user, 1, '#')).subscribe().unsubscribe();
      await Promise.resolve();
      expect(subscribe).toHaveBeenCalledTimes(2);
      expect(streams().size).toBe(0);
    });

    it('keeps separate subscriptions per filter and per server', async () => {
      subscribe.mockResolvedValue({ unsubscribe: jest.fn() });
      const subs = [
        (await service.subscribe(user, 1, 'a/#')).subscribe(),
        (await service.subscribe(user, 1, 'b/#')).subscribe(),
        (await service.subscribe(user, 2, 'a/#')).subscribe(),
      ];
      expect(subscribe).toHaveBeenCalledTimes(3);
      subs.forEach((s) => s.unsubscribe());
    });

    it('releases a subscription acknowledged after the viewer left', async () => {
      const unsubscribe = jest.fn();
      const acknowledge = new Subject<void>();
      subscribe.mockImplementation(
        () => new Promise((resolve) => acknowledge.subscribe(() => resolve({ unsubscribe }))),
      );
      const sub = (await service.subscribe(user, 1, '#')).subscribe();
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
      const errors: unknown[] = [];
      const events: unknown[] = [];
      // A second viewer joins the same stream before the broker answers.
      const [first, second] = await Promise.all([service.subscribe(user, 1, '#'), service.subscribe(user, 1, '#')]);
      first.subscribe({ next: (e) => events.push(e), error: (e) => errors.push(e) });
      second.subscribe({ error: (e) => errors.push(e) });
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
      const later = (await service.subscribe(user, 1, '#')).subscribe();
      expect(subscribe).toHaveBeenCalledTimes(2);
      await Promise.resolve();
      later.unsubscribe();
      expect(unsubscribe).toHaveBeenCalledTimes(1);
    });

    it('does not error a stream whose viewers already left when the subscription fails', async () => {
      let reject!: (error: Error) => void;
      subscribe.mockImplementation(() => new Promise((_resolve, r) => (reject = r)));
      const error = jest.fn();
      const sub = (await service.subscribe(user, 1, '#')).subscribe({ error });
      sub.unsubscribe();
      reject(new Error('late'));
      await Promise.resolve();
      await Promise.resolve();
      expect(error).not.toHaveBeenCalled();
      expect(streams().size).toBe(0);
    });

    it('audits the subscribed topic only', async () => {
      subscribe.mockResolvedValue({ unsubscribe: jest.fn() });
      (await service.subscribe(user, 1, 'a/+/b')).subscribe().unsubscribe();
      expect(recordAdministration.mock.calls[0][0]).toEqual({
        action: 'mqtt_server.message_subscribe',
        actorId: 7,
        authenticationMethod: 'session',
        apiTokenId: undefined,
        subjectType: 'mqtt-server',
        subjectId: 1,
        details: { serverName: 'Broker', topic: 'a/+/b' },
      });
    });
  });

  describe('publish', () => {
    it('publishes through the shared client and audits topic and size only', async () => {
      await service.publish(user, 1, { topic: 'a/b', payload: 'héllo', qos: 1, retain: true });
      expect(publish).toHaveBeenCalledWith(1, 'a/b', 'héllo', { qos: 1, retain: true });
      const event = recordAdministration.mock.calls[0][0];
      expect(event).toMatchObject({
        action: 'mqtt_server.message_publish',
        details: { serverName: 'Broker', topic: 'a/b', size: 6, qos: 1, retain: 1 },
      });
      expect(JSON.stringify(event)).not.toContain('héllo');
    });

    it('defaults to QoS 0 without retain', async () => {
      await service.publish(user, 1, { topic: 't' });
      expect(publish).toHaveBeenCalledWith(1, 't', '', { qos: 0, retain: false });
    });

    it.each([
      [{ topic: '' }],
      [{ topic: 'a\0b' }],
      [{ topic: 'a/+' }],
      [{ topic: 'a/#' }],
      [{ topic: 'x'.repeat(1025) }],
      [{ topic: 'a', qos: 3 as never }],
      [{ topic: 'a', payload: 'x'.repeat(256 * 1024 + 1) }],
    ])('rejects %j', async (dto) => {
      await expect(service.publish(user, 1, dto)).rejects.toMatchObject({ status: 400 });
      expect(publish).not.toHaveBeenCalled();
    });

    it('answers 404 for an unknown server and hides broker errors', async () => {
      findOneBy.mockResolvedValue(null);
      await expect(service.publish(user, 9, { topic: 'a' })).rejects.toMatchObject({ status: 404 });
      findOneBy.mockResolvedValue({ id: 1, name: 'Broker' });
      publish.mockRejectedValue(new Error('mqtt://user:pass@host'));
      await expect(service.publish(user, 1, { topic: 'a' })).rejects.toMatchObject({
        status: 502,
        message: 'Publishing the message failed.',
      });
      expect(recordAdministration).not.toHaveBeenCalled();
    });

    it('does not fail when the audit sink throws', async () => {
      recordAdministration.mockRejectedValue(new Error('down'));
      await expect(service.publish(user, 1, { topic: 'a' })).resolves.toBeUndefined();
    });
  });
});
