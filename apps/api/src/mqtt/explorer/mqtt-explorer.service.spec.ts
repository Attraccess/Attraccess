import { Subject } from 'rxjs';
import { In } from 'typeorm';
import { projectAuditRow } from '../../audit/recorder/audit-row';
import { MqttServerChangedEvent } from '../mqtt-server-changed.event';
import { ExplorerConnectionReset, ExplorerViewer } from './mqtt-explorer-connections.service';
import { auditText, MqttExplorerService } from './mqtt-explorer.service';
import {
  FAILURE_COOL_DOWN_MS,
  MAX_BATCH,
  MAX_BATCH_PAYLOAD_CHARS,
  MAX_PAYLOAD_BYTES,
  MAX_VIEWS_PER_USER,
  MqttExplorerEvent,
  SUBSCRIBE_AUDIT_WINDOW_MS,
} from './mqtt-explorer.constants';

const user = { id: 7, authenticationMethod: 'session' } as never;
const otherUser = { id: 8, authenticationMethod: 'session' } as never;

describe('MqttExplorerService', () => {
  const findOneBy = jest.fn();
  const find = jest.fn();
  const subscribe = jest.fn();
  const publish = jest.fn();
  const record = jest.fn();
  let service: MqttExplorerService;

  beforeEach(() => {
    jest.useFakeTimers();
    jest.resetAllMocks();
    findOneBy.mockResolvedValue({ id: 1, name: 'Broker', defaultPublishQos: 0, defaultPublishRetain: false });
    publish.mockResolvedValue(undefined);
    record.mockResolvedValue(undefined);
    subscribe.mockResolvedValue({ unsubscribe: jest.fn() });
    service = new MqttExplorerService(
      { findOneBy, find } as never,
      { subscribe } as never,
      { publish } as never,
      { record } as never,
    );
  });
  afterEach(() => jest.useRealTimers());

  const streams = () => (service as unknown as { streams: Map<string, unknown> }).streams;
  const audited = (action: string) =>
    record.mock.calls.map(([event]) => event).filter((event) => event.action === action);
  const settle = async () => {
    for (let i = 0; i < 5; i += 1) await Promise.resolve();
  };

  describe('subscribe', () => {
    // `keepReady`: keep the empty batch announcing the acknowledged subscription.
    const capture = async ({ keepReady = false } = {}) => {
      let viewer!: ExplorerViewer;
      subscribe.mockImplementation(async (_id, _filter, v: ExplorerViewer) => {
        viewer = v;
        return { unsubscribe: jest.fn() };
      });
      const events: MqttExplorerEvent[] = [];
      const errors: unknown[] = [];
      const stream = await service.subscribe(user, 1, '#');
      const sub = stream.subscribe({ next: (e) => events.push(e.data), error: (e) => errors.push(e) });
      if (!keepReady) {
        await settle();
        events.length = 0;
      }
      return {
        send: (topic: string, payload: Buffer) => viewer.onMessage(topic, payload),
        viewer,
        events,
        errors,
        sub,
      };
    };

    it('tells viewers once the broker acknowledged the subscription, even before any message', async () => {
      const { events } = await capture({ keepReady: true });
      await settle();
      expect(events).toEqual([{ eventType: 'messages', messages: [], dropped: 0 }]);
    });

    it('opens no stream for a view that is never watched', async () => {
      await service.subscribe(user, 1, '#');
      expect(streams().size).toBe(0);
      expect(subscribe).not.toHaveBeenCalled();
    });

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

    it('errors the shared stream when the broker subscription fails, without the broker text', async () => {
      subscribe.mockRejectedValueOnce(new Error('secret broker detail'));
      const errors: unknown[] = [];
      const events: unknown[] = [];
      // A second viewer joins the same stream before the broker answers.
      const [first, second] = await Promise.all([service.subscribe(user, 1, '#'), service.subscribe(user, 1, '#')]);
      first.subscribe({ next: (e) => events.push(e), error: (e) => errors.push(e) });
      second.subscribe({ error: (e) => errors.push(e) });
      expect(subscribe).toHaveBeenCalledTimes(1);
      await settle();
      expect(events).toEqual([]);
      expect(errors).toHaveLength(2);
      expect((errors[0] as Error).message).toBe('The broker subscription failed.');
      expect(streams().size).toBe(0);
      expect(jest.getTimerCount()).toBe(0);
    });

    it('errors the stream once when the connection dies after the subscription succeeded', async () => {
      const { viewer, errors, events } = await capture();
      await settle();
      viewer.onError('failed');
      viewer.onError('failed');
      expect(errors).toHaveLength(1);
      expect((errors[0] as Error).message).toBe('The broker subscription failed.');
      expect(events).toEqual([]);
      expect(streams().size).toBe(0);
    });

    it('does not error a stream whose viewers already left when the subscription fails', async () => {
      let reject!: (error: Error) => void;
      subscribe.mockImplementation(() => new Promise((_resolve, r) => (reject = r)));
      const error = jest.fn();
      const sub = (await service.subscribe(user, 1, '#')).subscribe({ error });
      sub.unsubscribe();
      reject(new Error('late'));
      await settle();
      expect(error).not.toHaveBeenCalled();
      expect(streams().size).toBe(0);
    });

    describe('after a failure', () => {
      const failOnce = async (failure: Error = new Error('refused')) => {
        subscribe.mockRejectedValueOnce(failure);
        const error = jest.fn();
        (await service.subscribe(user, 1, '#')).subscribe({ error });
        await settle();
        expect(error).toHaveBeenCalled();
        record.mockClear();
        subscribe.mockClear();
      };

      it('refuses the filter for the cool-down, without connecting or auditing, then allows it again', async () => {
        await failOnce();
        // The client re-sends the rejected subscription on every renewal.
        jest.advanceTimersByTime(10_000);
        await expect(service.subscribe(user, 1, '#')).rejects.toMatchObject({ status: 503 });
        await expect(service.subscribe(otherUser, 1, '#')).rejects.toMatchObject({ status: 503 });
        expect(subscribe).not.toHaveBeenCalled();
        expect(record).not.toHaveBeenCalled();

        // Other filters and servers are not affected.
        (await service.subscribe(user, 1, 'a')).subscribe().unsubscribe();
        (await service.subscribe(user, 2, '#')).subscribe().unsubscribe();

        jest.advanceTimersByTime(FAILURE_COOL_DOWN_MS - 10_000);
        (await service.subscribe(user, 1, '#')).subscribe().unsubscribe();
        await settle();
        expect(subscribe).toHaveBeenCalledWith(1, '#', expect.anything());
      });

      it('also cools down when an open connection dies', async () => {
        const { viewer } = await capture();
        await settle();
        viewer.onError('failed');
        await expect(service.subscribe(user, 1, '#')).rejects.toMatchObject({ status: 503 });
      });

      it('lifts the cool-down for a server whose settings changed, and only for that server', async () => {
        await failOnce();
        subscribe.mockRejectedValueOnce(new Error('refused'));
        (await service.subscribe(user, 12, '#')).subscribe({ error: jest.fn() });
        await settle();
        service.onServerChanged(new MqttServerChangedEvent(1));
        await expect(service.subscribe(user, 1, '#')).resolves.toBeDefined();
        await expect(service.subscribe(user, 12, '#')).rejects.toMatchObject({ status: 503 });
      });

      it('does not cool down when the server was changed or deleted', async () => {
        await failOnce(new ExplorerConnectionReset());
        await expect(service.subscribe(user, 1, '#')).resolves.toBeDefined();
        const { viewer } = await capture();
        await settle();
        viewer.onError('reset');
        await expect(service.subscribe(user, 1, '#')).resolves.toBeDefined();
      });
    });

    describe('audit', () => {
      it('records the subscribed topic only, with the session identity', async () => {
        (await service.subscribe(user, 1, 'a/+/b')).subscribe().unsubscribe();
        expect(record.mock.calls[0][0]).toEqual({
          domain: 'administration',
          action: 'mqtt_server.message_subscribe',
          actor: { id: 7, authenticationMethod: 'session' },
          subject: { type: 'mqtt-server', id: 1 },
          details: { serverName: 'Broker', topic: 'a/+/b' },
        });
      });

      it('passes an API token identity through', async () => {
        const tokenUser = { id: 9, authenticationMethod: 'api-token', apiTokenId: 3 } as never;
        (await service.subscribe(tokenUser, 1, '#')).subscribe().unsubscribe();
        expect(record.mock.calls[0][0]).toMatchObject({
          actor: { id: 9, authenticationMethod: 'api-token', apiTokenId: 3 },
        });
        expect(projectAuditRow(record.mock.calls[0][0])).not.toBeNull();
      });

      it('records a subscription once per user, server and filter within the window', async () => {
        for (let i = 0; i < 3; i += 1) {
          (await service.subscribe(user, 1, '#')).subscribe().unsubscribe();
          jest.advanceTimersByTime(10_000);
        }
        expect(audited('mqtt_server.message_subscribe')).toHaveLength(1);

        (await service.subscribe(otherUser, 1, '#')).subscribe().unsubscribe();
        (await service.subscribe(user, 1, 'a')).subscribe().unsubscribe();
        (await service.subscribe(user, 2, '#')).subscribe().unsubscribe();
        expect(audited('mqtt_server.message_subscribe')).toHaveLength(4);

        jest.advanceTimersByTime(SUBSCRIBE_AUDIT_WINDOW_MS);
        (await service.subscribe(user, 1, '#')).subscribe().unsubscribe();
        expect(audited('mqtt_server.message_subscribe')).toHaveLength(5);
      });

      it('still returns the stream when the audit record is dropped', async () => {
        record.mockResolvedValue({ status: 'unavailable' });
        const events: MqttExplorerEvent[] = [];
        let viewer!: ExplorerViewer;
        subscribe.mockImplementation(async (_id, _filter, v: ExplorerViewer) => {
          viewer = v;
          return { unsubscribe: jest.fn() };
        });
        const sub = (await service.subscribe(user, 1, '#')).subscribe((e) => events.push(e.data));
        viewer.onMessage('a', Buffer.from('1'));
        jest.advanceTimersByTime(250);
        expect(events).toHaveLength(1);
        sub.unsubscribe();
      });

      it('keeps records valid for a long multibyte topic and a server name with control characters', async () => {
        findOneBy.mockResolvedValue({ id: 1, name: `Work\tshop ${'é'.repeat(300)}` });
        // Filters are at most 256 bytes, so at most 256 UTF-16 units; publish topics may be 1024 bytes.
        const topic = `${'😀'.repeat(60)}/#`;
        (await service.subscribe(user, 1, topic)).subscribe().unsubscribe();
        await service.publish(user, 1, { topic: `x/${'😀'.repeat(200)}` });
        const events = record.mock.calls.map(([event]) => event);
        expect(events).toHaveLength(2);
        for (const event of events) {
          expect(projectAuditRow(event)).not.toBeNull();
          expect(event.details.serverName).toMatch(/^Work\uFFFDshop é+$/);
          expect(event.details.serverName).toHaveLength(256);
        }
        expect(events[0].details.topic).toBe(topic);
        expect(events[1].details.topic).toBe(`x/${'😀'.repeat(127)}`);
      });
    });

    describe('per-user view limit', () => {
      it(`allows ${MAX_VIEWS_PER_USER} views per user and refuses more without auditing`, async () => {
        const views = [];
        for (let i = 0; i < MAX_VIEWS_PER_USER; i += 1) {
          views.push((await service.subscribe(user, 1, `t/${i}`)).subscribe());
        }
        record.mockClear();
        await expect(service.subscribe(user, 1, 't/x')).rejects.toMatchObject({ status: 429 });
        // The same filter again is another view too.
        await expect(service.subscribe(user, 1, 't/0')).rejects.toMatchObject({ status: 429 });
        expect(record).not.toHaveBeenCalled();
        // Another user has their own allowance.
        (await service.subscribe(otherUser, 1, 't/x')).subscribe().unsubscribe();

        views[0].unsubscribe();
        views.push((await service.subscribe(user, 1, 't/x')).subscribe());
        views.forEach((view) => view.unsubscribe());
      });

      it('gives a slot back when the stream errors', async () => {
        const viewers: ExplorerViewer[] = [];
        subscribe.mockImplementation(async (_id, _filter, v: ExplorerViewer) => {
          viewers.push(v);
          return { unsubscribe: jest.fn() };
        });
        for (let i = 0; i < MAX_VIEWS_PER_USER; i += 1) {
          (await service.subscribe(user, 1, `t/${i}`)).subscribe({ error: () => undefined });
        }
        await settle();
        viewers[0].onError('reset');
        await expect(service.subscribe(user, 1, 't/x')).resolves.toBeDefined();
      });

      it('gives back a slot whose stream was never watched', async () => {
        for (let i = 0; i < MAX_VIEWS_PER_USER; i += 1) await service.subscribe(user, 1, `t/${i}`);
        await expect(service.subscribe(user, 1, 't/x')).rejects.toMatchObject({ status: 429 });
        jest.advanceTimersByTime(10_000);
        await expect(service.subscribe(user, 1, 't/x')).resolves.toBeDefined();
      });
    });
  });

  describe('existingServerIds', () => {
    it('looks the distinct ids up in one query', async () => {
      find.mockResolvedValue([{ id: 1 }, { id: 3 }]);
      await expect(service.existingServerIds([1, 2, 1, 3])).resolves.toEqual(new Set([1, 3]));
      expect(find).toHaveBeenCalledTimes(1);
      expect(find).toHaveBeenCalledWith({ where: { id: In([1, 2, 3]) }, select: { id: true } });
    });

    it('does not query for an empty set', async () => {
      await expect(service.existingServerIds([])).resolves.toEqual(new Set());
      expect(find).not.toHaveBeenCalled();
    });
  });

  describe('publish', () => {
    const completion = { acknowledgementTimeoutSeconds: 10 };

    it('publishes through the shared client and audits topic and size only', async () => {
      await service.publish(user, 1, { topic: 'a/b', payload: 'héllo', qos: 1, retain: true });
      expect(publish).toHaveBeenCalledWith(1, 'a/b', 'héllo', { qos: 1, retain: true }, completion);
      const event = record.mock.calls[0][0];
      expect(event).toMatchObject({
        action: 'mqtt_server.message_publish',
        details: { serverName: 'Broker', topic: 'a/b', size: 6, qos: 1, retain: 1 },
      });
      expect(JSON.stringify(event)).not.toContain('héllo');
    });

    it('uses the server defaults when QoS or retain are omitted, and audits the effective values', async () => {
      findOneBy.mockResolvedValue({ id: 1, name: 'Broker', defaultPublishQos: 2, defaultPublishRetain: true });
      await service.publish(user, 1, { topic: 't' });
      expect(publish).toHaveBeenCalledWith(1, 't', '', { qos: 2, retain: true }, completion);
      expect(record.mock.calls[0][0].details).toMatchObject({ qos: 2, retain: 1, size: 0 });

      await service.publish(user, 1, { topic: 't', qos: 0, retain: false });
      expect(publish).toHaveBeenLastCalledWith(1, 't', '', { qos: 0, retain: false }, completion);
      expect(record.mock.calls[1][0].details).toMatchObject({ qos: 0, retain: 0 });
    });

    it('falls back to QoS 0 without retain when the server has no usable defaults', async () => {
      findOneBy.mockResolvedValue({ id: 1, name: 'Broker', defaultPublishQos: null, defaultPublishRetain: null });
      await service.publish(user, 1, { topic: 't' });
      expect(publish).toHaveBeenCalledWith(1, 't', '', { qos: 0, retain: false }, completion);
    });

    it.each([
      [{ topic: '' }],
      [{ topic: 'a\0b' }],
      [{ topic: 'a\tb' }],
      [{ topic: 'a\u0085b' }],
      [{ topic: 'a/+' }],
      [{ topic: 'a/#' }],
      [{ topic: 'x'.repeat(1025) }],
      // 513 × 2 bytes: the limit counts UTF-8 bytes.
      [{ topic: 'ä'.repeat(513) }],
      [{ topic: 'a', qos: 3 as never }],
      [{ topic: 'a', payload: 'x'.repeat(256 * 1024 + 1) }],
      [{ topic: 'a', payload: 'ä'.repeat(128 * 1024 + 1) }],
      [{ topic: 'a', payload: 42 as never }],
      [{ topic: 42 as never }],
    ])('rejects %#', async (dto) => {
      await expect(service.publish(user, 1, dto)).rejects.toMatchObject({ status: 400 });
      expect(publish).not.toHaveBeenCalled();
    });

    it('accepts topics and payloads right at the byte limits', async () => {
      await service.publish(user, 1, { topic: 'x'.repeat(1024), payload: 'ä'.repeat(128 * 1024) });
      await service.publish(user, 1, { topic: 'ä'.repeat(512) });
      expect(publish).toHaveBeenCalledTimes(2);
      expect(record.mock.calls[0][0].details.size).toBe(256 * 1024);
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
      expect(record).not.toHaveBeenCalled();
    });

    it('does not fail when the audit record is dropped', async () => {
      record.mockResolvedValue({ status: 'unavailable' });
      await expect(service.publish(user, 1, { topic: 'a' })).resolves.toBeUndefined();
    });
  });
});

describe('auditText', () => {
  it('replaces control characters and keeps plain text', () => {
    expect(auditText('a\tb\u0000c\u007fd\u0085e')).toBe('a\uFFFDb\uFFFDc\uFFFDd\uFFFDe');
    expect(auditText('Workshop')).toBe('Workshop');
  });

  it('truncates to 256 UTF-16 units without splitting a surrogate pair', () => {
    expect(auditText('x'.repeat(300))).toHaveLength(256);
    // 'x' + 127 emoji = 255 units; the next emoji would need 2 more.
    const cut = auditText(`x${'😀'.repeat(200)}`);
    expect(cut).toBe(`x${'😀'.repeat(127)}`);
    expect(cut).toHaveLength(255);
  });
});
