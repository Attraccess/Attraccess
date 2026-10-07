import { commissionClock } from './wago-commissioning-clock';
import type { SourceBackedCommissioningClockGateMockedTransportOnlyTestScope } from "./wago-commissioning-clock.spec";
export function registerRechecksApplicationClockContinuityImmediatelyBeforeEnrollmentIncludingAfterPersistence(scope: SourceBackedCommissioningClockGateMockedTransportOnlyTestScope): void {
it('rechecks application clock continuity immediately before enrollment, including after persistence', async () => {
    let offset = 0;
    const execute = jest.fn().mockResolvedValue(scope.output(scope.epoch));
    const verified = await commissionClock(
      execute,
      true,
      scope.report,
      () => scope.host + offset,
      () => 0,
    );
    verified.assertFresh();
    offset = 10_000;
    expect(verified.assertFresh).toThrow('Application clock changed');
    offset = 0;
    await expect(
      commissionClock(
        execute,
        true,
        async () => {
          offset = 10_000;
        },
        () => scope.host + offset,
        () => 0,
      ),
    ).rejects.toThrow('Application clock changed');
  });
}
