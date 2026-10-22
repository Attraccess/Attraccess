import { EventEmitter } from 'node:events';
import type { MqttClient } from 'mqtt';
import { WagoRuntime, hash } from '../../cc100-runtime/src/runtime';
import { AssuranceFixture, snapshot, type Device } from './fixture';

it('counts malformed operational ingress independently of parser and diagnostics rejections', () => {
  const fixture = new AssuranceFixture();
  fixture.observeOperationalPacket(`${fixture.prefix}/v1/controllers/controller-0/state`, Buffer.from('{invalid'));
  expect(fixture.counts).toMatchObject({ received: 1, protocolRejected: 1, diagnosticsRejected: 0, rejected: 1 });
  fixture.observeOperationalPacket(`${fixture.prefix}/v1/controllers/controller-0/commands`, Buffer.from('{invalid'));
  fixture.observeOperationalPacket('unrelated/state', Buffer.from('{invalid'));
  expect(fixture.counts.received).toBe(1);
});

it('retains MQTT acknowledgement timeouts across transport replacement', async () => {
  jest.useFakeTimers();
  const fixture = new AssuranceFixture();
  const device = { username: 'fixture', password: 'fixture' } as Device;
  fixture.devices.push(device);
  const connect = jest.spyOn(fixture, 'connect').mockImplementation(
    async () =>
      Object.assign(new EventEmitter(), {
        connected: true,
        disconnecting: false,
        outgoing: {},
        stream: { destroy: jest.fn() },
        publish: jest.fn(), // Withhold PUBACK to exercise the production deadline.
      }) as unknown as MqttClient,
  );
  const start = jest.spyOn(WagoRuntime.prototype, 'start').mockResolvedValue();
  try {
    await fixture.startDevice(device);
    expect(fixture.transportAcknowledgementTimeouts).toBe(0);
    const timeout = expect(device.transport.publish('state', {})).rejects.toThrow('timed out');
    await jest.advanceTimersByTimeAsync(10_000);
    await timeout;
    expect(fixture.transportAcknowledgementTimeouts).toBe(1);

    await fixture.startDevice(device);
    expect(device.transport.statistics.acknowledgementTimeouts).toBe(0);
    expect(fixture.transportAcknowledgementTimeouts).toBe(1);
    const replacementTimeout = expect(device.transport.publish('state', {})).rejects.toThrow('timed out');
    await jest.advanceTimersByTimeAsync(10_000);
    await replacementTimeout;
    expect(fixture.transportAcknowledgementTimeouts).toBe(2);
  } finally {
    start.mockRestore();
    connect.mockRestore();
    jest.useRealTimers();
  }
});

it('waits for restored backend subscriptions before requesting fresh telemetry', async () => {
  const fixture = new AssuranceFixture();
  fixture.backendSubscriptions.add('fixture/+/heartbeat');
  let subscribed = false;
  let release!: () => void;
  const subscription = new Promise<void>((resolve) => {
    release = resolve;
  });
  fixture.backendClient = {
    subscribeAsync: jest.fn(async () => {
      await subscription;
      subscribed = true;
    }),
  } as unknown as MqttClient;
  const publishHeartbeat = jest.fn(async () => {
    expect(subscribed).toBe(true);
  });
  fixture.devices.push({ id: 1, runtime: { publishHeartbeat } } as unknown as Device);
  fixture.backend = {
    diagnostics: {
      read: () => ({
        heartbeatAt: new Date().toISOString(),
        stateSourceAt: new Date().toISOString(),
        connected: true,
        revision: 1,
        contentHash: hash(snapshot),
        hardwareAvailable: true,
      }),
    },
  } as unknown as AssuranceFixture['backend'];
  const fresh = fixture.fresh();
  await Promise.resolve();
  expect(publishHeartbeat).not.toHaveBeenCalled();
  release();
  await fresh;
  expect(fixture.backendClient.subscribeAsync).toHaveBeenCalledWith({
    'fixture/+/heartbeat': { qos: 1 },
    resubscribe: true,
  });
  expect(publishHeartbeat).toHaveBeenCalledTimes(1);
});
