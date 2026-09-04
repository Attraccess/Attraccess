import { connect, type MqttClient } from 'mqtt';
import { JsonStateStore, WagoRuntime, type RuntimeState, type Transport } from './runtime';
import { SimulatorDeviceAdapter } from './simulator-device';

const hardwareId = required('WAGO_HARDWARE_ID');
const pairingCode = required('WAGO_PAIRING_CODE');
const enrollmentSecret = required('WAGO_ENROLLMENT_SECRET');
const mqttUrl = required('WAGO_MQTT_URL');
const prefix = process.env.WAGO_MQTT_PREFIX ?? 'attraccess/wago';
const statePath = process.env.WAGO_STATE_PATH ?? '/var/lib/attraccess-wago/state.json';
const scenario = process.env.WAGO_SCENARIO ?? 'normal';
const capabilities = parseCapabilities(process.env.WAGO_CAPABILITIES);
const store = new JsonStateStore(statePath);
const device = new SimulatorDeviceAdapter(parseValues(process.env.WAGO_INITIAL_VALUES), scenario, Number(process.env.WAGO_MEASUREMENT_STEP ?? '0'));
let client: MqttClient | undefined;
let timers: NodeJS.Timeout[] = [];

void start();

async function start(): Promise<void> {
  const state = await store.load();
  if (state.credentials) return connectOperational(state);
  return connectEnrollment();
}

function connectEnrollment(): void {
  const enrollmentClient = connect(mqttUrl, credentials('WAGO_ENROLLMENT'));
  client = enrollmentClient;
  enrollmentClient.on('error', logConnectionError);
  enrollmentClient.once('connect', () => void handleAsync(async () => {
    const discovery = `${prefix.replace(/^\/+|\/+$/g, '')}/discovery/${hardwareId}`;
    await subscribe(enrollmentClient, `${discovery}/claim`, async (payload) => {
      const claim = JSON.parse(payload.toString('utf8')) as {
        username: string;
        password: string;
        configuration?: { namespace?: string };
      };
      if (!claim.username || !claim.password || !claim.configuration?.namespace)
        throw new Error('claim does not include permanent MQTT credentials and configuration namespace');
      await store.save({
        ...(await store.load()),
        credentials: { username: claim.username, password: claim.password },
        operationalPrefix: claim.configuration.namespace,
      });
      enrollmentClient.end(true, () => void handleAsync(async () => connectOperational(await store.load())));
    });
    await publish(enrollmentClient, discovery, {
      hardwareId,
      pairingCode,
      enrollmentSecret,
      protocolVersion: '1.0.0',
      runtimeVersion: '0.1.0-simulator',
      capabilities,
      sequence: Date.now(),
    }, true);
    process.stdout.write(`WAGO CC100 simulator enrollment connected as ${hardwareId}\n`);
  }));
}

function connectOperational(state: RuntimeState): void {
  if (!state.credentials) throw new Error('permanent MQTT credentials are required');
  const operationalClient = connect(mqttUrl, { username: state.credentials.username, password: state.credentials.password });
  client = operationalClient;
  operationalClient.on('error', logConnectionError);
  device.restore(state.accepted?.snapshot, state.outputs);
  const operationalRuntime = new WagoRuntime({
    hardwareId,
    prefix: state.operationalPrefix ?? prefix,
    store,
    transport: transport(operationalClient),
    device,
    configurationError: () => scenario === 'reject-configuration'
      ? { path: '$', code: 'simulated_rejection', message: 'configuration rejected by simulator scenario' }
      : undefined,
  });
  operationalClient.once('connect', () => void handleAsync(async () => {
    await operationalRuntime.start();
    process.stdout.write(`WAGO CC100 simulator connected as ${hardwareId}\n`);
    if (scenario !== 'stale-heartbeat' && scenario !== 'offline')
      timers = [
        setInterval(() => void handleAsync(() => operationalRuntime.publishHeartbeat()), 30_000),
        setInterval(() => void handleAsync(() => operationalRuntime.publishMeasurements()), 5_000),
      ];
    if (scenario === 'offline') operationalClient.end();
  }));
  operationalClient.on('close', () => void handleAsync(() => operationalRuntime.setConnected(false)));
  operationalClient.on('connect', () => void handleAsync(() => operationalRuntime.setConnected(true)));
}

function transport(mqtt: MqttClient): Transport {
  return {
    publish: (topic, payload, options) => publish(mqtt, topic, payload, options?.retain),
    subscribe: (topic, listener) => subscribe(mqtt, topic, listener),
  };
}

function credentials(prefix: string): { username?: string; password?: string } {
  return { username: process.env[`${prefix}_USERNAME`], password: process.env[`${prefix}_PASSWORD`] };
}
function parseValues(value: string | undefined): Record<string, boolean | number> {
  if (!value) return {};
  const parsed = JSON.parse(value) as Record<string, unknown>;
  if (!parsed || Array.isArray(parsed) || Object.values(parsed).some((item) => typeof item !== 'boolean' && typeof item !== 'number'))
    throw new Error('WAGO_INITIAL_VALUES must be a JSON object with boolean or numeric values');
  return parsed as Record<string, boolean | number>;
}
function parseCapabilities(value: string | undefined): string[] {
  if (!value) return ['claim', 'heartbeat', 'configuration-v1', 'commands', 'state', 'measurement', 'fault', 'acknowledgement'];
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
function publish(mqtt: MqttClient, topic: string, payload: unknown, retain = false): Promise<void> {
  return new Promise((resolve, reject) => mqtt.publish(topic, JSON.stringify(payload), { qos: 1, retain }, (error) => error ? reject(error) : resolve()));
}
function subscribe(mqtt: MqttClient, topic: string, listener: (payload: Buffer) => void | Promise<void>): Promise<void> {
  return new Promise((resolve, reject) => mqtt.subscribe(topic, { qos: 1 }, (error) => {
    if (error) return reject(error);
    mqtt.on('message', (receivedTopic, payload) => { if (receivedTopic === topic) void handleAsync(() => listener(payload)); });
    resolve();
  }));
}
function handleAsync(callback: () => void | Promise<void>): Promise<void> {
  return Promise.resolve().then(callback).catch((error: unknown) => {
    process.stderr.write(`WAGO simulator callback failed: ${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  });
}
function logConnectionError(error: Error): void {
  process.stderr.write(`WAGO simulator MQTT connection error: ${error.message}\n`);
}
process.on('SIGTERM', () => {
  timers.forEach(clearInterval);
  client?.end(true, () => process.exit(0));
});
