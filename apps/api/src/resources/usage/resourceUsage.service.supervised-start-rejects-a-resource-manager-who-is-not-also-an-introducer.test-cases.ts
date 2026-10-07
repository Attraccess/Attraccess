import { User, SupervisionMode } from '@attraccess/database-entities';
import { ForbiddenException } from '@nestjs/common';
import { StartUsageSessionDto } from './dtos/startUsageSession.dto';
import { SupervisedStartTestScope } from './resourceUsage.service.spec';
export function registerSupervisedStartRejectsAResourceManagerWhoIsNotAlsoAnIntroducer(
  scope: SupervisedStartTestScope,
): void {
  it('rejects a resource manager who is not also an introducer', async () => {
    const dto: StartUsageSessionDto = {};
    const adminSupervisor = { id: 2, username: 'admin' } as User;
    scope.resourceRepository.findOne.mockResolvedValue(scope.supervisedResource(SupervisionMode.SUPERVISION_ALLOWED));
    scope.resourceMaintenanceService.hasActiveMaintenance.mockResolvedValue(false);
    scope.userRepository.findOne.mockResolvedValue(adminSupervisor);
    scope.resourceIntroducersService.isIntroducer.mockResolvedValue(false);
    scope.mockRbacService.getEffectivePermissions.mockResolvedValue(new Set(['resources.update']));

    await expect(scope.service.startSession(1, scope.requester, dto, { supervisorUserId: 2 })).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });
}
