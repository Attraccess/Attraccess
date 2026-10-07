import { ResourceUsage, User, ResourceFlowNodeType } from '@attraccess/database-entities';
import { SelectQueryBuilder } from 'typeorm';
import { EndUsageSessionDto } from './dtos/endUsageSession.dto';
import { EndSessionTestScope } from './resourceUsage.service.spec';
export function registerEndSessionAllowsResourceIntroducersAndMaintainersToEndSessionsOwnedByOthers(
  scope: EndSessionTestScope,
): void {
  it('allows resource introducers and maintainers to end sessions owned by others', async () => {
    const dto: EndUsageSessionDto = { notes: 'Introducer stop' };
    const sessionOwner = { id: 31, username: 'member' } as User;
    const introducerUser = { id: 44, username: 'resource-introducer' } as User;
    const mockActiveSession = {
      id: 6,
      resourceId: 22,
      userId: sessionOwner.id,
      startTime: new Date(),
      user: sessionOwner,
    } as ResourceUsage;
    const prefixedNotes = `[By #${introducerUser.id} - ${introducerUser.username}] ${dto.notes}`;
    const mockUpdatedSession = {
      ...mockActiveSession,
      endTime: new Date(),
      endNotes: prefixedNotes,
    };

    scope.resourceIntroducersService.canMaintain.mockResolvedValue(true);
    scope.resourceUsageRepository.findOne
      .mockResolvedValueOnce(mockActiveSession)
      .mockResolvedValueOnce(mockUpdatedSession)
      .mockResolvedValueOnce(mockUpdatedSession);

    const mockUpdateQueryBuilder = scope.createMockQueryBuilder(null);
    (scope.transactionalEntityManager.createQueryBuilder as jest.Mock).mockReturnValue(
      mockUpdateQueryBuilder as unknown as SelectQueryBuilder<ResourceUsage>,
    );

    const result = await scope.service.endSession(mockActiveSession.resourceId, introducerUser, dto);

    expect(result).toBe(mockUpdatedSession);
    expect(scope.resourceIntroducersService.canMaintain).toHaveBeenCalledWith(
      mockActiveSession.resourceId,
      introducerUser.id,
      true,
    );
    expect(scope.flowExecutorService.runFlow).toHaveBeenCalledWith(
      mockActiveSession.resourceId,
      ResourceFlowNodeType.INPUT_RESOURCE_USAGE_STOPPED,
      expect.objectContaining({ endNotes: prefixedNotes }),
      undefined,
      { lifecycleAttemptId: expect.any(String) },
    );
  });
}
