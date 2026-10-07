import { ResourceUsage, User, ResourceFlowNodeType } from '@attraccess/database-entities';
import { SelectQueryBuilder } from 'typeorm';
import { EndUsageSessionDto } from './dtos/endUsageSession.dto';
import { EndSessionTestScope } from './resourceUsage.service.spec';
export function registerEndSessionAllowsTheSupervisorOfASupervisedSessionToEndItWithoutAnIntroducerRole(
  scope: EndSessionTestScope,
): void {
  it('allows the supervisor of a supervised session to end it without an introducer role', async () => {
    const dto: EndUsageSessionDto = { notes: 'Supervisor stop' };
    const sessionOwner = { id: 60, username: 'student' } as User;
    const supervisorUser = { id: 61, username: 'supervisor' } as User;
    const mockActiveSession = {
      id: 9,
      resourceId: 40,
      userId: sessionOwner.id,
      supervisorUserId: supervisorUser.id,
      startTime: new Date(),
      user: sessionOwner,
    } as ResourceUsage;
    const prefixedNotes = `[By #${supervisorUser.id} - ${supervisorUser.username}] ${dto.notes}`;
    const mockUpdatedSession = { ...mockActiveSession, endTime: new Date(), endNotes: prefixedNotes };

    scope.resourceUsageRepository.findOne
      .mockResolvedValueOnce(mockActiveSession)
      .mockResolvedValueOnce(mockUpdatedSession)
      .mockResolvedValueOnce(mockUpdatedSession);

    const mockUpdateQueryBuilder = scope.createMockQueryBuilder(null);
    (scope.transactionalEntityManager.createQueryBuilder as jest.Mock).mockReturnValue(
      mockUpdateQueryBuilder as unknown as SelectQueryBuilder<ResourceUsage>,
    );

    const result = await scope.service.endSession(mockActiveSession.resourceId, supervisorUser, dto);

    expect(result).toBe(mockUpdatedSession);
    // The supervisor short-circuits the authorization check; no introducer lookup needed.
    expect(scope.resourceIntroducersService.canMaintain).not.toHaveBeenCalled();
    expect(scope.flowExecutorService.runFlow).toHaveBeenCalledWith(
      mockActiveSession.resourceId,
      ResourceFlowNodeType.INPUT_RESOURCE_USAGE_STOPPED,
      expect.objectContaining({ endNotes: prefixedNotes }),
      undefined,
      { lifecycleAttemptId: expect.any(String) },
    );
  });
}
