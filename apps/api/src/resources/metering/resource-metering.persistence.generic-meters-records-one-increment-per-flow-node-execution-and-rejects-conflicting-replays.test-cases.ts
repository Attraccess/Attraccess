import { GenericMetersTestScope } from './resource-metering.persistence.spec';
export function registerGenericMetersRecordsOneIncrementPerFlowNodeExecutionAndRejectsConflictingReplays(
  scope: GenericMetersTestScope,
): void {
  it('records one increment per flow node execution and rejects conflicting replays', async () => {
    const report = { kind: 'reading' as const, mode: 'increment' as const, value: '3' };
    await scope.metering.report(1, 1, report, undefined, undefined, 'flow:1:node');
    await scope.metering.report(1, 1, report, undefined, undefined, 'flow:1:node');
    expect((await scope.metering.listMeters(1))[0].lifetimeValue).toBe('3');
    await expect(
      scope.metering.report(1, 1, { ...report, value: '4' }, undefined, undefined, 'flow:1:node'),
    ).rejects.toThrow('conflicting');
  });
}
