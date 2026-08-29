import { connect, type MqttClient } from 'mqtt';
import { Cc100OnboardIoAdapter } from './adapters';
import { JsonStateStore, WagoRuntime, type Transport } from './runtime';

const hardwareId = required('WAGO_HARDWARE_ID');
const prefix = process.env.WAGO_MQTT_PREFIX ?? 'attraccess/wago';
const statePath = process.env.WAGO_STATE_PATH ?? '/var/lib/attraccess-wago/state.json';
const options = { username: process.env.WAGO_MQTT_USERNAME, password: process.env.WAGO_MQTT_PASSWORD };
const client = connect(required('WAGO_MQTT_URL'), options);
const transport: Transport = {
  publish: (topic, payload, publishOptions) => publish(client, topic, JSON.stringify(payload), publishOptions?.retain),
  subscribe: (topic, listener) => subscribe(client, topic, listener),
};
const adapter = new Cc100OnboardIoAdapter(JSON.parse(process.env.WAGO_IO_PATHS ?? '{}'));
const runtime = new WagoRuntime({ hardwareId, prefix, store: new JsonStateStore(statePath), transport, device: adapter });

client.once('connect', () => void handleAsync(async () => {
  await runtime.start();
  setInterval(() => void handleAsync(() => runtime.publishHeartbeat()), 30_000).unref();
  setInterval(() => void handleAsync(() => runtime.publishMeasurements()), 5_000).unref();
}));
client.on('close', () => void handleAsync(() => runtime.setConnected(false)));
client.on('connect', () => void handleAsync(() => runtime.setConnected(true)));
process.on('SIGTERM', () => client.end(true, () => process.exit(0)));

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}
function publish(client: MqttClient, topic: string, payload: string, retain = false): Promise<void> {
  return new Promise((resolve, reject) => client.publish(topic, payload, { qos: 1, retain }, (error) => (error ? reject(error) : resolve())));
}
function subscribe(client: MqttClient, topic: string, listener: (payload: Buffer) => void | Promise<void>): Promise<void> {
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
  return Promise.resolve().then(callback).catch((error: unknown) => {
    console.error('WAGO CC100 runtime callback failed', error);
  });
}
