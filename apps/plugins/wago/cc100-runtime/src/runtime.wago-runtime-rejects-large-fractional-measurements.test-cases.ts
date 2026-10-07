import { hash, type Snapshot } from './runtime';
import { WagoRuntimeTestScope } from './runtime.spec';
export function registerWagoRuntimeRejectsLargeFractionalMeasurements(scope: WagoRuntimeTestScope): void {
  it('rejects large fractional measurements', async () => {
    const metered: Snapshot = {
      version: 1,
      physicalPoints: [{ id: 'meter', hardwareProfile: '751-9301', channel: 0 }],
      logicalChannels: [
        {
          id: 'power',
          physicalPointId: 'meter',
          profile: 'meter',
          capabilities: ['measurement'],
          disconnectPolicy: { mode: 'hold' },
          measurement: { unit: 'watt', scale: 1, offset: 0 },
        },
      ],
    };
    scope.device.values.set('751-9301:0', 1_000_000_000_000_000.25);
    await scope.transport.send(scope.desired, {
      protocolVersion: 1,
      revision: 1,
      contentHash: hash(metered),
      snapshot: metered,
    });
    await scope.runtime.publishMeasurements();

    expect(scope.transport.published).toContainEqual(
      expect.objectContaining({
        topic: 'attraccess/wago/v1/controllers/cc100-1/faults',
        payload: expect.objectContaining({ channelId: 'power', code: 'invalid_measurement_transform' }),
      }),
    );
    expect(scope.transport.published).not.toContainEqual(
      expect.objectContaining({
        topic: 'attraccess/wago/v1/controllers/cc100-1/measurements',
      }),
    );
  });
}
