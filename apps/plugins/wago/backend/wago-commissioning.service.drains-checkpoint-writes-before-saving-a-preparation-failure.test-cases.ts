import type { WagoCommissioningServiceTestScope } from "./wago-commissioning.service.spec";
export function registerDrainsCheckpointWritesBeforeSavingAPreparationFailure(scope: WagoCommissioningServiceTestScope): void {
it('drains checkpoint writes before saving a preparation failure', async () => {
    const { service, session, repository } = scope.securityHarness({ deliveryToken: null });
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const update = jest.fn(() => gate);
    Object.assign(repository, { update });
    service['sudoRunScript'] = jest
      .fn()
      .mockResolvedValueOnce('')
      .mockImplementationOnce((_host, _fingerprint, _credential, _script, limits) => {
        limits.onProgress('preparation-io');
        throw new Error('fixture interruption');
      });
    const result = service['prepareController'](session, { username: 'root', password: 'fixture-only' }, 512);
    const rejection = expect(result).rejects.toThrow('fixture interruption');
    await new Promise((resolve) => setImmediate(resolve));
    expect(update).toHaveBeenCalledWith(
      1,
      expect.objectContaining({ progressPercent: 33, progressStep: 'Verifying exclusive output access' }),
    );
    expect(session.dockerProvisionState).toBe('starting');
    release();
    await rejection;
    expect(session.dockerProvisionState).toBe('recovery_required');
    expect(JSON.parse(session.auditLog).at(-1).event).toBe('controller_preparation_failed');
  });
}
