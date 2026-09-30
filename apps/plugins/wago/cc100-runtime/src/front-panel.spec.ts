// Exercises manual ownership and inverted inputs through runtime MQTT messages.
// FEATURE: WAGO front panel commands respect revisions and flow takeover.
import { MemoryDeviceAdapter } from './adapters';
import {
  WagoRuntime,
  hash,
  validateSnapshot,
  type RuntimeState,
  type Snapshot,
  type StateStore,
  type Transport,
} from './runtime';

const snapshot: Snapshot = {
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

describe('front panel runtime', () => {
  let runtime: WagoRuntime;
  let device: MemoryDeviceAdapter;
  let persisted: RuntimeState;
  let state: Record<string, unknown>;
  let acknowledgements: Array<Record<string, unknown>>;
  beforeEach(async () => {
    persisted = { outputs: {}, commandIds: [] };
    acknowledgements = [];
    device = new MemoryDeviceAdapter();
    const store: StateStore = {
      load: async () => persisted,
      save: async (value) => {
        persisted = structuredClone(value);
      },
    };
    const transport: Transport = {
      subscribe: async () => undefined,
      publish: async (topic, payload) => {
        if (topic.endsWith('/state')) state = payload as Record<string, unknown>;
        if (topic.endsWith('/acknowledgements')) acknowledgements.push(payload as Record<string, unknown>);
      },
    };
    runtime = new WagoRuntime({ hardwareId: 'front-panel', prefix: 'attraccess/wago', store, transport, device });
    await runtime.start();
    await runtime.receiveDesired(
      Buffer.from(JSON.stringify({ protocolVersion: 1, revision: 1, contentHash: hash(snapshot), snapshot })),
    );
  });

  const command = (patch: Record<string, unknown>) =>
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

  it('publishes inverted inputs and rejects inversion on output channels', () => {
    expect(state.inputs).toEqual({ input: true });
    expect(
      validateSnapshot({ ...snapshot, logicalChannels: [{ ...snapshot.logicalChannels[0], invert: true }] }),
    ).toContainEqual(expect.objectContaining({ code: 'invalid_invert' }));
  });

  it('persists manual ownership and lets a subsequent flow command take over', async () => {
    await runtime.receiveCommand(command({ source: 'manual' }));
    await runtime.publishHeartbeat();
    expect(persisted.manualOutputChannelIds).toEqual(['output']);
    expect(state.manualOutputChannelIds).toEqual(['output']);
    await runtime.receiveCommand(command({ value: false }));
    await runtime.publishHeartbeat();
    expect(persisted.manualOutputChannelIds).toEqual([]);
    expect(state.manualOutputChannelIds).toEqual([]);
    expect(state.outputs).toEqual({ output: false });
  });

  it('releases ownership without writing hardware and rejects release against a stale revision', async () => {
    await runtime.receiveCommand(command({ source: 'manual' }));
    const writes = jest.spyOn(device, 'write');
    await runtime.receiveCommand(command({ source: 'manual', action: 'release', expectedConfigurationRevision: 2 }));
    expect(acknowledgements.at(-1)).toMatchObject({ status: 'rejected', code: 'stale_revision' });
    expect(persisted.manualOutputChannelIds).toEqual(['output']);
    await runtime.receiveCommand(command({ source: 'manual', action: 'release' }));
    await runtime.publishHeartbeat();
    expect(writes).not.toHaveBeenCalled();
    expect(state.outputs).toEqual({ output: true });
    expect(state.manualOutputChannelIds).toEqual([]);
  });

  it('polls switch readback without blocking application or command acknowledgements', async () => {
    const readOutput = jest.fn(async () => false);
    Object.assign(device, { readOutput });
    const next: Snapshot = {
      version: 1,
      physicalPoints: [
        {
          id: 'switch-point',
          hardwareProfile: 'modbus',
          channel: 0,
          modbus: { deviceId: 'relay', actionId: 'switch' },
        },
      ],
      logicalChannels: [{ ...snapshot.logicalChannels[0], physicalPointId: 'switch-point' }],
      modbus: {
        connections: [
          {
            id: 'tcp',
            transport: 'tcp',
            host: '127.0.0.1',
            port: 502,
            timeoutMs: 1000,
            reconnectMs: 1000,
            queueLimit: 100,
          },
        ],
        devices: [
          { id: 'relay', name: 'Relay', connectionId: 'tcp', unitId: 1, profileId: 'relay-profile', profileVersion: 1 },
        ],
        profiles: [
          {
            id: 'relay-profile',
            name: 'Relay',
            version: 1,
            measurements: [],
            actions: [
              {
                id: 'switch',
                name: 'Switch',
                functionCode: 5,
                address: 0,
                addressBase: 0,
                dataType: 'uint16',
                byteOrder: 'big',
                wordOrder: 'big',
                scale: 1,
                offset: 0,
                onValue: 1,
                offValue: 0,
              },
            ],
          },
        ],
      },
    };
    await runtime.receiveDesired(
      Buffer.from(JSON.stringify({ protocolVersion: 1, revision: 2, contentHash: hash(next), snapshot: next })),
    );
    expect(readOutput).not.toHaveBeenCalled();
    await runtime.receiveCommand(command({ source: 'manual', expectedConfigurationRevision: 2 }));
    expect(acknowledgements.at(-1)).toMatchObject({ status: 'accepted' });
    expect(readOutput).not.toHaveBeenCalled();
    await runtime.pollInputs();
    expect(readOutput).toHaveBeenCalled();
    expect(state.outputs).toEqual({ output: false });
  });

  it('rejects release commands without a manual source', async () => {
    await runtime.receiveCommand(command({ action: 'release' }));
    expect(acknowledgements.at(-1)).toMatchObject({ status: 'rejected', code: 'invalid_command' });
  });
});
