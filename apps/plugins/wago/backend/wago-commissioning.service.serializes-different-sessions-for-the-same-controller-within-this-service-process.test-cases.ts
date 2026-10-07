import type { WagoCommissioningServiceTestScope } from "./wago-commissioning.service.spec";
export function registerSerializesDifferentSessionsForTheSameControllerWithinThisServiceProcess(scope: WagoCommissioningServiceTestScope): void {
it('serializes different sessions for the same controller within this service process', async () => {
    const { service, repository, session } = scope.securityHarness({ hostKeyFingerprint: 'SHA256:controller' });
    repository.findOneBy.mockImplementation(async ({ id }) => ({ ...session, id }));
    let release!: () => void;
    const pending = new Promise<void>((resolve) => {
      release = resolve;
    });
    const first = service['withControllerLock'](1, () => pending);
    const secondWork = jest.fn();
    const second = service['withControllerLock'](2, secondWork);
    await new Promise((resolve) => setImmediate(resolve));
    expect(secondWork).not.toHaveBeenCalled();
    release();
    await Promise.all([first, second]);
    expect(secondWork).toHaveBeenCalledTimes(1);
  });
}
