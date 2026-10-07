import { commissionClock } from './wago-commissioning-clock';
import type { SourceBackedCommissioningClockGateMockedTransportOnlyTestScope } from "./wago-commissioning-clock.spec";
export function registerRejectsUnsupportedToolBeforeMutation(scope: SourceBackedCommissioningClockGateMockedTransportOnlyTestScope): void {
it('rejects unsupported tool before mutation', async () => {
    const execute = jest.fn().mockResolvedValue(scope.output(scope.oldEpoch, 'unsupported'));
    await expect(
      commissionClock(
        execute,
        true,
        scope.report,
        () => scope.host,
        () => 0,
      ),
    ).rejects.toThrow('Unsupported FW31');
    expect(execute).toHaveBeenCalledTimes(1);
    expect(scope.report).toHaveBeenLastCalledWith(expect.objectContaining({ result: 'failed', action: 'none' }));
  });
}
