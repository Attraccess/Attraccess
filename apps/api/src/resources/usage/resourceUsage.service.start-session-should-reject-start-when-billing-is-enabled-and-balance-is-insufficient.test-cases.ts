import { Resource, ResourceUsage, ResourceType, ResourceUsageAction, User } from '@attraccess/database-entities';
import { StartUsageSessionDto } from './dtos/startUsageSession.dto';
import { InsufficientBalanceError } from '../../billing/errors/insufficient-balance.error';
import { StartSessionTestScope } from './resourceUsage.service.spec';
export function registerStartSessionShouldRejectStartWhenBillingIsEnabledAndBalanceIsInsufficient(
  scope: StartSessionTestScope,
): void {
  it('should reject start when billing is enabled and balance is insufficient', async () => {
    const dto: StartUsageSessionDto = { notes: 'Test session' };

    scope.resourceRepository.findOne.mockResolvedValue({
      id: 1,
      name: 'Test Resource',
      allowTakeOver: false,
      type: ResourceType.Machine,
    } as Resource);
    scope.resourceMaintenanceService.hasActiveMaintenance.mockResolvedValue(false);
    scope.resourceIntroductionService.hasValidIntroduction.mockResolvedValue(true);
    scope.resourceGroupsIntroductionsService.hasValidIntroduction.mockResolvedValue(false);
    scope.resourceIntroducersService.isIntroducer.mockResolvedValue(false);
    scope.resourceGroupsIntroducersService.isIntroducer.mockResolvedValue(false);
    scope.resourceGroupsService.getGroupsOfResource.mockResolvedValue([]);

    scope.billingService.handleResourceUsageStart.mockRejectedValue(new InsufficientBalanceError());

    // getActiveSession -> null, then fetch newly created session
    scope.resourceUsageRepository.findOne.mockResolvedValueOnce(null).mockResolvedValueOnce({
      id: 1,
      resourceId: 1,
      userId: 1,
      usageAction: ResourceUsageAction.Usage,
      endTime: null,
      user: { id: 1 } as User,
      resource: { id: 1 } as Resource,
    } as ResourceUsage);

    await expect(scope.service.startSession(1, { id: 1 } as User, dto)).rejects.toBeInstanceOf(
      InsufficientBalanceError,
    );

    expect(scope.billingService.handleResourceUsageStart).toHaveBeenCalled();
  });
}
