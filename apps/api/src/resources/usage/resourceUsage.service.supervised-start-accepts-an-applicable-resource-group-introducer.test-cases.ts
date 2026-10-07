import { SupervisionMode } from '@attraccess/database-entities';
import { SupervisedStartTestScope } from './resourceUsage.service.spec';
export function registerSupervisedStartAcceptsAnApplicableResourceGroupIntroducer(
  scope: SupervisedStartTestScope,
): void {
  it('accepts an applicable Resource Group introducer', async () => {
    scope.resourceRepository.findOne.mockResolvedValue(scope.supervisedResource(SupervisionMode.SUPERVISION_ALLOWED));
    scope.resourceMaintenanceService.hasActiveMaintenance.mockResolvedValue(false);
    scope.userRepository.findOne.mockResolvedValue(scope.supervisor);
    scope.resourceIntroducersService.isIntroducer.mockResolvedValue(true);
    scope.mockSuccessfulSessionCreation(2);

    await expect(scope.service.startSession(1, scope.requester, {}, { supervisorUserId: 2 })).resolves.toMatchObject({
      supervisorUserId: 2,
    });
    expect(scope.resourceIntroducersService.isIntroducer).toHaveBeenCalledWith(1, 2, true, expect.anything());
  });
}
