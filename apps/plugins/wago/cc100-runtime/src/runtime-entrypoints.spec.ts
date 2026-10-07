import { registerRootTestRegistrationsUsesConfiguredMqttTransportS } from './runtime-entrypoints.root-test-registrations-uses-configured-mqtt-transport-s.test-cases';
import { registerRootTestRegistrationsEnrollsPersistsAClaimBeforeAcknowledgmentAndReconnectsOperationally } from './runtime-entrypoints.root-test-registrations-enrolls-persists-a-claim-before-acknowledgment-and-reconnects-operationally.test-cases';
import { registerRootTestRegistrationsDoesNotAcknowledgeOrReconnectWhenAClaimIsInvalid } from './runtime-entrypoints.root-test-registrations-does-not-acknowledge-or-reconnect-when-a-claim-is-invalid.test-cases';
import { registerRootTestRegistrationsRestoresPersistedIdentityAndRejectsAConflictingHardwareId } from './runtime-entrypoints.root-test-registrations-restores-persisted-identity-and-rejects-a-conflicting-hardware-id.test-cases';
import { registerRootTestRegistrationsRejectsInvalidInitialValuesS } from './runtime-entrypoints.root-test-registrations-rejects-invalid-initial-values-s.test-cases';
import { registerRootTestRegistrationsRejectsInvalidTimerIntervalS } from './runtime-entrypoints.root-test-registrations-rejects-invalid-timer-interval-s.test-cases';
import { registerRootTestRegistrationsAnswersIpcDeviceReadsAndIgnoresMalformedMessages } from './runtime-entrypoints.root-test-registrations-answers-ipc-device-reads-and-ignores-malformed-messages.test-cases';
import { registerRootTestRegistrationsProductionEntrypointDrainsConnectionStatesDuringStartupAndHandlesReconnects } from './runtime-entrypoints.root-test-registrations-production-entrypoint-drains-connection-states-during-startup-and-handles-reconnects.test-cases';
import { registerRootTestRegistrationsProductionEntrypointRetriesInterruptedStartupAfterReconnectAndInstallsTelemetryTimersOnce } from './runtime-entrypoints.root-test-registrations-production-entrypoint-retries-interrupted-startup-after-reconnect-and-installs-telemetry-timers-once.test-cases';
import { registerRootTestRegistrationsBootsAfterAnSshMqttRefreshUsingPermanentStateCredentialsAndTheRecreatedBrokerEnvironme } from './runtime-entrypoints.root-test-registrations-boots-after-an-ssh-mqtt-refresh-using-permanent-state-credentials-and-the-recreated-broker-environme.test-cases';
import { registerRootTestRegistrationsProductionRtuProfileRoutesModbusDevicesAndSchedulesTheirConfiguredPollingIntervals } from './runtime-entrypoints.root-test-registrations-production-rtu-profile-routes-modbus-devices-and-schedules-their-configured-polling-intervals.test-cases';
import { EventEmitter } from 'node:events';

class FakeMqtt extends EventEmitter {
  connected = true;
  outgoing = {};
  stream = { destroy: jest.fn() };
  removeOutgoingMessage = jest.fn();
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
defineRootTestRegistrationsTests();
export type RootTestRegistrationsTestScope = ReturnType<typeof defineRootTestRegistrationsTests>;

export async function boot() {
  await import('./simulator');
  await flush();
}

export function defineRootTestRegistrationsTests() {
  const scope = {
    get flush() {
      return flush;
    },
    get boot() {
      return boot;
    },
    get mockClients() {
      return mockClients;
    },
    get mockState() {
      return mockState;
    },
    set mockState(value: typeof mockState) {
      mockState = value;
    },
    get mockStore() {
      return mockStore;
    },
    get mockRuntime() {
      return mockRuntime;
    },
    get handlers() {
      return handlers;
    },
    set handlers(value: typeof handlers) {
      handlers = value;
    },
  };

  registerRootTestRegistrationsUsesConfiguredMqttTransportS(scope);

  registerRootTestRegistrationsEnrollsPersistsAClaimBeforeAcknowledgmentAndReconnectsOperationally(scope);

  registerRootTestRegistrationsDoesNotAcknowledgeOrReconnectWhenAClaimIsInvalid(scope);

  registerRootTestRegistrationsRestoresPersistedIdentityAndRejectsAConflictingHardwareId(scope);

  registerRootTestRegistrationsRejectsInvalidInitialValuesS(scope);

  registerRootTestRegistrationsRejectsInvalidTimerIntervalS(scope);

  registerRootTestRegistrationsAnswersIpcDeviceReadsAndIgnoresMalformedMessages(scope);

  registerRootTestRegistrationsProductionEntrypointDrainsConnectionStatesDuringStartupAndHandlesReconnects(scope);

  registerRootTestRegistrationsProductionEntrypointRetriesInterruptedStartupAfterReconnectAndInstallsTelemetryTimersOnce(
    scope,
  );

  registerRootTestRegistrationsBootsAfterAnSshMqttRefreshUsingPermanentStateCredentialsAndTheRecreatedBrokerEnvironme(
    scope,
  );

  registerRootTestRegistrationsProductionRtuProfileRoutesModbusDevicesAndSchedulesTheirConfiguredPollingIntervals(
    scope,
  );

  return scope;
}
