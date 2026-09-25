import { EventEmitter } from 'node:events';

class FakeMqtt extends EventEmitter {
  connected = true;
  subscribe = jest.fn((_topic, _options, callback) => callback());
  publish = jest.fn((_topic, _payload, _options, callback) => callback());
  end = jest.fn((_force?, callback?) => callback?.());
}

const mockClients: FakeMqtt[] = [];
let mockState: Record<string, unknown>;
const mockStore = {
  load: jest.fn(async () => mockState),
  save: jest.fn(async (state) => {
    mockState = structuredClone(state);
  }),
};
const mockRuntime = {
  start: jest.fn(async (ready) => ready?.()),
  setConnected: jest.fn(async () => undefined),
  publishHeartbeat: jest.fn(async () => undefined),
  publishMeasurements: jest.fn(async () => undefined),
  pollInputs: jest.fn(async () => undefined),
  acknowledgeCredentialRotation: jest.fn(async () => undefined),
  retryCredentialRotationSubscription: jest.fn(async () => undefined),
};
const mockDevice = { restore: jest.fn(), read: jest.fn(async () => true) };
jest.mock('mqtt', () => ({
  connect: jest.fn(() => {
    const client = new FakeMqtt();
    mockClients.push(client);
    return client;
  }),
}));
jest.mock('./runtime', () => ({
  JsonStateStore: jest.fn(() => mockStore),
  WagoRuntime: jest.fn(() => mockRuntime),
  validateDesired: jest.fn(() => []),
}));
jest.mock('./adapters', () => ({ Cc100OnboardIoAdapter: jest.fn(() => mockDevice) }));
jest.mock('./simulator-device', () => ({ SimulatorDeviceAdapter: jest.fn(() => mockDevice) }));

const originalEnv = { ...process.env };
const originalExitCode = process.exitCode;
const flush = async () => {
  for (let i = 0; i < 30; i++) await Promise.resolve();
};
let handlers: Map<string, (...args: unknown[]) => void>;
beforeEach(() => {
  jest.resetModules();
  jest.clearAllMocks();
  jest.useFakeTimers();
  mockClients.length = 0;
  mockState = {};
  handlers = new Map();
  process.env = {
    ...originalEnv,
    WAGO_MQTT_URL: 'mqtt://simulator.test',
    WAGO_HARDWARE_ID: 'test-device',
    WAGO_PAIRING_CODE: '123456',
    WAGO_ENROLLMENT_SECRET: 'local-secret',
    WAGO_ENROLLMENT_USERNAME: 'enrollment',
    WAGO_ENROLLMENT_PASSWORD: 'local-password',
    WAGO_INITIAL_VALUES: '{"point":true,"number":2}',
  };
  jest.spyOn(process, 'on').mockImplementation(((event, callback) => {
    handlers.set(event, callback);
    return process;
  }) as typeof process.on);
  // The simulator's failure path disconnects IPC; never close Jest's worker channel.
  if (process.disconnect) jest.spyOn(process, 'disconnect').mockImplementation(() => undefined);
  jest.spyOn(process.stdout, 'write').mockReturnValue(true);
  jest.spyOn(process.stderr, 'write').mockReturnValue(true);
});
afterEach(() => {
  jest.clearAllTimers();
  jest.useRealTimers();
  jest.restoreAllMocks();
  process.env = originalEnv;
  process.exitCode = originalExitCode;
});

async function boot() {
  await import('./simulator');
  await flush();
}

test.each([
  ['mqtt://broker.test', undefined, undefined, {}],
  ['mqtts://broker.test', 'true', 'broker.internal', { rejectUnauthorized: false, servername: 'broker.internal' }],
])('uses configured MQTT transport %s', async (url, insecure, servername, options) => {
  process.env.WAGO_MQTT_URL = url;
  process.env.WAGO_MQTT_USERNAME = 'enrollment';
  process.env.WAGO_MQTT_PASSWORD = 'fixture-only';
  process.env.WAGO_HARDWARE_PROFILE = 'cc100-751-9301-fw31-digital-v1';
  if (insecure) process.env.WAGO_MQTT_TLS_INSECURE = insecure;
  if (servername) process.env.WAGO_MQTT_TLS_SERVERNAME = servername;
  await import('./main');
  await flush();
  const { connect } = await import('mqtt');
  expect(connect).toHaveBeenCalledWith(url, expect.objectContaining(options));
  if (url.startsWith('mqtt://')) {
    expect(jest.mocked(connect).mock.calls[0][1]).not.toHaveProperty('rejectUnauthorized');
    expect(jest.mocked(connect).mock.calls[0][1]).not.toHaveProperty('servername');
  }
});

test('enrolls, persists a claim before acknowledgment, and reconnects operationally', async () => {
  await boot();
  const enrollment = mockClients[0];
  enrollment.emit('connect');
  await flush();
  expect(enrollment.publish).toHaveBeenCalledWith(
    'attraccess/wago/discovery/test-device',
    expect.stringContaining('123456'),
    expect.anything(),
    expect.any(Function),
  );
  enrollment.emit(
    'message',
    'attraccess/wago/discovery/test-device/claim',
    Buffer.from(
      JSON.stringify({
        username: 'permanent',
        password: 'new-password',
        configuration: { namespace: '/local/wago/' },
        acknowledgementToken: 'ack-token',
      }),
    ),
  );
  await flush();
  expect(mockState).toEqual(
    expect.objectContaining({
      credentials: { username: 'permanent', password: 'new-password' },
      operationalPrefix: 'local/wago',
    }),
  );
  expect(enrollment.publish).toHaveBeenCalledWith(
    'attraccess/wago/discovery/test-device/claim/ack',
    JSON.stringify({ acknowledgementToken: 'ack-token' }),
    expect.anything(),
    expect.any(Function),
  );
  expect(mockStore.save.mock.invocationCallOrder.at(-1)).toBeLessThan(enrollment.end.mock.invocationCallOrder[0]);
  const operational = mockClients[1];
  operational.emit('connect');
  await flush();
  expect(mockRuntime.start).toHaveBeenCalledTimes(1);
  operational.emit('close');
  await flush();
  expect(mockRuntime.setConnected).toHaveBeenLastCalledWith(false);
  operational.emit('connect');
  await flush();
  expect(mockRuntime.start).toHaveBeenCalledTimes(1);
  expect(mockRuntime.publishHeartbeat).toHaveBeenCalled();
});

test('does not acknowledge or reconnect when a claim is invalid', async () => {
  await boot();
  mockClients[0].emit('connect');
  await flush();
  mockClients[0].emit(
    'message',
    'attraccess/wago/discovery/test-device/claim',
    Buffer.from('{"username":"missing-password"}'),
  );
  await flush();
  expect(mockClients).toHaveLength(1);
  expect(mockState.credentials).toBeUndefined();
  expect(mockClients[0].end).not.toHaveBeenCalled();
});

test('restores persisted identity and rejects a conflicting hardware ID', async () => {
  mockState = { simulatorHardwareId: 'other-device', credentials: { username: 'u', password: 'p' } };
  await boot();
  expect(process.exitCode).toBe(1);
  expect(mockClients).toHaveLength(0);
});

test.each(['null', '[]', '{"point":"invalid"}'])('rejects invalid initial values %s', async (values) => {
  process.env.WAGO_INITIAL_VALUES = values;
  await expect(import('./simulator')).rejects.toThrow('WAGO_INITIAL_VALUES');
});

test.each(['0', '-1', '1.5', '2147483648'])('rejects invalid timer interval %s', async (value) => {
  process.env.WAGO_HEARTBEAT_INTERVAL_MS = value;
  await expect(import('./simulator')).rejects.toThrow('positive timer interval');
});

test('answers IPC device reads and ignores malformed messages', async () => {
  const originalSend = process.send;
  const send = jest.fn();
  process.send = send;
  try {
    mockState = {
      credentials: { username: 'u', password: 'p' },
      accepted: {
        snapshot: {
          logicalChannels: [{ id: 'load', physicalPointId: 'point' }],
          physicalPoints: [{ id: 'point' }],
        },
      },
    };
    await boot();
    const receive = handlers.get('message');
    receive?.(null);
    receive?.({ type: 'unrelated', id: 'ignore', channelId: 'load' });
    receive?.({ type: 'simulator-read', id: 'missing', channelId: 'absent' });
    receive?.({ type: 'simulator-read', id: 'valid', channelId: 'load' });
    await flush();
    expect(send.mock.calls).toEqual([
      [{ type: 'simulator-read-result', id: 'missing', error: 'unknown channel' }],
      [{ type: 'simulator-read-result', id: 'valid', value: true }],
    ]);
  } finally {
    process.send = originalSend;
  }
});

test('production entrypoint drains connection states during startup and handles reconnects', async () => {
  process.env.WAGO_HARDWARE_PROFILE = 'cc100-751-9301-fw31-digital-v1';
  delete process.env.WAGO_IO_PATHS;
  delete process.env.WAGO_MQTT_USE_ENV_CREDENTIALS;
  mockState = { credentials: { username: 'permanent', password: 'persisted' } };
  await import('./main');
  await flush();
  const client = mockClients[0];
  client.emit('connect');
  client.emit('close');
  await flush();
  expect(mockRuntime.start).toHaveBeenCalledTimes(1);
  expect(mockRuntime.setConnected.mock.calls).toEqual([[true], [false]]);
  client.emit('connect');
  await flush();
  expect(mockRuntime.retryCredentialRotationSubscription).toHaveBeenCalled();
  expect(mockRuntime.setConnected).toHaveBeenLastCalledWith(true);
  expect(mockRuntime.acknowledgeCredentialRotation).toHaveBeenCalledWith(mockState.credentials);
});
