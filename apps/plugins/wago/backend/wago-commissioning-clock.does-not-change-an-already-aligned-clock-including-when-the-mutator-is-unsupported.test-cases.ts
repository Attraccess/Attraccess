import { commissionClock } from './wago-commissioning-clock';
import type { SourceBackedCommissioningClockGateMockedTransportOnlyTestScope } from "./wago-commissioning-clock.spec";
export function registerDoesNotChangeAnAlreadyAlignedClockIncludingWhenTheMutatorIsUnsupported(scope: SourceBackedCommissioningClockGateMockedTransportOnlyTestScope): void {
it('does not change an already aligned clock, including when the mutator is unsupported', async () => {
    const execute = jest.fn().mockResolvedValue(scope.output(scope.epoch, 'unsupported'));
    await expect(
      commissionClock(
        execute,
        true,
        scope.report,
        () => scope.host,
        () => 0,
      ),
    ).resolves.toMatchObject({ result: 'within-tolerance', action: 'none' });
    expect(execute).toHaveBeenCalledTimes(1);
  });
}
