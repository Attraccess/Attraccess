import { ManagedEnrolmentAndDurableCredentialLifecycleTestScope } from './wago-managed-runtime.spec';
export function registerManagedEnrolmentAndDurableCredentialLifecycleCoalescesRepeatedHeartbeatWakesIntoOneBoundedFleetScanWindow(
  scope: ManagedEnrolmentAndDurableCredentialLifecycleTestScope,
): void {
  it('coalesces repeated heartbeat wakes into one bounded fleet scan window', async () => {
    const internals = scope.service as unknown as {
      scan(): Promise<void>;
      wake(): void;
      nextScanAt: number;
      scanning: boolean;
    };
    const deadline = Date.now() + 5000;
    while (internals.scanning && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 10));
    expect(internals.scanning).toBe(false);
    const scan = jest.spyOn(internals, 'scan').mockResolvedValue(undefined);
    internals.nextScanAt = 0;
    internals.wake();
    await new Promise(setImmediate);
    for (let count = 0; count < 50; count++) internals.wake();
    await new Promise(setImmediate);
    expect(scan).toHaveBeenCalledTimes(1);
    internals.nextScanAt = 0;
    internals.wake();
    await new Promise(setImmediate);
    expect(scan).toHaveBeenCalledTimes(2);
  });
}
