import { connect, type MqttClient } from 'mqtt';
import { JsonStateStore, WagoRuntime, type RuntimeState, type Transport } from './runtime';
import { SimulatorDeviceAdapter } from './simulator-device';

type SimulatorState = RuntimeState & {
  simulatorHardwareId?: string;
  simulatorPairingCode?: string;
  operationalPrefix?: string;
};

let hardwareId: string;
let pairingCode: string;
const mqttUrl = required('WAGO_MQTT_URL');
const prefix = process.env.WAGO_MQTT_PREFIX ?? 'attraccess/wago';
const statePath = process.env.WAGO_STATE_PATH ?? '/var/lib/attraccess-wago/state.json';
const scenario = process.env.WAGO_SCENARIO ?? 'normal';
const capabilities = parseCapabilities(process.env.WAGO_CAPABILITIES);
const heartbeatInterval = interval('WAGO_HEARTBEAT_INTERVAL_MS', 30_000);
const measurementInterval = interval('WAGO_MEASUREMENT_INTERVAL_MS', 5_000);
const store = new JsonStateStore(statePath);
const device = new SimulatorDeviceAdapter(
  parseValues(process.env.WAGO_INITIAL_VALUES),
  scenario,
  Number(process.env.WAGO_MEASUREMENT_STEP ?? '0'),
);
let client: MqttClient | undefined;
let timers: NodeJS.Timeout[] = [];

void start().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});

async function start(): Promise<void> {
  const state = (await store.load()) as SimulatorState;
  hardwareId = state.simulatorHardwareId ?? required('WAGO_HARDWARE_ID');
  pairingCode = state.credentials
    ? state.simulatorPairingCode || process.env.WAGO_PAIRING_CODE || ''
    : required('WAGO_PAIRING_CODE');
  if (process.env.WAGO_HARDWARE_ID && process.env.WAGO_HARDWARE_ID !== hardwareId)
    throw new Error('WAGO_HARDWARE_ID does not match the persisted simulator identity');
  if (!hardwareId.trim() || /[/+#]/.test(hardwareId) || hardwareId.includes(String.fromCharCode(0)))
    throw new Error('invalid WAGO_HARDWARE_ID');
  await store.save(Object.assign(state, { simulatorHardwareId: hardwareId, simulatorPairingCode: pairingCode }));
  if (state.credentials) return connectOperational(state);
  return connectEnrollment();
}

function connectEnrollment(): void {
  const enrollmentSecret = required('WAGO_ENROLLMENT_SECRET');
  const enrollmentClient = connect(mqttUrl, credentials('WAGO_ENROLLMENT'));
  client = enrollmentClient;
  enrollmentClient.on('error', logConnectionError);
  let subscribed = false;
  let claiming = false;
  enrollmentClient.on(
    'connect',
    () =>
      void handleAsync(async () => {
        const discovery = `attraccess/wago/discovery/${hardwareId}`;
        if (!subscribed) {
          await subscribe(enrollmentClient, `${discovery}/claim`, async (payload) => {
            if (claiming) return;
            const claim = JSON.parse(payload.toString('utf8')) as {
              username: string;
              password: string;
              configuration?: { namespace?: string };
              acknowledgementToken?: string;
            };
            if (
              typeof claim?.username !== 'string' ||
              !claim.username ||
              typeof claim.password !== 'string' ||
              !claim.password ||
              typeof claim.configuration?.namespace !== 'string'
            )
              throw new Error('claim does not include permanent MQTT credentials and configuration namespace');
            const operationalPrefix = normalizeOperationalPrefix(claim.configuration.namespace);
            if (
              claim.acknowledgementToken !== undefined &&
              (typeof claim.acknowledgementToken !== 'string' || !claim.acknowledgementToken)
            )
              throw new Error('claim acknowledgementToken must be a non-empty string');
            claiming = true;
            try {
              const claimedState: SimulatorState = {
                ...(await store.load()),
                credentials: { username: claim.username, password: claim.password },
                operationalPrefix,
              };
              await store.save(claimedState);
              // Never acknowledge delivery until permanent credentials are durable.
              // Wait for MQTT PUBACK before ending the enrollment connection.
              if (claim.acknowledgementToken)
                await publish(enrollmentClient, `${discovery}/claim/ack`, {
                  acknowledgementToken: claim.acknowledgementToken,
                });
            } catch (error) {
              claiming = false;
              throw error;
            }
            enrollmentClient.end(true, () => void handleAsync(async () => connectOperational(await store.load())));
          });
          subscribed = true;
        }
        await publish(
          enrollmentClient,
          discovery,
          {
            hardwareId,
            pairingCode,
            enrollmentSecret,
            protocolVersion: '1.0.0',
            runtimeVersion: '0.1.0-simulator',
            capabilities,
            sequence: Date.now(),
          },
          true,
        );
        process.stdout.write(`WAGO CC100 simulator enrollment connected as ${hardwareId}\n`);
      }),
  );
}

function connectOperational(state: SimulatorState): void {
  if (!state.credentials) throw new Error('permanent MQTT credentials are required');
  const operationalClient = connect(mqttUrl, {
    clientId: state.credentials.username,
    username: state.credentials.username,
    password: state.credentials.password,
  });
  client = operationalClient;
  operationalClient.on('error', logConnectionError);
  device.restore(state.accepted?.snapshot, state.outputs);
  // Current main requires pairingCode; keeping it on the options object also
  // permits the older runtime base whose structural interface omits that field.
  const runtimeOptions: ConstructorParameters<typeof WagoRuntime>[0] & { pairingCode: string } = {
    hardwareId,
    pairingCode,
    prefix: state.operationalPrefix ?? prefix,
    store,
    transport: transport(operationalClient),
    device,
    configurationError: () =>
      scenario === 'reject-configuration'
        ? { path: '$', code: 'simulated_rejection', message: 'configuration rejected by simulator scenario' }
        : undefined,
  };
  const operationalRuntime = new WagoRuntime(runtimeOptions);
  let started = false;
  let lifecycle = Promise.resolve();
  operationalClient.on('connect', () => {
    lifecycle = lifecycle.then(() =>
      handleAsync(async () => {
        if (!started) {
          await operationalRuntime.start();
          started = true;
        } else {
          await operationalRuntime.setConnected(true);
          await operationalRuntime.publishHeartbeat();
        }
        process.stdout.write(`WAGO CC100 simulator connected as ${hardwareId}\n`);
        timers.forEach(clearInterval);
        if (scenario !== 'stale-heartbeat' && scenario !== 'offline')
          timers = [
            setInterval(() => void handleAsync(() => operationalRuntime.publishHeartbeat()), heartbeatInterval),
            setInterval(() => void handleAsync(() => operationalRuntime.publishMeasurements()), measurementInterval),
          ];
        if (scenario === 'offline') operationalClient.end();
      }),
    );
  });
  operationalClient.on('close', () => {
    timers.forEach(clearInterval);
    lifecycle = lifecycle.then(() => handleAsync(() => operationalRuntime.setConnected(false)));
  });
}

function transport(mqtt: MqttClient): Transport {
  return {
    publish: (topic, payload, options) =>
      mqtt.connected ? publish(mqtt, topic, payload, options?.retain) : Promise.resolve(),
    subscribe: (topic, listener) => subscribe(mqtt, topic, listener),
  };
}

function credentials(prefix: string): { clientId: string; username: string; password: string } {
  const username = required(`${prefix}_USERNAME`);
  return { clientId: username, username, password: required(`${prefix}_PASSWORD`) };
}
function parseValues(value: string | undefined): Record<string, boolean | number> {
  if (!value) return {};
  const parsed = JSON.parse(value) as Record<string, unknown>;
  if (
    !parsed ||
    typeof parsed !== 'object' ||
    Array.isArray(parsed) ||
    Object.values(parsed).some(
      (item) => typeof item !== 'boolean' && (typeof item !== 'number' || !Number.isFinite(item)),
    )
  )
    throw new Error('WAGO_INITIAL_VALUES must be a JSON object with boolean or numeric values');
  return parsed as Record<string, boolean | number>;
}
function parseCapabilities(value: string | undefined): string[] {
  if (!value)
    return ['claim', 'heartbeat', 'configuration-v1', 'commands', 'state', 'measurement', 'fault', 'acknowledgement'];
  const parsed = JSON.parse(value);
  if (!Array.isArray(parsed) || parsed.some((item) => typeof item !== 'string' || !item.trim()))
    throw new Error('WAGO_CAPABILITIES must be a JSON array of non-empty strings');
  return parsed;
}
function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}
function interval(name: string, fallback: number): number {
  const value = Number(process.env[name] ?? fallback);
  if (!Number.isSafeInteger(value) || value < 1 || value > 2_147_483_647)
    throw new Error(`${name} must be a positive timer interval`);
  return value;
}
function normalizeOperationalPrefix(value: string): string {
  const normalized = value.trim().replace(/^\/+|\/+$/g, '');
  if (!normalized || normalized.split('/').some((segment) => !segment || /[+#]/.test(segment)))
    throw new Error('claim namespace must contain non-empty segments without wildcards');
  return normalized;
}
function publish(mqtt: MqttClient, topic: string, payload: unknown, retain = false): Promise<void> {
  return new Promise((resolve, reject) =>
    mqtt.publish(topic, JSON.stringify(payload), { qos: 1, retain }, (error) => (error ? reject(error) : resolve())),
  );
}
function subscribe(
  mqtt: MqttClient,
  topic: string,
  listener: (payload: Buffer) => void | Promise<void>,
): Promise<void> {
  return new Promise((resolve, reject) =>
    mqtt.subscribe(topic, { qos: 1 }, (error) => {
      if (error) return reject(error);
      mqtt.on('message', (receivedTopic, payload) => {
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
        `WAGO simulator callback failed: ${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`,
      );
    });
}
function logConnectionError(error: Error): void {
  process.stderr.write(`WAGO simulator MQTT connection error: ${error.message}\n`);
}
process.on('SIGTERM', () => {
  timers.forEach(clearInterval);
  client?.end(true, () => process.exit(0));
});
