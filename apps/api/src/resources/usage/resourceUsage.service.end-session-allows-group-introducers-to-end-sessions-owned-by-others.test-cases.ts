import { ResourceUsage, User, ResourceFlowNodeType } from '@attraccess/database-entities';
import { SelectQueryBuilder } from 'typeorm';
import { EndUsageSessionDto } from './dtos/endUsageSession.dto';
import { EndSessionTestScope } from './resourceUsage.service.spec';
export function registerEndSessionAllowsGroupIntroducersToEndSessionsOwnedByOthers(scope: EndSessionTestScope): void {
  it('allows group introducers to end sessions owned by others', async () => {
    const dto: EndUsageSessionDto = { notes: 'Group introducer stop' };
    const sessionOwner = { id: 51, username: 'owner' } as User;
    const groupIntroducer = { id: 91, username: 'group-introducer' } as User;
    const mockActiveSession = {
      id: 7,
      resourceId: 33,
      userId: sessionOwner.id,
      startTime: new Date(),
      user: sessionOwner,
    } as ResourceUsage;
    const prefixedNotes = `[By #${groupIntroducer.id} - ${groupIntroducer.username}] ${dto.notes}`;
    const mockUpdatedSession = {
      ...mockActiveSession,
      endTime: new Date(),
      endNotes: prefixedNotes,
    };

    scope.resourceIntroducersService.canMaintain.mockImplementation(async (_resId, _userId, includeGroupIntroducers) =>
      includeGroupIntroducers ? true : false,
    );
    scope.resourceUsageRepository.findOne
      .mockResolvedValueOnce(mockActiveSession)
      .mockResolvedValueOnce(mockUpdatedSession)
      .mockResolvedValueOnce(mockUpdatedSession);

    const mockUpdateQueryBuilder = scope.createMockQueryBuilder(null);
    (scope.transactionalEntityManager.createQueryBuilder as jest.Mock).mockReturnValue(
      mockUpdateQueryBuilder as unknown as SelectQueryBuilder<ResourceUsage>,
    );

    const result = await scope.service.endSession(mockActiveSession.resourceId, groupIntroducer, dto);

    expect(result).toBe(mockUpdatedSession);
    expect(scope.resourceIntroducersService.canMaintain).toHaveBeenCalledWith(
      mockActiveSession.resourceId,
      groupIntroducer.id,
      true,
    );
    await expect(scope.resourceIntroducersService.canMaintain.mock.results.at(-1)?.value).resolves.toBe(true);
    expect(scope.flowExecutorService.runFlow).toHaveBeenCalledWith(
      mockActiveSession.resourceId,
      ResourceFlowNodeType.INPUT_RESOURCE_USAGE_STOPPED,
      expect.objectContaining({ endNotes: prefixedNotes }),
      undefined,
      { lifecycleAttemptId: expect.any(String) },
    );
  });
}
