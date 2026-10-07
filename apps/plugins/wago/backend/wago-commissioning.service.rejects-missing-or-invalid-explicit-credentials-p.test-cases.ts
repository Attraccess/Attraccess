import type { WagoCommissioningServiceTestScope } from "./wago-commissioning.service.spec";
export function registerRejectsMissingOrInvalidExplicitCredentialsP(scope: WagoCommissioningServiceTestScope): void {
it.each([
    undefined,
    {},
    { username: 'root' },
    { username: 'root', password: '' },
    { username: 'root', password: '   ' },
    { username: ' root', password: 'x' },
    { username: '-option', password: 'x' },
    { username: 'root@host', password: 'x' },
    { username: 12, password: 'x' },
    { username: 'root', password: 12 },
    { username: 'root', password: 'x\ninjected' },
    { username: 'root', password: 'x\0' },
  ])('rejects missing or invalid explicit credentials (%p)', async (temporarySsh) => {
    const { service, inspect, sudo } = scope.securityHarness();
    await expect(service.deliver(1, { confirmInstall: true, temporarySsh } as never)).rejects.toThrow(
      'explicit valid SSH',
    );
    expect(inspect).not.toHaveBeenCalled();
    expect(sudo).not.toHaveBeenCalled();
  });
}
