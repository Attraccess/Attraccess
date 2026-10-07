import { WagoCommissioningSession } from './wago-commissioning-session.entity';
import type { CommissioningWorkflowsWithARealIsolatedDatabaseAndMockedDeviceTransportTestScope } from "./wago-commissioning-workflow.spec";
export function registerResolvesTheCurrentArtifactAndCarriesAnExistingDockerTokenIntoTheRuntimeTransaction(scope: CommissioningWorkflowsWithARealIsolatedDatabaseAndMockedDeviceTransportTestScope): void {
it('resolves the current artifact and carries an existing Docker token into the runtime transaction', async () => {
    jest
      .spyOn(scope.service as never, 'sudoRunScript')
      .mockImplementation((async (_host, _pin, _credential, script: string) =>
        script.includes("printf 'epoch=")
          ? `epoch=${Math.floor(Date.now() / 1000)}\nuptime=100.00\nboot=aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee\ntool=supported\n`
          : scope.stoppedReport) as never);
    await scope.service.platform(scope.session.id, 'inspect', { temporarySsh: scope.credential }, scope.principal);
    await scope.db.getRepository(WagoCommissioningSession).update(scope.session.id, {
      dockerProvisionToken: 'c'.repeat(32),
      dockerProvisionState: 'started',
    });
    const saved = await scope.db.getRepository(WagoCommissioningSession).findOneByOrFail({ id: scope.session.id });
    expect(saved.dockerProvisionToken).toMatch(/^[a-f0-9]{32}$/);
    const copy = jest.spyOn(scope.service as never, 'copyTo').mockResolvedValue(undefined as never);
    const delivered = await scope.service.deliver(scope.session.id, { confirmInstall: true, temporarySsh: scope.credential }, scope.principal);
    expect(delivered.state).toBe('awaiting_discovery');
    expect(scope.artifacts.acquire).toHaveBeenCalledWith();
    const script = copy.mock.calls[0][4] as string;
    expect(script).toContain(saved.dockerProvisionToken);
    expect(script).toContain('WAGO_HARDWARE_PROFILE=cc100-751-9301-fw31-digital-v1');
    expect(script).toContain('--user 10001:10001 --cap-drop ALL');
    expect(JSON.stringify(delivered)).not.toContain('bootstrap-fixture');
    expect((await scope.service.list())[0]).not.toHaveProperty('deliveryToken');
    expect((await scope.service.list())[0]).not.toHaveProperty('initiatingPrincipal');
  });
}
