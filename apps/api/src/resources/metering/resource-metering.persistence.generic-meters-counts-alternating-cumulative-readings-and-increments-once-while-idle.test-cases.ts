import { GenericMetersTestScope } from './resource-metering.persistence.spec';
export function registerGenericMetersCountsAlternatingCumulativeReadingsAndIncrementsOnceWhileIdle(
  scope: GenericMetersTestScope,
): void {
  it('counts alternating cumulative readings and increments once while idle', async () => {
    await scope.metering.report(1, 1, { kind: 'reading', value: '100' });
    await scope.metering.report(1, 1, { kind: 'reading', mode: 'increment', value: '2' });
    await scope.metering.report(1, 1, { kind: 'reading', value: '103' });
    expect((await scope.metering.listMeters(1))[0]).toEqual(
      expect.objectContaining({ lifetimeValue: '3', counterValue: '103', session: null }),
    );
  });
}
