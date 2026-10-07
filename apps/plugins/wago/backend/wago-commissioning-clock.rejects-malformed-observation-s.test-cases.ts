import { commissionClock } from './wago-commissioning-clock';
import type { SourceBackedCommissioningClockGateMockedTransportOnlyTestScope } from "./wago-commissioning-clock.spec";
export function registerRejectsMalformedObservationS(scope: SourceBackedCommissioningClockGateMockedTransportOnlyTestScope): void {
it.each([
    'epoch=NaN\n',
    scope.output().replace('1654436642', '9999999999'),
    scope.output().replace(scope.boot, '$(id)'),
    scope.output() + 'epoch=123\n',
  ])('rejects malformed observation %s', async (invalid) => {
    const execute = jest.fn().mockResolvedValue(invalid);
    await expect(
      commissionClock(
        execute,
        true,
        scope.report,
        () => scope.host,
        () => 0,
      ),
    ).rejects.toThrow();
    expect(execute).toHaveBeenCalledTimes(1);
  });
}
