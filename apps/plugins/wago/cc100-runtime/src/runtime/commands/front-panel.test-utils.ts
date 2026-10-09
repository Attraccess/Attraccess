import type { StateStore } from '../types';
import { MemoryDeviceAdapter } from '../../io/adapters';
import { WagoRuntime, hash, type RuntimeState, type Snapshot, type Transport } from '../../runtime';

export const snapshot: Snapshot = {
  version: 1,
  physicalPoints: [
    { id: 'relay', hardwareProfile: '751-9301', channel: 0 },
    { id: 'sensor', hardwareProfile: '751-9301', channel: 4 },
  ],
  logicalChannels: [
    {
      id: 'output',
      physicalPointId: 'relay',
      profile: 'generic-digital-output',
      capabilities: ['output'],
      disconnectPolicy: { mode: 'hold' },
    },
    {
      id: 'input',
      physicalPointId: 'sensor',
      profile: 'generic-monitored-input',
      capabilities: ['input'],
      disconnectPolicy: { mode: 'hold' },
      invert: true,
    },
  ],
};

export class FrontPanelFixture {
  runtime!: WagoRuntime;

  device!: MemoryDeviceAdapter;

  persisted!: RuntimeState;

  store!: StateStore;

  state!: Record<string, unknown>;

  statePublications!: number;

  acknowledgements!: Array<Record<string, unknown>>;

  readonly command = (patch: Record<string, unknown>) =>
    Buffer.from(
      JSON.stringify({
        id: crypto.randomUUID(),
        channelId: 'output',
        action: 'set',
        value: true,
        expectedConfigurationRevision: 1,
        expiresAt: '2099-01-01T00:00:00.000Z',
        ...patch,
      }),
    );

  async setup() {
    this.persisted = { outputs: {}, commandIds: [] };
    this.statePublications = 0;
    this.acknowledgements = [];
    this.device = new MemoryDeviceAdapter();
    this.store = {
      load: async () => this.persisted,
      save: async (value) => {
        this.persisted = structuredClone(value);
      },
    };
    const transport: Transport = {
      subscribe: async () => undefined,
      publish: async (topic, payload) => {
        if (topic.endsWith('/state')) {
          this.state = payload as Record<string, unknown>;
          this.statePublications++;
        }
        if (topic.endsWith('/acknowledgements')) this.acknowledgements.push(payload as Record<string, unknown>);
      },
    };
    this.runtime = new WagoRuntime({
      pairingCode: 'fixture',
      hardwareId: 'front-panel',
      prefix: 'attraccess/wago',
      store: this.store,
      transport,
      device: this.device,
    });
    await this.runtime.start();
    await this.runtime.receiveDesired(
      Buffer.from(JSON.stringify({ protocolVersion: 1, revision: 1, contentHash: hash(snapshot), snapshot })),
    );
  }
}
