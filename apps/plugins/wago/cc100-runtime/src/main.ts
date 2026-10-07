import { connect, type MqttClient } from 'mqtt';
import { CC100_MODBUS_PROFILE_ID, CC100_SERIAL_PATH, isCc100HardwareProfile } from '../../shared/hardware-profile';
import { Cc100OnboardIoAdapter } from './adapters';
import { ModbusDeviceRouter } from './modbus/adapter';
import { JsonStateStore, WagoRuntime, type DiscoveryClaim, type Transport } from './runtime';
import { RunLed } from './status-led';

const hardwareId = required('WAGO_HARDWARE_ID');
const defaultPrefix = process.env.WAGO_MQTT_PREFIX ?? 'attraccess/wago';
const statePath = process.env.WAGO_STATE_PATH ?? '/var/lib/attraccess-wago/state.json';
const pairingCode = required('WAGO_PAIRING_CODE');
const enrollmentSecret = required('WAGO_ENROLLMENT_SECRET');
const store = new JsonStateStore(statePath);
if (process.env.WAGO_IO_PATHS)
  throw new Error('WAGO_IO_PATHS is no longer supported; redeploy with the firmware-31 digital hardware profile');
const hardwareProfile = required('WAGO_HARDWARE_PROFILE');
if (!isCc100HardwareProfile(hardwareProfile)) throw new Error('unsupported WAGO_HARDWARE_PROFILE');
const onboard = new Cc100OnboardIoAdapter();
const adapter =
  hardwareProfile === CC100_MODBUS_PROFILE_ID
    ? new ModbusDeviceRouter(onboard, undefined, [CC100_SERIAL_PATH])
    : onboard;
const mqttUrl = required('WAGO_MQTT_URL');
let client: MqttClient | undefined;
let heartbeatTimer: NodeJS.Timeout | undefined;
let measurementTimer: NodeJS.Timeout | undefined;
let inputTimer: NodeJS.Timeout | undefined;
const runLed = new RunLed();
runLed.set('starting');

void handleAsync(start);

async function start(): Promise<void> {
  const persistedCredentials = (await store.load()).credentials;
  const credentials =
    process.env.WAGO_MQTT_USE_ENV_CREDENTIALS === 'true'
      ? {
          username: required('WAGO_MQTT_USERNAME'),
          password: required('WAGO_MQTT_PASSWORD'),
          prefix: persistedCredentials?.prefix,
        }
      : persistedCredentials;
  connectRuntime(credentials);
}

function connectRuntime(credentials?: DiscoveryClaim): void {
  const prefix = credentials?.prefix ?? defaultPrefix;
  const username = credentials?.username ?? required('WAGO_MQTT_USERNAME');
  client = connect(mqttUrl, {
    clientId: username,
    username,
    password: credentials?.password ?? required('WAGO_MQTT_PASSWORD'),
    ...(mqttUrl.startsWith('mqtts://') && process.env.WAGO_MQTT_TLS_INSECURE === 'true'
      ? { rejectUnauthorized: false }
      : {}),
    ...(mqttUrl.startsWith('mqtts://') && process.env.WAGO_MQTT_TLS_SERVERNAME
      ? { servername: process.env.WAGO_MQTT_TLS_SERVERNAME }
      : {}),
  });
  const activeClient = client;
  const transport: Transport = {
    publish: (topic, payload, publishOptions) =>
      publish(activeClient, topic, JSON.stringify(payload), publishOptions?.retain),
    subscribe: (topic, listener) => subscribe(activeClient, topic, listener),
  };
  const runtime = new WagoRuntime({
    hardwareId,
    prefix,
    pairingCode,
    enrollmentSecret,
    runtimeImageId: process.env.WAGO_RUNTIME_IMAGE_ID,
    store,
    transport,
    device: adapter,
    reconnectCredentials: async (next) => {
      if (activeClient !== client) throw new Error('Credential handoff connection is no longer active');
      await runtime.setConnected(false);
      credentials = next;
      activeClient.options.username = next.username;
      activeClient.options.password = next.password;
      activeClient.reconnect();
    },
    onReadiness: ({ connected, configurationAccepted, ready }) =>
      runLed.set(ready ? 'ready' : !connected ? 'disconnected' : !configurationAccepted ? 'unconfigured' : 'fault'),
  });
  let initialized = false;
  let connected = false;
  const pendingConnectionStates: boolean[] = [];

  const applyConnectionState = (state: boolean): void => {
    connected = state;
    if (activeClient !== client || !credentials) return;
    if (!initialized) {
      pendingConnectionStates.push(state);
      return;
    }
    void handleAsync(async () => {
      if (state) await runtime.retryCredentialRotationSubscription();
      await runtime.setConnected(state);
      if (state && credentials) await runtime.acknowledgeCredentialRotation(credentials);
    });
  };

  const activateConnectionHandling = async (): Promise<void> => {
    if (initialized) return;
    if (!pendingConnectionStates.length && !connected) pendingConnectionStates.push(false);
    while (pendingConnectionStates.length > 0) {
      const state = pendingConnectionStates.shift();
      if (state !== undefined) await handleAsync(() => runtime.setConnected(state));
    }
    initialized = true;
  };

  activeClient.once(
    'connect',
    () =>
      void handleAsync(async () => {
        if (!credentials) {
          runLed.set('pairing');
          await transport.subscribe(runtime.discoveryClaimTopic(), async (payload) => {
            const claim = await runtime.receiveDiscoveryClaim(payload);
            if (!claim || activeClient !== client) return;
            activeClient.end(true, () => connectRuntime(claim));
          });
          await runtime.publishDiscoveryAnnouncement();
          return;
        }
        try {
          await runtime.start(activateConnectionHandling);
        } finally {
          // Also activate if subscriptions fail after commands become reachable.
          await activateConnectionHandling();
        }
        if (connected && credentials) await runtime.acknowledgeCredentialRotation(credentials);
        heartbeatTimer = setInterval(() => void handleAsync(() => runtime.publishHeartbeat()), 30_000).unref();
        // The router applies each measurement's minimum interval; this is only the scheduler tick.
        measurementTimer = setInterval(
          () => void handleAsync(() => runtime.publishMeasurements()),
          hardwareProfile === CC100_MODBUS_PROFILE_ID ? 100 : 5000,
        ).unref();
        inputTimer = setInterval(() => void handleAsync(() => runtime.pollInputs()), 250).unref();
      }),
  );
  activeClient.on('close', () => {
    if (activeClient === client) runLed.set('disconnected');
    applyConnectionState(false);
  });
  activeClient.on('connect', () => applyConnectionState(true));
}

process.on('SIGTERM', () => {
  if (heartbeatTimer) clearInterval(heartbeatTimer);
  if (measurementTimer) clearInterval(measurementTimer);
  if (inputTimer) clearInterval(inputTimer);
  runLed.stop();
  client?.end(true, () => process.exit(0));
});

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}
function publish(client: MqttClient, topic: string, payload: string, retain = false): Promise<void> {
  return new Promise((resolve, reject) =>
    client.publish(topic, payload, { qos: 1, retain }, (error) => (error ? reject(error) : resolve())),
  );
}
function subscribe(
  client: MqttClient,
  topic: string,
  listener: (payload: Buffer) => void | Promise<void>,
): Promise<void> {
  return new Promise((resolve, reject) =>
    client.subscribe(topic, { qos: 1 }, (error) => {
      if (error) return reject(error);
      client.on('message', (receivedTopic, payload) => {
        if (receivedTopic === topic) void handleAsync(() => listener(payload));
      });
      resolve();
    }),
  );
}
function handleAsync(callback: () => void | Promise<void>): Promise<void> {
  return Promise.resolve()
    .then(callback)
    .catch((error: unknown) => {
      process.stderr.write(
        `WAGO CC100 runtime callback failed: ${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`,
      );
    });
}
