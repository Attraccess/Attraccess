import { JsonStateStore, WagoRuntime, hash, type Snapshot } from './runtime';
import { WagoRuntimeTestScope } from './runtime.spec';
export function registerWagoRuntimeUsesANewMeasurementStreamIdentityAfterARuntimeRestart(
  scope: WagoRuntimeTestScope,
): void {
  it('uses a new measurement stream identity after a runtime restart', async () => {
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
    const store = new JsonStateStore(`/tmp/wago-runtime-${Date.now()}-${Math.random()}.json`);
    const firstTransport = new scope.TestTransport();
    const firstRuntime = new WagoRuntime({
      hardwareId: 'cc100-1',
      pairingCode: '482931',
      prefix: 'attraccess/wago',
      store,
      transport: firstTransport,
      device: scope.device,
    });
    scope.device.values.set('751-9301:0', 1);
    await firstRuntime.start();
    await firstTransport.send(scope.desired, {
      protocolVersion: 1,
      revision: 1,
      contentHash: hash(metered),
      snapshot: metered,
    });
    await firstRuntime.publishMeasurements();
    const firstEvent = firstTransport.published.find((event) => event.topic.endsWith('/measurements'));
    if (!firstEvent) throw new Error('first runtime did not publish a measurement');
    const firstMeasurement = firstEvent.payload as { sequence: number; streamId: string };

    const restartedTransport = new scope.TestTransport();
    const restartedRuntime = new WagoRuntime({
      hardwareId: 'cc100-1',
      pairingCode: '482931',
      prefix: 'attraccess/wago',
      store,
      transport: restartedTransport,
      device: scope.device,
    });
    await restartedRuntime.start();
    await restartedRuntime.publishMeasurements();
    const restartedEvent = restartedTransport.published.find((event) => event.topic.endsWith('/measurements'));
    if (!restartedEvent) throw new Error('restarted runtime did not publish a measurement');
    const restartedMeasurement = restartedEvent.payload as { sequence: number; streamId: string };

    expect(restartedMeasurement).toEqual(
      expect.objectContaining({ sequence: expect.any(Number), streamId: expect.any(String) }),
    );
    expect(restartedMeasurement.streamId).not.toBe(firstMeasurement.streamId);
  });
}
