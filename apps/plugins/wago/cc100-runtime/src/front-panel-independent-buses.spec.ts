import { hash, type Snapshot } from './runtime';
import { FrontPanelFixture, snapshot } from './front-panel.test-utils';

describe('front panel runtime', () => {
  let fixture: FrontPanelFixture;
  beforeEach(async () => {
    fixture = new FrontPanelFixture();
    await fixture.setup();
  });

  it('refreshes independent Modbus buses while another bus is blocked without overlapping a bus', async () => {
    const next: Snapshot = {
      version: 1,
      physicalPoints: [
        snapshot.physicalPoints[1],
        ...['slow', 'healthy', 'healthy-second'].map((id) => ({
          id,
          hardwareProfile: 'modbus' as const,
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
    await fixture.runtime.receiveDesired(
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
    Object.assign(fixture.device, { readOutput });
    const clock = jest.spyOn(Date, 'now');
    const now = Date.now();
    const pending = fixture.runtime.pollModbusOutputs();
    try {
      // Heartbeat/state publication must see each completed healthy sample even
      // though the other connection's request has not returned.
      await fixture.runtime.publishHeartbeat();
      await fixture.runtime.publishHeartbeat();
      expect(readOutput.mock.calls.map(([point]) => point.id)).toEqual(['slow', 'healthy', 'healthy-second']);
      expect(fixture.state.outputs).toMatchObject({ healthy: false, 'healthy-second': false });
      healthyValue = true;
      clock.mockReturnValue(now + 11000);
      await fixture.runtime.pollModbusOutputs();
      await fixture.runtime.publishHeartbeat();
      expect(fixture.state.outputs).toEqual({ healthy: true, 'healthy-second': true });
      expect(readOutput.mock.calls.filter(([point]) => point.id === 'slow')).toHaveLength(1);
      expect(fixture.state.inputs).toEqual({ input: true });
    } finally {
      releaseSlow(false);
      await pending;
      clock.mockRestore();
    }
  });
});
