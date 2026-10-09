import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Cc100OnboardIoAdapter } from './adapters';
import { CC100_DIGITAL_PROFILE } from './onboard-profile';

import { hash, JsonStateStore, WagoRuntime, type Snapshot, type Transport } from '../runtime';

export const point = (channel: number): Snapshot['physicalPoints'][number] => ({
  id: `point-${channel}`,
  hardwareProfile: '751-9301',
  channel,
});

export const snapshot: Snapshot = {
  version: 1,
  physicalPoints: CC100_DIGITAL_PROFILE.channels.map(({ channel }) => point(channel)),
  logicalChannels: CC100_DIGITAL_PROFILE.channels.map(({ channel, name, direction }) => ({
    id: name,
    physicalPointId: point(channel).id,
    profile: `generic-digital-${direction}`,
    capabilities: [direction],
    disconnectPolicy: { mode: 'immediate' },
  })),
};

export function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

export class OnboardIoFixture {
  directory!: string;

  paths!: { input: string; output: string };

  adapter!: Cc100OnboardIoAdapter;

  runtime!: WagoRuntime;

  store!: JsonStateStore;

  messages!: Array<{ topic: string; payload: Record<string, unknown> }>;

  transport!: Transport;

  readonly state = () => this.messages.filter(({ topic }) => topic.endsWith('/state')).at(-1)?.payload;

  readonly apply = (value = snapshot, revision = 1) =>
    this.runtime.receiveDesired(
      Buffer.from(
        JSON.stringify({
          protocolVersion: 1,
          revision,
          contentHash: hash(value),
          snapshot: value,
        }),
      ),
    );

  readonly command = (channelId: string, value: boolean, id = channelId, action = 'set') =>
    this.runtime.receiveCommand(
      Buffer.from(
        JSON.stringify({
          id,
          channelId,
          action,
          value,
          expectedConfigurationRevision: 1,
          expiresAt: '2099-01-01T00:00:00.000Z',
        }),
      ),
    );

  async setup() {
    this.directory = await mkdtemp(join(tmpdir(), 'cc100-digital-'));
    this.paths = { input: join(this.directory, 'din'), output: join(this.directory, 'dout') };
    await writeFile(this.paths.input, '0');
    await writeFile(this.paths.output, '0');
    this.adapter = new Cc100OnboardIoAdapter(this.paths);
    this.store = new JsonStateStore(join(this.directory, 'state.json'));
    this.messages = [];
    this.transport = {
      publish: async (topic, payload) => {
        this.messages.push({ topic, payload: payload as Record<string, unknown> });
      },
      subscribe: async () => undefined,
    };
    this.runtime = new WagoRuntime({
      hardwareId: 'test',
      prefix: 'test',
      pairingCode: 'synthetic',
      store: this.store,
      transport: this.transport,
      device: this.adapter,
    });
  }

  async cleanup() {
    jest.useRealTimers();
    await rm(this.directory, { recursive: true, force: true });
  }
}
