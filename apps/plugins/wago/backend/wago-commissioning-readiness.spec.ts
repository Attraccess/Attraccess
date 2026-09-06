import type { PluginContext, PluginMqttMessage } from '@attraccess/plugins-backend-sdk';
import { WagoCommissioningReadiness } from './wago-commissioning-readiness';

describe('bounded commissioning runtime readiness', () => {
  let service: WagoCommissioningReadiness;
  let receive: (message: PluginMqttMessage) => void;
  const unsubscribe = jest.fn();
  const topic = 'attraccess/wago/v1/controllers/fixture/state';
  const now = new Date().toISOString();
  const payload = {
    timestamp: now,
    sequence: 1,
    revision: 1,
    contentHash: 'a'.repeat(64),
    connected: true,
    readiness: { configurationAccepted: true, hardwareAvailable: true, ready: true },
  };
  beforeEach(() => {
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
  afterEach(() => service.onModuleDestroy());
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

  it('detaches subscriptions after destruction, including pending subscription creation', async () => {
    service.onModuleDestroy();
    await Promise.resolve();
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });
});
