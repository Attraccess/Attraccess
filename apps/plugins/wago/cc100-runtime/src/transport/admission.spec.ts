import { EventEmitter } from 'node:events';
import type { MqttClient } from 'mqtt';
import {
  DropCounters,
  MAX_CONCURRENT_MESSAGES,
  MAX_WAITING_MESSAGES,
  SubscriptionAdmission,
} from './admission';
import { MqttTransport } from './mqtt';

const flush = () => new Promise((resolve) => setImmediate(resolve));
const body = (size = 10) => Buffer.alloc(size, 0x20);

function admission(maxBytes = 1024) {
  const counters = new DropCounters();
  const onError = jest.fn();
  return { counters, onError, admission: new SubscriptionAdmission(maxBytes, counters, onError) };
}

describe('subscription admission', () => {
  it('drops an oversized message before the handler sees it and counts it', async () => {
    const { admission: subject, counters } = admission(16);
    const handler = jest.fn();
    subject.admit(body(17), handler);
    subject.admit(body(16), handler);
    await flush();
    expect(handler).toHaveBeenCalledTimes(1);
    expect(counters.snapshot()).toEqual({ oversized: 1, overload: 0 });
  });

  it('runs at most 100 at once, queues 100 more and drops the rest', async () => {
    const { admission: subject, counters } = admission();
    const gates: Array<() => void> = [];
    let running = 0;
    let peak = 0;
    const handler = () =>
      new Promise<void>((resolve) => {
        running += 1;
        peak = Math.max(peak, running);
        gates.push(() => {
          running -= 1;
          resolve();
        });
      });
    for (let index = 0; index < MAX_CONCURRENT_MESSAGES + MAX_WAITING_MESSAGES + 5; index += 1)
      subject.admit(body(), handler);
    await flush();
    expect(gates).toHaveLength(MAX_CONCURRENT_MESSAGES);
    expect(counters.snapshot().overload).toBe(5);
    // Finishing one admits exactly one waiting message.
    gates[0]();
    await flush();
    expect(gates).toHaveLength(MAX_CONCURRENT_MESSAGES + 1);
    while (gates.length < MAX_CONCURRENT_MESSAGES + MAX_WAITING_MESSAGES) {
      gates[gates.length - MAX_CONCURRENT_MESSAGES]();
      await flush();
    }
    expect(peak).toBe(MAX_CONCURRENT_MESSAGES);
  });

  it('lets an early release hand the slot on while the work continues', async () => {
    const { admission: subject } = admission();
    const finish: Array<() => void> = [];
    let started = 0;
    const slow = async (_payload: Buffer, slot: { release(): void }) => {
      started += 1;
      slot.release();
      await new Promise<void>((resolve) => finish.push(resolve));
    };
    for (let index = 0; index < MAX_CONCURRENT_MESSAGES * 2; index += 1) subject.admit(body(), slow);
    await flush();
    expect(started).toBe(MAX_CONCURRENT_MESSAGES * 2);
    finish.forEach((resolve) => resolve());
  });

  it('reports a failing handler and frees its slot exactly once', async () => {
    const { admission: subject, onError } = admission();
    const failing = async (_payload: Buffer, slot: { release(): void }) => {
      slot.release();
      slot.release();
      throw new Error('boom');
    };
    for (let index = 0; index < MAX_CONCURRENT_MESSAGES + 1; index += 1) subject.admit(body(), failing);
    await flush();
    expect(onError).toHaveBeenCalledTimes(MAX_CONCURRENT_MESSAGES + 1);
  });
});

describe('MQTT transport admission', () => {
  function client() {
    return Object.assign(new EventEmitter(), {
      connected: true,
      disconnecting: false,
      outgoing: {},
      stream: { destroy: jest.fn() },
      subscribe: jest.fn((_topic: string, _options: unknown, callback: (error?: Error) => void) => callback()),
    });
  }

  it('applies the per-subscription cap and exposes the drop counters', async () => {
    const mqtt = client();
    const transport = new MqttTransport(mqtt as unknown as MqttClient, jest.fn());
    const listener = jest.fn();
    await transport.subscribe('commands', listener, { maxBytes: 64 });
    mqtt.emit('message', 'commands', body(65));
    mqtt.emit('message', 'commands', body(64));
    mqtt.emit('message', 'other', body(5000));
    await flush();
    expect(listener).toHaveBeenCalledTimes(1);
    expect(transport.dropCounts()).toEqual({ oversized: 1, overload: 0 });
  });

  it('caps a subscription at 64 KiB when it declares no cap', async () => {
    const mqtt = client();
    const transport = new MqttTransport(mqtt as unknown as MqttClient, jest.fn());
    const listener = jest.fn();
    await transport.subscribe('rotate', listener);
    mqtt.emit('message', 'rotate', body(64 * 1024 + 1));
    await flush();
    expect(listener).not.toHaveBeenCalled();
    expect(transport.dropCounts().oversized).toBe(1);
  });
});
