import { commissionClock } from './wago-commissioning-clock';
import type { SourceBackedCommissioningClockGateMockedTransportOnlyTestScope } from "./wago-commissioning-clock.spec";
export function registerAdvancesTheAllowlistedUtcDateAcrossMidnightWithoutAcceptingUnboundedElapsedTime(scope: SourceBackedCommissioningClockGateMockedTransportOnlyTestScope): void {
it('advances the allowlisted UTC date across midnight without accepting unbounded elapsed time', async () => {
    const midnight = Date.parse('2026-12-31T23:59:50Z');
    const execute = jest
      .fn()
      .mockResolvedValueOnce(scope.output())
      .mockResolvedValueOnce('')
      .mockResolvedValueOnce(scope.output(midnight / 1000));
    await commissionClock(
      execute,
      true,
      scope.report,
      () => midnight,
      () => 0,
    );
    expect(execute.mock.calls[1][0]).toContain('10) time=00:00:00; date=01.01.2027;;');
    expect(execute.mock.calls[1][0]).toContain('30) time=00:00:20; date=01.01.2027;;');
    expect(execute.mock.calls[1][0]).not.toContain('31) time=');
  });
}
