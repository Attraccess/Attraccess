import { WagoCommissioningSession } from './wago-commissioning-session.entity';
import type { CommissioningWorkflowsWithARealIsolatedDatabaseAndMockedDeviceTransportTestScope } from "./wago-commissioning-workflow.spec";
export function registerBlocksAnUnfinishedPreparationBeforeAnyFurtherHostMutation(scope: CommissioningWorkflowsWithARealIsolatedDatabaseAndMockedDeviceTransportTestScope): void {
it('blocks an unfinished preparation before any further host mutation', async () => {
    const token = 'c'.repeat(32);
    const repository = scope.db.getRepository(WagoCommissioningSession);
    await repository.update(scope.session.id, {
      platformReport: JSON.stringify({ platform: 'supported', provision: 'review-start-installed-runtime' }),
      dockerProvisionToken: token,
      dockerProvisionState: token ? 'starting' : null,
    });
    const before = await repository.findOneByOrFail({ id: scope.session.id });
    const remote = jest.spyOn(scope.service as never, 'sudoRunScript');
    await expect(
      scope.service.platform(
        scope.session.id,
        'activate',
        {
          temporarySsh: scope.credential,
          reviewedDockerActivation: true,
        },
        scope.principal,
      ),
    ).rejects.toThrow('retained controller preparation');
    expect(await repository.findOneByOrFail({ id: scope.session.id })).toEqual(before);
    expect(remote).not.toHaveBeenCalled();
  });
}
