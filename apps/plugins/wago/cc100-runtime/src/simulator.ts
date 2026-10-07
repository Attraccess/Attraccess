import { createSimulatorTransport } from './simulator-transport';
import { loadSimulatorIdentity } from './simulator-identity';
import { registerSimulatorInspection } from './simulator-inspection';
import { connect, type MqttClient } from 'mqtt';
import { WagoRuntime } from './runtime';
import { SimulatorDeviceAdapter } from './simulator-device';
import { SimulatorState } from './simulator-state';
import { mqttUrl } from './simulator-settings';
import { prefix } from './simulator-settings';
import { capabilities } from './simulator-settings';
import { heartbeatInterval } from './simulator-settings';
import { measurementInterval } from './simulator-settings';
import { store } from './simulator-state';
import { credentials } from './simulator-settings';
import { parseValues } from './simulator-settings';
import { required } from './simulator-settings';
import { normalizeOperationalPrefix } from './simulator-settings';
import { publish } from './simulator-mqtt';
import { subscribe } from './simulator-mqtt';
import { handleAsync } from './simulator-mqtt';
import { logConnectionError } from './simulator-mqtt';

let hardwareId: string;
let pairingCode: string;
const scenario = process.env.WAGO_SCENARIO ?? 'normal';
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
  if (process.connected) process.disconnect();
});

async function start(): Promise<void> {
  const identity = await loadSimulatorIdentity();
  const { state } = identity;
  hardwareId = identity.hardwareId;
  pairingCode = identity.pairingCode;
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
    transport: createSimulatorTransport(operationalClient, scenario),
    device,
  };
  const operationalRuntime = new WagoRuntime(runtimeOptions);
  let started = false;
  let lifecycle = Promise.resolve();
  let connectionGeneration = 0;
  operationalClient.on('connect', () => {
    const generation = ++connectionGeneration;
    lifecycle = lifecycle.then(() =>
      handleAsync(async () => {
        if (generation !== connectionGeneration) return;
        if (!started) {
          await operationalRuntime.start(() => operationalRuntime.setConnected(operationalClient.connected));
          started = true;
        } else {
          await operationalRuntime.setConnected(true);
          await operationalRuntime.publishHeartbeat();
        }
        // A disconnect can occur while startup awaits subscriptions or publishes.
        // Do not let that stale completion restore an operational state or timers.
        if (generation !== connectionGeneration) {
          await operationalRuntime.setConnected(false);
          return;
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
    connectionGeneration++;
    timers.forEach(clearInterval);
    timers = [];
    // Safety shutdown must not wait for pending MQTT subscriptions or PUBACKs.
    void handleAsync(() => operationalRuntime.setConnected(false));
  });
}

// Rejection is a simulator protocol scenario, not an optional production-runtime
// constructor hook. Normal configuration always reaches the shared runtime.
process.on('SIGTERM', () => {
  timers.forEach(clearInterval);
  if (client) client.end(true, () => process.exit(0));
  else process.exit(0);
});

registerSimulatorInspection(device);
