import { commissionClock } from './wago-commissioning-clock';
import type { SourceBackedCommissioningClockGateMockedTransportOnlyTestScope } from "./wago-commissioning-clock.spec";
export function registerRejectsInvalidHostEpochS(scope: SourceBackedCommissioningClockGateMockedTransportOnlyTestScope): void {
it.each([NaN, Infinity, Date.parse('2039-01-01'), Date.parse('2019-01-01')])(
    'rejects invalid host epoch %s',
    async (invalid) => {
      await expect(
        commissionClock(
          jest.fn().mockResolvedValue(scope.output()),
          true,
          scope.report,
          () => invalid,
          () => 0,
        ),
      ).rejects.toThrow();
    },
  );
}
