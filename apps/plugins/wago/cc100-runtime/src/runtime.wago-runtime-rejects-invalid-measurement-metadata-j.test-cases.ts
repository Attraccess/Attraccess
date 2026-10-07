import { validateSnapshot } from './runtime';
import { WagoRuntimeTestScope } from './runtime.spec';
export function registerWagoRuntimeRejectsInvalidMeasurementMetadataJ(scope: WagoRuntimeTestScope): void {
  it.each([
    { unit: 'unknown', scale: 1, offset: 0 },
    { unit: 'watt', scale: Number.NaN, offset: 0 },
    { unit: 'watt', scale: 1, offset: Number.POSITIVE_INFINITY },
  ])('rejects invalid measurement metadata: %j', (measurement) => {
    const errors = validateSnapshot({
      ...scope.snapshot,
      logicalChannels: [
        {
          ...scope.snapshot.logicalChannels[0],
          capabilities: ['output', 'measurement'],
          measurement,
        },
      ],
    });

    expect(errors).toContainEqual(expect.objectContaining({ code: 'invalid_measurement' }));
  });
}
