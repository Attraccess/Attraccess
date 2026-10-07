import { hash, type Snapshot } from './runtime';
import { WagoRuntimeTestScope } from './runtime.spec';
export function registerWagoRuntimePublishesTypedIntegerBaseUnitMeasurementsWithStreamIdentity(
  scope: WagoRuntimeTestScope,
): void {
  it('publishes typed integer-base-unit measurements with stream identity', async () => {
    const metered: Snapshot = {
      version: 1,
      physicalPoints: [{ id: 'meter', hardwareProfile: '751-9301', channel: 0 }],
      logicalChannels: [
        {
          id: 'import-energy',
          physicalPointId: 'meter',
          profile: 'meter',
          capabilities: ['measurement'],
          disconnectPolicy: { mode: 'hold' },
          measurement: { unit: 'watt-hour', scale: 1, offset: 0, kind: 'cumulative' },
        },
      ],
    };
    scope.device.values.set('751-9301:0', 1234);
    await scope.transport.send(scope.desired, {
      protocolVersion: 1,
      revision: 1,
      contentHash: hash(metered),
      snapshot: metered,
    });
    await scope.runtime.publishMeasurements();

    expect(scope.transport.published).toContainEqual(
      expect.objectContaining({
        topic: 'attraccess/wago/v1/controllers/cc100-1/measurements',
        payload: expect.objectContaining({
          channelId: 'import-energy',
          value: 1234000,
          unit: 'milliwatt-hour',
          kind: 'cumulative',
          sequence: expect.any(Number),
          timestamp: expect.any(String),
          streamId: expect.any(String),
        }),
      }),
    );
  });
}
