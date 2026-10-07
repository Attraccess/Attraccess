import { GenericMetersTestScope } from './resource-metering.persistence.spec';
export function registerGenericMetersUsesTheFirstCumulativeReadingAsABaselineAndNeverDoubleCountsRepeatedTotals(
  scope: GenericMetersTestScope,
): void {
  it('uses the first cumulative reading as a baseline and never double-counts repeated totals', async () => {
    await scope.metering.report(1, 1, { kind: 'reading', value: '100' });
    await scope.metering.report(1, 1, { kind: 'reading', value: '102.25' });
    await scope.metering.report(1, 1, { kind: 'reading', value: '102.25' });
    expect((await scope.metering.listMeters(1))[0].lifetimeValue).toBe('2.25');
    await expect(scope.metering.report(1, 1, { kind: 'reading', value: '99' })).rejects.toThrow('counter decreased');
    expect((await scope.metering.listMeters(1))[0].lifetimeValue).toBe('2.25');
  });
}
