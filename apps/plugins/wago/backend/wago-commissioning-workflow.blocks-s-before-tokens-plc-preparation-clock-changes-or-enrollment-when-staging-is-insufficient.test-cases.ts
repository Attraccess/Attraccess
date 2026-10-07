import { existsSync } from 'node:fs';
import { WagoCommissioningSession } from './wago-commissioning-session.entity';
import { runtimeBundleStagingCapacityPreflightScript } from './wago-runtime-install';
import type { CommissioningWorkflowsWithARealIsolatedDatabaseAndMockedDeviceTransportTestScope } from "./wago-commissioning-workflow.spec";
export function registerBlocksSBeforeTokensPlcPreparationClockChangesOrEnrollmentWhenStagingIsInsufficient(scope: CommissioningWorkflowsWithARealIsolatedDatabaseAndMockedDeviceTransportTestScope): void {
it.each(['deliver', 'activate'] as const)(
    'blocks %s before tokens, PLC preparation, clock changes or enrollment when staging is insufficient',
    async (action) => {
      scope.wago.createEnrollment.mockClear();
      const remote = jest.spyOn(scope.service as never, 'sudoRunScript').mockImplementation((async (
        _host,
        _pin,
        _credential,
        script: string,
      ) => {
        expect(scope.artifacts.acquire).toHaveBeenCalledWith();
        expect(script).toBe(runtimeBundleStagingCapacityPreflightScript(512));
        const saved = await scope.db.getRepository(WagoCommissioningSession).findOneByOrFail({ id: scope.session.id });
        expect(saved.dockerProvisionToken).toBeNull();
        expect(saved.deliveryToken).toBeNull();
        throw new Error('Insufficient runtime storage');
      }) as never);
      const copy = jest.spyOn(scope.service as never, 'copyTo');
      const result =
        action === 'deliver'
          ? await scope.service.deliver(scope.session.id, { confirmInstall: true, temporarySsh: scope.credential }, scope.principal)
          : await scope.service.platform(
              scope.session.id,
              'activate',
              { reviewedDockerActivation: true, temporarySsh: scope.credential },
              scope.principal,
            );
      expect(result.failureReason).toBeTruthy();
      expect(remote).toHaveBeenCalledTimes(1);
      expect(scope.wago.createEnrollment).not.toHaveBeenCalled();
      expect(copy).not.toHaveBeenCalled();
      expect(await scope.db.getRepository(WagoCommissioningSession).findOneByOrFail({ id: scope.session.id })).toMatchObject({
        dockerProvisionToken: null,
        dockerProvisionState: null,
        deliveryToken: null,
        enrollmentId: null,
      });
      expect(existsSync(scope.directory)).toBe(false);
    },
  );
}
