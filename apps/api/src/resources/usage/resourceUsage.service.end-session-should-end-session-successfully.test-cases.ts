import { ResourceUsage, User } from '@attraccess/database-entities';
import { SelectQueryBuilder } from 'typeorm';
import { EndUsageSessionDto } from './dtos/endUsageSession.dto';
import { ResourceSessionStartedEvent } from './events/resource-usage.events';
import { EndSessionTestScope } from './resourceUsage.service.spec';
export function registerEndSessionShouldEndSessionSuccessfully(scope: EndSessionTestScope): void {
  it('should end session successfully', async () => {
    const dto: EndUsageSessionDto = { notes: 'Session completed' };
    const mockActiveSession = {
      id: 1,
      resourceId: 1,
      userId: 1,
      startTime: new Date(),
      user: { id: 1 } as User,
    } as ResourceUsage;
    const mockUpdatedSession = { ...mockActiveSession, endTime: new Date(), endNotes: 'Session completed' };

    // Mock getActiveSession to return an active session, emitUsageEvent fetch, then final fetch
    scope.resourceUsageRepository.findOne
      .mockResolvedValueOnce(mockActiveSession) // 1) getActiveSession
      .mockResolvedValueOnce(mockUpdatedSession) // 2) emitUsageEvent fetch
      .mockResolvedValueOnce(mockUpdatedSession); // 3) fetch updated session to return

    const mockUpdateQueryBuilder = scope.createMockQueryBuilder(null);
    // Ensure update(ResourceUsage) is called: our mock returns chainable builder
    (mockUpdateQueryBuilder.update as jest.Mock).mockReturnValue(mockUpdateQueryBuilder);
    scope.resourceUsageRepository.createQueryBuilder.mockReturnValue(
      mockUpdateQueryBuilder as unknown as SelectQueryBuilder<ResourceUsage>,
    );

    const result = await scope.service.endSession(1, scope.mockUser, dto);

    expect(result).toBe(mockUpdatedSession);
    expect(scope.resourceUsageRepository.manager.transaction).toHaveBeenCalled();
    expect(scope.eventEmitter.emitAsync).toHaveBeenCalledWith(
      ResourceSessionStartedEvent.EVENT_NAME,
      expect.any(Object),
    );

    const emitted = scope.eventEmitter.emitAsync.mock.calls.find(
      (c) => c[0] === ResourceSessionStartedEvent.EVENT_NAME,
    );
    const eventPayload = emitted?.[1] as ResourceSessionStartedEvent;
    expect(eventPayload).toBeInstanceOf(ResourceSessionStartedEvent);
    expect(eventPayload.usage).toMatchObject({ id: 1, userId: 1, endNotes: 'Session completed' });
    expect(scope.mockAuditService.recordResource).toHaveBeenCalledWith({
      action: 'usage_session.ended',
      actorId: 1,
      authenticationMethod: 'session',
      subjectId: 1,
      details: { usageId: 1, usageUserId: 1 },
    });
  });
}
