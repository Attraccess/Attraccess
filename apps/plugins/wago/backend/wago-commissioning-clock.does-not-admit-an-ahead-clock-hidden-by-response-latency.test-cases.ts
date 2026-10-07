import { commissionClock } from './wago-commissioning-clock';
import type { SourceBackedCommissioningClockGateMockedTransportOnlyTestScope } from "./wago-commissioning-clock.spec";
export function registerDoesNotAdmitAnAheadClockHiddenByResponseLatency(scope: SourceBackedCommissioningClockGateMockedTransportOnlyTestScope): void {
it('does not admit an ahead clock hidden by response latency', async () => {
    let elapsed = 0;
    const execute = jest.fn().mockImplementation(async () => {
      elapsed = 20_000;
      return scope.output(scope.epoch + 20);
    });
    await expect(
      commissionClock(
        execute,
        true,
        scope.report,
        () => scope.host + elapsed,
        () => elapsed,
      ),
    ).rejects.toThrow('expired');
    expect(execute).toHaveBeenCalledTimes(1);
  });
}
