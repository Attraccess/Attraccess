import type { PluginContext, PluginMqttMessage } from '@attraccess/plugins-backend-sdk';
import { WagoCommissioningReadiness } from './wago-commissioning-readiness';

describe('bounded commissioning runtime readiness', () => {
  let service: WagoCommissioningReadiness;
  let receive: (message: PluginMqttMessage) => void;
  const unsubscribe = jest.fn();
  const topic = 'attraccess/wago/v1/controllers/fixture/state';
  const time = Date.parse('2026-09-06T12:00:00.000Z');
  const now = new Date(time).toISOString();
  const payload = {
    timestamp: now,
    streamId: 'boot-a',
    sequence: 1,
    revision: 1,
    contentHash: 'a'.repeat(64),
    connected: true,
    outputs: { relay: false },
    inputs: { button: true },
    readiness: { configurationAccepted: true, hardwareAvailable: true, ready: true },
  };
  beforeEach(() => {
    jest.useFakeTimers({ now: time });
    unsubscribe.mockClear();
    service = new WagoCommissioningReadiness({
      mqtt: {
        subscribe: async (_server, _topic, handler) => {
          receive = handler;
          return { unsubscribe };
        },
      },
    } as unknown as PluginContext);
    service.observe(1, 'fixture', 'attraccess/wago');
  });
  afterEach(() => {
    service.onModuleDestroy();
    jest.useRealTimers();
  });
  const send = (value: unknown) => receive({ serverId: 1, topic, payload: Buffer.from(JSON.stringify(value)) });

  it('accepts current typed probes and downgrades on a later disconnected sample in the same millisecond', () => {
    send(payload);
    expect(service.observe(1, 'fixture', 'attraccess/wago')?.ready).toBe(true);
    send({ ...payload, sequence: 2, connected: false, readiness: { ...payload.readiness, ready: false } });
    expect(service.observe(1, 'fixture', 'attraccess/wago')?.ready).toBe(false);
    send(payload);
    expect(service.observe(1, 'fixture', 'attraccess/wago')?.ready).toBe(false);
  });

  it('invalidates malformed or future-dated evidence rather than retaining a ready probe', () => {
    send(payload);
    send({ ...payload, timestamp: new Date(Date.now() + 60_000).toISOString() });
    expect(service.observe(1, 'fixture', 'attraccess/wago')).toBeUndefined();
    send({ ...payload, readiness: { ready: 'true' } });
    expect(service.observe(1, 'fixture', 'attraccess/wago')).toBeUndefined();
  });

  it('does not restore an older ready observation after malformed input invalidates readiness', () => {
    send(payload);
    send({ ...payload, sequence: 2, readiness: { ...payload.readiness, ready: false } });
    send({ malformed: true });
    send(payload);
    expect(service.observe(1, 'fixture', 'attraccess/wago')).toBeUndefined();
  });

  it('rejects duplicate sequences even when their timestamp is later', () => {
    send({
      ...payload,
      timestamp: new Date(Date.now() - 10_000).toISOString(),
      readiness: { ...payload.readiness, ready: false },
    });
    send(payload);
    expect(service.observe(1, 'fixture', 'attraccess/wago')?.ready).toBe(false);
  });

  it.each([{ streamId: undefined }, { sequence: 0 }, { outputs: [] }, { timestamp: '2026-02-30T12:00:00.000Z' }])(
    'rejects noncanonical state %j',
    (invalid) => {
      send({ ...payload, ...invalid });
      expect(service.observe(1, 'fixture', 'attraccess/wago')).toBeUndefined();
    },
  );

  it('accepts a newer boot but never admits a retired boot again', () => {
    send({ ...payload, timestamp: new Date(time - 2_000).toISOString(), sequence: 50 });
    send({
      ...payload,
      streamId: 'boot-b',
      timestamp: new Date(time - 1_000).toISOString(),
      readiness: { ...payload.readiness, ready: false },
    });
    expect(service.observe(1, 'fixture', 'attraccess/wago')?.sequence).toBe(1);
    send({ ...payload, sequence: 51 });
    expect(service.observe(1, 'fixture', 'attraccess/wago')?.ready).toBe(false);
    send({ malformed: true });
    send({ ...payload, sequence: 52 });
    expect(service.observe(1, 'fixture', 'attraccess/wago')).toBeUndefined();
    send({ ...payload, streamId: 'boot-b', sequence: 2 });
    expect(service.observe(1, 'fixture', 'attraccess/wago')?.ready).toBe(true);
  });

  it('rejects a different boot with an equal or older source time', () => {
    send({ ...payload, readiness: { ...payload.readiness, ready: false } });
    send({ ...payload, streamId: 'boot-b' });
    send({ ...payload, streamId: 'boot-c', timestamp: new Date(time - 1).toISOString() });
    expect(service.observe(1, 'fixture', 'attraccess/wago')?.ready).toBe(false);
    send({ ...payload, sequence: 2 });
    expect(service.observe(1, 'fixture', 'attraccess/wago')?.ready).toBe(true);
  });

  it('does not admit an old or disconnected initial boot', () => {
    send({ ...payload, timestamp: new Date(time - 90_001).toISOString() });
    expect(service.observe(1, 'fixture', 'attraccess/wago')).toBeUndefined();
    send({ ...payload, connected: false });
    expect(service.observe(1, 'fixture', 'attraccess/wago')).toBeUndefined();
    send(payload);
    expect(service.observe(1, 'fixture', 'attraccess/wago')?.ready).toBe(true);
  });

  it.each([
    { connected: false },
    { revision: null, contentHash: null },
    { revision: 0 },
    { readiness: { ...payload.readiness, configurationAccepted: false } },
    { readiness: { ...payload.readiness, hardwareAvailable: false } },
  ])('never promotes contradictory readiness %j', (changed) => {
    send(payload);
    send({ ...payload, sequence: 2, ...changed });
    expect(service.observe(1, 'fixture', 'attraccess/wago')?.ready).toBe(false);
  });

  it('invalidates oversized input without forgetting the admitted sequence', () => {
    send(payload);
    receive({ serverId: 1, topic, payload: Buffer.alloc(65_537) });
    send(payload);
    expect(service.observe(1, 'fixture', 'attraccess/wago')).toBeUndefined();
    send({ ...payload, sequence: 2 });
    expect(service.observe(1, 'fixture', 'attraccess/wago')?.ready).toBe(true);
  });

  it('fails closed when bounded retired-stream tracking is exhausted', () => {
    for (let boot = 0; boot < 17; boot++) {
      send({ ...payload, streamId: `boot-${boot}`, timestamp: new Date(time - 17 + boot).toISOString() });
      expect(service.observe(1, 'fixture', 'attraccess/wago')?.ready).toBe(true);
    }
    send({ ...payload, streamId: 'boot-17' });
    expect(service.observe(1, 'fixture', 'attraccess/wago')).toBeUndefined();
    send({ ...payload, streamId: 'boot-16', sequence: 2 });
    expect(service.observe(1, 'fixture', 'attraccess/wago')).toBeUndefined();
  });

  it('ignores input from a different server or topic', () => {
    send(payload);
    receive({ serverId: 2, topic, payload: Buffer.from('{}') });
    receive({ serverId: 1, topic: `${topic}/other`, payload: Buffer.from('{}') });
    expect(service.observe(1, 'fixture', 'attraccess/wago')?.ready).toBe(true);
  });

  it('detaches subscriptions after destruction, including pending subscription creation', async () => {
    service.onModuleDestroy();
    await Promise.resolve();
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });
});
