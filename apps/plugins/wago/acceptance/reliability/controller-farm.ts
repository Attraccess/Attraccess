/**
 * Simulated CC100 controllers for the reliability harness. It runs in its own process so the host side
 * cannot observe more than the broker shows, and keeps one record per command that reached a controller.
 * Each controller is the production runtime on the production MQTT transport with an in-memory device.
 */
import { connect, type MqttClient } from 'mqtt';
import { appendFileSync } from 'node:fs';
import { join } from 'node:path';
import { MemoryDeviceAdapter } from '../../cc100-runtime/src/io/adapters';
import { JsonStateStore, WagoRuntime, type DiscoveryClaim, type Transport } from '../../cc100-runtime/src/runtime';
import { MqttTransport } from '../../cc100-runtime/src/transport/mqtt';

export type FarmRequest =
  | { id: number; op: 'restart-runtime'; index: number }
  | { id: number; op: 'drop-connections' }
  | { id: number; op: 'snapshot' }
  | { id: number; op: 'shutdown' };

export type ControllerSnapshot = {
  index: number;
  connected: boolean;
  revision: number | null;
  outputs: Record<string, boolean>;
  dropCounts: Record<string, number>;
};

export type CommandRecord =
  | { kind: 'received'; controller: number; commandId: string; at: number }
  | { kind: 'acknowledged'; controller: number; commandId: string; status: string; at: number };

const required = (name: string) => {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
};
const url = required('WAGO_RELIABILITY_MQTT_URL');
const password = required('WAGO_RELIABILITY_MQTT_PASSWORD');
const prefix = required('WAGO_RELIABILITY_PREFIX');
const directory = required('WAGO_RELIABILITY_DIRECTORY');
const count = Number(required('WAGO_RELIABILITY_CONTROLLERS'));
const records = join(directory, 'command-records.jsonl');
const EPOCH = '6b6b0b0e-3d0c-4d2a-9b7b-5f0f0b0b0b0b';
const record = (entry: CommandRecord) => appendFileSync(records, `${JSON.stringify(entry)}\n`);
const report = (error: unknown) => process.stderr.write(`farm callback failed: ${String(error)}\n`);

class Controller {
  client!: MqttClient;
  runtime!: WagoRuntime;
  transport!: MqttTransport;
  connected = false;
  credentials?: DiscoveryClaim;
  private timers: NodeJS.Timeout[] = [];
  private starting = false;

  constructor(readonly index: number) {}

  get hardwareId() {
    return `rel-${this.index}`;
  }

  async boot(): Promise<void> {
    this.client = connect(url, {
      clientId: `farm-${this.hardwareId}-${Date.now()}`,
      username: 'fixture',
      password,
      clean: true,
      reconnectPeriod: 1000,
      connectTimeout: 5000,
    });
    this.client.on('error', report);
    this.transport = new MqttTransport(this.client, report);
    const recording: Transport = {
      publish: (topic, payload, options) => {
        const body = payload as { id?: string; status?: string };
        if (topic.endsWith('/acknowledgements') && body?.id)
          record({
            kind: 'acknowledged',
            controller: this.index,
            commandId: body.id,
            status: String(body.status),
            at: Date.now(),
          });
        return this.transport.publish(topic, payload, options);
      },
      subscribe: (topic, listener, options) =>
        this.transport.subscribe(
          topic,
          (payload, slot) => {
            if (topic.endsWith('/commands')) {
              try {
                const { id } = JSON.parse(payload.toString('utf8'));
                if (typeof id === 'string')
                  record({ kind: 'received', controller: this.index, commandId: id, at: Date.now() });
              } catch {
                /* not a command; the runtime decides what to do with it */
              }
            }
            return listener(payload, slot);
          },
          options,
        ),
      dropCounts: () => this.transport.dropCounts(),
    };
    const store = new JsonStateStore(join(directory, `${this.hardwareId}.json`));
    const saved = await store.load();
    // A claimed controller: it carries the registration epoch that credential rotation echoes back.
    if (!saved.credentials)
      await store.save({
        ...saved,
        credentials: { username: `wago-controller-${this.hardwareId}`, password: 'initial', credentialEpoch: EPOCH },
      });
    this.credentials = (await store.load()).credentials;
    this.runtime = new WagoRuntime({
      hardwareId: this.hardwareId,
      prefix,
      pairingCode: `pairing-${this.index}`,
      store,
      transport: recording,
      device: new MemoryDeviceAdapter(),
      // The broker account stays the fixture user; the handoff, persistence and reconnect are real.
      reconnectCredentials: async (next) => {
        await this.runtime.setConnected(false);
        this.credentials = next;
        this.client.reconnect();
      },
    });
    this.client.on('connect', () => {
      this.connected = true;
      void this.start();
    });
    this.client.on('close', () => {
      this.connected = false;
      void this.runtime.setConnected(false).catch(report);
    });
    this.timers.push(
      setInterval(() => void this.runtime.publishHeartbeat().catch(() => undefined), 5000),
      setInterval(() => void this.runtime.pollInputs().catch(() => undefined), 500),
    );
  }

  private async start(): Promise<void> {
    if (this.starting) return;
    this.starting = true;
    try {
      await this.runtime.start();
      await this.runtime.setConnected(true);
      if (this.credentials) await this.runtime.acknowledgeCredentialRotation(this.credentials);
    } catch (error) {
      // A failed subscribe is retried by the next connect, as the production entrypoint does.
      report(error);
    } finally {
      this.starting = false;
    }
  }

  async stop(): Promise<void> {
    this.timers.forEach(clearInterval);
    this.timers = [];
    await new Promise<void>((resolve) => this.client.end(true, () => resolve()));
  }

  snapshot(): ControllerSnapshot {
    const state = Reflect.get(this.runtime, 'state') as {
      accepted?: { revision: number };
      outputs: Record<string, boolean>;
    };
    return {
      index: this.index,
      connected: this.connected,
      revision: state.accepted?.revision ?? null,
      outputs: { ...state.outputs },
      dropCounts: this.transport.dropCounts(),
    };
  }
}

const controllers = Array.from({ length: count }, (_, index) => new Controller(index));

async function handle(request: FarmRequest): Promise<unknown> {
  switch (request.op) {
    case 'restart-runtime': {
      const target = controllers[request.index];
      await target.stop();
      // Same state file: the restarted runtime must recover from what the previous one persisted.
      await target.boot();
      return {};
    }
    case 'drop-connections':
      for (const controller of controllers) controller.client.stream.destroy();
      return {};
    case 'snapshot':
      return { controllers: controllers.map((controller) => controller.snapshot()) };
    case 'shutdown':
      await Promise.all(controllers.map((controller) => controller.stop()));
      return {};
  }
}

process.on('message', (request: FarmRequest) => {
  handle(request)
    .then((result) => process.send?.({ id: request.id, ...(result as object) }))
    .then(() => request.op === 'shutdown' && process.exit(0))
    .catch((error) => process.send?.({ id: request.id, error: String(error) }));
});

void Promise.all(controllers.map((controller) => controller.boot())).then(() => process.send?.({ ready: true }));
