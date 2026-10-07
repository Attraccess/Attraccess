import { UsageLifecycleTestScope } from './resource-metering.persistence.spec';
export function registerUsageLifecycleInitializesTheMeterBeforeAnyStartEffectAndCollectsOnlyAfterTheStopFlowBeforeTheCharg(
  scope: UsageLifecycleTestScope,
): void {
  it('initializes the meter before any start effect and collects only after the stop flow, before the charge', async () => {
    await scope.seedMeter();
    await scope.start();
    await scope.end();
    expect(scope.log).toEqual([
      'meter:start',
      `flow:${scope.T.INPUT_RESOURCE_USAGE_STARTED}`,
      `flow:${scope.T.INPUT_RESOURCE_USAGE_STOPPED}`,
      'meter:final',
      'charge',
    ]);
  });
}
