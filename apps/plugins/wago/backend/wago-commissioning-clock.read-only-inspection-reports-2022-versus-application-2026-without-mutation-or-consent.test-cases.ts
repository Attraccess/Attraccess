import { CLOCK_INSPECTION_SCRIPT, CLOCK_LIMITS, commissionClock } from './wago-commissioning-clock';
import type { SourceBackedCommissioningClockGateMockedTransportOnlyTestScope } from "./wago-commissioning-clock.spec";
export function registerReadOnlyInspectionReports2022VersusApplication2026WithoutMutationOrConsent(scope: SourceBackedCommissioningClockGateMockedTransportOnlyTestScope): void {
it('read-only inspection reports 2022 versus application 2026 without mutation or consent', async () => {
    const execute = jest.fn().mockResolvedValue(scope.output());
    await expect(
      commissionClock(
        execute,
        false,
        scope.report,
        () => scope.host,
        () => 0,
      ),
    ).resolves.toMatchObject({
      action: 'none',
      result: 'correction-required',
      skewSeconds: scope.oldEpoch - scope.epoch,
      hostUtc: '2026-09-06T18:00:00.000Z',
      controllerUtc: '2022-06-05T13:44:02.000Z',
    });
    expect(execute).toHaveBeenCalledTimes(1);
    expect(execute).toHaveBeenCalledWith(CLOCK_INSPECTION_SCRIPT, CLOCK_LIMITS);
    expect(CLOCK_INSPECTION_SCRIPT).not.toContain('type=utc');
  });
}
