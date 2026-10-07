import { commissionClock } from './wago-commissioning-clock';
import type { SourceBackedCommissioningClockGateMockedTransportOnlyTestScope } from "./wago-commissioning-clock.spec";
export function registerIncludesObservationUncertaintyRatherThanClaimingTheMidpointIsExact(scope: SourceBackedCommissioningClockGateMockedTransportOnlyTestScope): void {
it('includes observation uncertainty rather than claiming the midpoint is exact', async () => {
    let elapsed = 0;
    const execute = jest.fn().mockImplementation(async () => {
      elapsed = 4000;
      return scope.output(scope.epoch + 5);
    });
    await expect(
      commissionClock(
        execute,
        false,
        scope.report,
        () => scope.host + elapsed,
        () => elapsed,
      ),
    ).resolves.toMatchObject({
      skewSeconds: 3,
      uncertaintySeconds: 3,
      result: 'correction-required',
      action: 'none',
    });
  });
}
