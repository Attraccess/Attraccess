import { commissionClock } from './wago-commissioning-clock';
import type { SourceBackedCommissioningClockGateMockedTransportOnlyTestScope } from "./wago-commissioning-clock.spec";
export function registerBlocksSCorrectionPostcondition(scope: SourceBackedCommissioningClockGateMockedTransportOnlyTestScope): void {
it.each(['stale', 'reboot', 'uptime', 'failed'])('blocks %s correction postcondition', async (failure) => {
    const execute = jest.fn().mockResolvedValueOnce(scope.output());
    if (failure === 'failed') execute.mockRejectedValueOnce(new Error('vendor failed'));
    else
      execute
        .mockResolvedValueOnce('')
        .mockResolvedValueOnce(
          scope.output(
            failure === 'stale' ? scope.oldEpoch : scope.epoch,
            'supported',
            failure === 'uptime' ? '99.00' : '100.00',
            failure === 'reboot' ? scope.boot.replace('aaaa', 'ffff') : scope.boot,
          ),
        );
    await expect(
      commissionClock(
        execute,
        true,
        scope.report,
        () => scope.host,
        () => 0,
      ),
    ).rejects.toThrow();
    expect(scope.report).toHaveBeenLastCalledWith(expect.objectContaining({ result: 'failed', action: 'synchronize' }));
    expect(scope.report).toHaveBeenLastCalledWith(
      expect.objectContaining({ observation: failure === 'failed' ? 'before-action' : 'after-action' }),
    );
  });
}
