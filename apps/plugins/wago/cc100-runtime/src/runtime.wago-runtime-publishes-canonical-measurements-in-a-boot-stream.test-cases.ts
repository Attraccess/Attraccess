import { hash, type Snapshot } from './runtime';
import { WagoRuntimeTestScope } from './runtime.spec';
export function registerWagoRuntimePublishesCanonicalMeasurementsInABootStream(scope: WagoRuntimeTestScope): void {
  it('publishes canonical measurements in a boot stream', async () => {
    const measurementSnapshot: Snapshot = {
      version: 1,
      physicalPoints: [{ id: 'meter-1', hardwareProfile: '751-9301', channel: 1 }],
      logicalChannels: [
        {
          id: 'meter',
          physicalPointId: 'meter-1',
          profile: 'site-meter',
          capabilities: ['measurement'],
          disconnectPolicy: { mode: 'hold' },
          measurement: { unit: 'percent', scale: 1, offset: 0 },
        },
      ],
    };
    scope.device.values.set('751-9301:1', 0.5);
    await scope.transport.send(scope.desired, {
      protocolVersion: 1,
      revision: 1,
      contentHash: hash(measurementSnapshot),
      snapshot: measurementSnapshot,
    });

    await scope.runtime.publishMeasurements();

    const published = scope.transport.published.find((message) => message.topic.endsWith('/measurements'));
    if (!published) throw new Error('measurement was not published');
    expect(published.payload).toMatchObject({
      channelId: 'meter',
      unit: 'millipercent',
      value: 500,
      kind: 'live',
      streamId: expect.any(String),
    });
  });
}
