import { join } from 'node:path';
import { existsSync } from 'node:fs';
import { WagoCommissioningSession } from './wago-commissioning-session.entity';
import type { CommissioningWorkflowsWithARealIsolatedDatabaseAndMockedDeviceTransportTestScope } from "./wago-commissioning-workflow.spec";
export function registerNeverBypassesStagingInSWhenVerifiedBytesAreUnavailable(scope: CommissioningWorkflowsWithARealIsolatedDatabaseAndMockedDeviceTransportTestScope): void {
it.each(['deliver', 'activate'] as const)(
    'never bypasses staging in %s when verified bytes are unavailable',
    async (action) => {
      scope.artifacts.acquire.mockResolvedValue({ digest: scope.digest, directory: scope.directory, path: join(scope.directory, 'runtime.tar') });
      const remote = jest.spyOn(scope.service as never, 'sudoRunScript');
      scope.wago.createEnrollment.mockClear();
      if (action === 'deliver')
        await scope.service.deliver(scope.session.id, { confirmInstall: true, temporarySsh: scope.credential }, scope.principal);
      else
        await scope.service.platform(
          scope.session.id,
          'activate',
          { reviewedDockerActivation: true, temporarySsh: scope.credential },
          scope.principal,
        );
      expect(remote).not.toHaveBeenCalled();
      expect(scope.wago.createEnrollment).not.toHaveBeenCalled();
      expect(
        (await scope.db.getRepository(WagoCommissioningSession).findOneByOrFail({ id: scope.session.id })).dockerProvisionToken,
      ).toBeNull();
      expect(existsSync(scope.directory)).toBe(false);
    },
  );
}
