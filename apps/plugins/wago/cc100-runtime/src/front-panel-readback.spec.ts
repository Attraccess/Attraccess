import { hash, type Snapshot } from './runtime';
import { FrontPanelFixture, snapshot } from './front-panel.test-utils';

describe('front panel runtime', () => {
  let fixture: FrontPanelFixture;
  beforeEach(async () => {
    fixture = new FrontPanelFixture();
    await fixture.setup();
  });

  it('isolates switch acquisition and retains failed readback across heartbeats', async () => {
    const readOutput = jest.fn(async () => false);
    Object.assign(fixture.device, { readOutput });
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
    await fixture.runtime.receiveDesired(
      Buffer.from(JSON.stringify({ protocolVersion: 1, revision: 2, contentHash: hash(next), snapshot: next })),
    );
    expect(readOutput).not.toHaveBeenCalled();
    await fixture.runtime.receiveCommand(fixture.command({ source: 'manual', expectedConfigurationRevision: 2 }));
    expect(fixture.acknowledgements.at(-1)).toMatchObject({ status: 'accepted' });
    expect(readOutput).not.toHaveBeenCalled();
    await fixture.runtime.pollModbusOutputs();
    await fixture.runtime.publishHeartbeat();
    expect(readOutput).toHaveBeenCalled();
    expect(fixture.state.outputs).toEqual({ output: false });
    const publications = fixture.statePublications;
    await fixture.runtime.pollModbusOutputs();
    await fixture.runtime.pollInputs();
    await fixture.runtime.pollInputs();
    expect(fixture.statePublications).toBe(publications);
    const clock = jest.spyOn(Date, 'now');
    const now = Date.now();
    try {
      clock.mockReturnValue(now + 5001);
      readOutput.mockRejectedValueOnce(new Error('No response'));
      await fixture.runtime.pollModbusOutputs();
      await fixture.runtime.publishHeartbeat();
      expect(fixture.state.outputs).toEqual({});
      expect(fixture.state.readiness).toMatchObject({
        errors: [expect.objectContaining({ code: 'modbus_read_failed' })],
      });
      expect(fixture.state.readiness).toMatchObject({
        configurationAccepted: true,
        hardwareAvailable: true,
        ready: true,
      });
      await fixture.runtime.publishHeartbeat();
      expect(fixture.state.outputs).toEqual({});
      expect(fixture.state.readiness).toMatchObject({
        errors: [expect.objectContaining({ code: 'modbus_read_failed' })],
      });
      clock.mockReturnValue(now + 10002);
      let complete: ((value: boolean) => void) | undefined;
      readOutput.mockImplementationOnce(
        () =>
          new Promise<boolean>((resolve) => {
            complete = resolve;
          }),
      );
      const pending = fixture.runtime.pollModbusOutputs();
      await fixture.runtime.pollInputs();
      await fixture.runtime.publishHeartbeat();
      expect(fixture.state.inputs).toEqual({ input: true });
      expect(fixture.state.outputs).toEqual({});
      clock.mockReturnValue(now + 16003);
      await fixture.runtime.publishHeartbeat();
      expect(fixture.state.readiness).toMatchObject({
        errors: [expect.objectContaining({ code: 'modbus_read_failed' })],
      });
      complete?.(true);
      await pending;
      await fixture.runtime.publishHeartbeat();
      expect(fixture.state.outputs).toEqual({ output: true });
      expect(fixture.state.readiness).toMatchObject({
        configurationAccepted: true,
        hardwareAvailable: true,
        ready: true,
        errors: [],
      });
      clock.mockReturnValue(now + 27004);
      await fixture.runtime.publishHeartbeat();
      expect(fixture.state.outputs).toEqual({});
    } finally {
      clock.mockRestore();
    }
  });
});
