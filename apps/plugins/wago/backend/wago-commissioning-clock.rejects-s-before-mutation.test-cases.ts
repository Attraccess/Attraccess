import { commissionClock } from './wago-commissioning-clock';
import type { SourceBackedCommissioningClockGateMockedTransportOnlyTestScope } from "./wago-commissioning-clock.spec";
export function registerRejectsSBeforeMutation(scope: SourceBackedCommissioningClockGateMockedTransportOnlyTestScope): void {
it.each(['slow-read', 'slow-save', 'host-jump'])('rejects %s before mutation', async (scenario) => {
    let elapsed = 0;
    let hostOffset = 0;
    const execute = jest.fn().mockImplementation(async () => {
      if (scenario === 'slow-read') elapsed = 30_001;
      if (scenario === 'host-jump') hostOffset = 2000;
      return scope.output();
    });
    const save = async () => {
      if (scenario === 'slow-save') elapsed = 30_001;
    };
    await expect(
      commissionClock(
        execute,
        true,
        save,
        () => scope.host + elapsed + hostOffset,
        () => elapsed,
      ),
    ).rejects.toThrow();
    expect(execute).toHaveBeenCalledTimes(1);
  });
}
