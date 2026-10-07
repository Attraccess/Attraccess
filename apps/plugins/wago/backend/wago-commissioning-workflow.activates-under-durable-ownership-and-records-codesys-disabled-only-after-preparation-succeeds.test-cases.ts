import { existsSync } from 'node:fs';
import { WagoCommissioningSession } from './wago-commissioning-session.entity';
import { runtimeBundleStagingCapacityPreflightScript } from './wago-runtime-install';
import type { CommissioningWorkflowsWithARealIsolatedDatabaseAndMockedDeviceTransportTestScope } from "./wago-commissioning-workflow.spec";
export function registerActivatesUnderDurableOwnershipAndRecordsCodesysDisabledOnlyAfterPreparationSucceeds(scope: CommissioningWorkflowsWithARealIsolatedDatabaseAndMockedDeviceTransportTestScope): void {
it('activates under durable ownership and records CODESYS disabled only after preparation succeeds', async () => {
    const repository = scope.db.getRepository(WagoCommissioningSession);
    const remote = jest.spyOn(scope.service as never, 'sudoRunScript').mockImplementation((async (
      _host,
      _pin,
      _credential,
      script: string,
    ) => {
      const saved = await repository.findOneByOrFail({ id: scope.session.id });
      expect(scope.artifacts.acquire).toHaveBeenCalledWith();
      if (script === runtimeBundleStagingCapacityPreflightScript(512)) {
        expect(saved.dockerProvisionToken).toBeNull();
        expect(saved.dockerProvisionState).toBeNull();
        return '';
      }
      expect(saved.dockerProvisionToken).toMatch(/^[a-f0-9]{32}$/);
      expect(saved.dockerProvisionState).toBe('starting');
      expect(saved.codesysState).not.toBe('disabled');
      return '';
    }) as never);
    const result = await scope.service.platform(
      scope.session.id,
      'activate',
      {
        temporarySsh: scope.credential,
        reviewedDockerActivation: true,
      },
      scope.principal,
    );
    expect(result).toMatchObject({ dockerProvisionState: 'started', codesysState: 'disabled', failureReason: null });
    expect(result).not.toHaveProperty('dockerProvisionToken');
    expect(remote).toHaveBeenCalledTimes(2);
    expect(remote.mock.calls[0][3]).toBe(runtimeBundleStagingCapacityPreflightScript(512));
    expect(existsSync(scope.directory)).toBe(false);
  });
}
