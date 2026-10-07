import { commissionClock } from './wago-commissioning-clock';
import type { SourceBackedCommissioningClockGateMockedTransportOnlyTestScope } from "./wago-commissioning-clock.spec";
export function registerRejectsExcessiveSkew(scope: SourceBackedCommissioningClockGateMockedTransportOnlyTestScope): void {
it('rejects excessive skew', async () => {
    await expect(
      commissionClock(
        jest.fn().mockResolvedValue(scope.output(Date.parse('2020-01-01') / 1000)),
        true,
        scope.report,
        () => Date.parse('2037-01-01'),
        () => 0,
      ),
    ).rejects.toThrow('ten-year');
  });
}
