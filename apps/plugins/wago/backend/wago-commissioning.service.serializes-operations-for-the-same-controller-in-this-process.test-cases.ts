import type { WagoCommissioningServiceTestScope } from "./wago-commissioning.service.spec";
export function registerSerializesOperationsForTheSameControllerInThisProcess(scope: WagoCommissioningServiceTestScope): void {
it('serializes operations for the same controller in this process', async () => {
    const { service } = scope.securityHarness();
    let finish!: () => void;
    const pending = new Promise<void>((resolve) => {
      finish = resolve;
    });
    const calls: string[] = [];
    const first = service['withControllerLock'](1, async () => {
      calls.push('first');
      await pending;
    });
    const second = service['withControllerLock'](1, async () => {
      calls.push('second');
    });
    await new Promise((resolve) => setImmediate(resolve));
    expect(calls).toEqual(['first']);
    finish();
    await Promise.all([first, second]);
    expect(calls).toEqual(['first', 'second']);
  });
}
