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
  let statePublications: number;
  let acknowledgements: Array<Record<string, unknown>>;
  beforeEach(async () => {
    persisted = { outputs: {}, commandIds: [] };
    statePublications = 0;
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
        if (topic.endsWith('/state')) {
          state = payload as Record<string, unknown>;
          statePublications++;
        }
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

  it('isolates switch acquisition and retains failed readback across heartbeats', async () => {
    const readOutput = jest.fn(async () => false);
    Object.assign(device, { readOutput });
    const next: Snapshot = {
      version: 1,
      physicalPoints: [
        snapshot.physicalPoints[1],
        {
          id: 'switch-point',
          hardwareProfile: 'modbus',
          channel: 0,
          modbus: { deviceId: 'relay', actionId: 'switch' },
        },
      ],
      logicalChannels: [
        { ...snapshot.logicalChannels[0], physicalPointId: 'switch-point' },
        snapshot.logicalChannels[1],
      ],
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
    await runtime.pollModbusOutputs();
    await runtime.publishHeartbeat();
    expect(readOutput).toHaveBeenCalled();
    expect(state.outputs).toEqual({ output: false });
    const publications = statePublications;
    await runtime.pollModbusOutputs();
    await runtime.pollInputs();
    await runtime.pollInputs();
    expect(statePublications).toBe(publications);
    const clock = jest.spyOn(Date, 'now');
    const now = Date.now();
    try {
      clock.mockReturnValue(now + 5001);
      readOutput.mockRejectedValueOnce(new Error('No response'));
      await runtime.pollModbusOutputs();
      await runtime.publishHeartbeat();
      expect(state.outputs).toEqual({});
      expect(state.readiness).toMatchObject({ errors: [expect.objectContaining({ code: 'modbus_read_failed' })] });
      expect(state.readiness).toMatchObject({ configurationAccepted: true, hardwareAvailable: true, ready: true });
      await runtime.publishHeartbeat();
      expect(state.outputs).toEqual({});
      expect(state.readiness).toMatchObject({ errors: [expect.objectContaining({ code: 'modbus_read_failed' })] });
      clock.mockReturnValue(now + 10002);
      let complete: ((value: boolean) => void) | undefined;
      readOutput.mockImplementationOnce(
        () =>
          new Promise<boolean>((resolve) => {
            complete = resolve;
          }),
      );
      const pending = runtime.pollModbusOutputs();
      await runtime.pollInputs();
      await runtime.publishHeartbeat();
      expect(state.inputs).toEqual({ input: true });
      expect(state.outputs).toEqual({});
      clock.mockReturnValue(now + 16003);
      await runtime.publishHeartbeat();
      expect(state.readiness).toMatchObject({ errors: [expect.objectContaining({ code: 'modbus_read_failed' })] });
      complete?.(true);
      await pending;
      await runtime.publishHeartbeat();
      expect(state.outputs).toEqual({ output: true });
      expect(state.readiness).toMatchObject({
        configurationAccepted: true,
        hardwareAvailable: true,
        ready: true,
        errors: [],
      });
      clock.mockReturnValue(now + 27004);
      await runtime.publishHeartbeat();
      expect(state.outputs).toEqual({});
    } finally {
      clock.mockRestore();
    }
  });

  it('rejects release commands without a manual source', async () => {
    await runtime.receiveCommand(command({ action: 'release' }));
    expect(acknowledgements.at(-1)).toMatchObject({ status: 'rejected', code: 'invalid_command' });
  });

  it('refreshes independent Modbus buses while another bus is blocked without overlapping a bus', async () => {
    const next: Snapshot = {
      version: 1,
      physicalPoints: [
        snapshot.physicalPoints[1],
        ...['slow', 'healthy', 'healthy-second'].map((id) => ({
          id,
          hardwareProfile: 'modbus',
          channel: 0,
          modbus: { deviceId: id === 'slow' ? 'slow' : 'healthy', actionId: id },
        })),
      ],
      logicalChannels: [
        snapshot.logicalChannels[1],
        ...['slow', 'healthy', 'healthy-second'].map((id) => ({
          ...snapshot.logicalChannels[0],
          id,
          physicalPointId: id,
        })),
      ],
      modbus: {
        connections: ['slow', 'healthy'].map((id, index) => ({
          id,
          transport: 'tcp',
          host: `127.0.0.${index + 1}`,
          port: 502,
          timeoutMs: 60000,
          reconnectMs: 1000,
          queueLimit: 100,
        })),
        devices: ['slow', 'healthy'].map((id) => ({
          id,
          name: id,
          connectionId: id,
          unitId: 1,
          profileId: 'switches',
          profileVersion: 1,
          pollIntervalMs: 5000,
        })),
        profiles: [
          {
            id: 'switches',
            name: 'Switches',
            version: 1,
            measurements: [],
            actions: ['slow', 'healthy', 'healthy-second'].map((id, address) => ({
              id,
              name: id,
              functionCode: 5,
              address,
              addressBase: 0,
              dataType: 'uint16',
              byteOrder: 'big',
              wordOrder: 'big',
              scale: 1,
              offset: 0,
              onValue: 1,
              offValue: 0,
            })),
          },
        ],
      },
    };
    await runtime.receiveDesired(
      Buffer.from(JSON.stringify({ protocolVersion: 1, revision: 2, contentHash: hash(next), snapshot: next })),
    );
    let releaseSlow!: (value: boolean) => void;
    const slow = new Promise<boolean>((resolve) => {
      releaseSlow = resolve;
    });
    let healthyActive = 0;
    let healthyValue = false;
    const readOutput = jest.fn(async (point: Snapshot['physicalPoints'][number]) => {
      if (point.id === 'slow') return slow;
      healthyActive++;
      expect(healthyActive).toBe(1);
      await Promise.resolve();
      healthyActive--;
      return healthyValue;
    });
    Object.assign(device, { readOutput });
    const clock = jest.spyOn(Date, 'now');
    const now = Date.now();
    const pending = runtime.pollModbusOutputs();
    try {
      // Heartbeat/state publication must see each completed healthy sample even
      // though the other connection's request has not returned.
      await runtime.publishHeartbeat();
      await runtime.publishHeartbeat();
      expect(readOutput.mock.calls.map(([point]) => point.id)).toEqual(['slow', 'healthy', 'healthy-second']);
      expect(state.outputs).toMatchObject({ healthy: false, 'healthy-second': false });
      healthyValue = true;
      clock.mockReturnValue(now + 11000);
      await runtime.pollModbusOutputs();
      await runtime.publishHeartbeat();
      expect(state.outputs).toEqual({ healthy: true, 'healthy-second': true });
      expect(readOutput.mock.calls.filter(([point]) => point.id === 'slow')).toHaveLength(1);
      expect(state.inputs).toEqual({ input: true });
    } finally {
      releaseSlow(false);
      await pending;
      clock.mockRestore();
    }
  });
});
