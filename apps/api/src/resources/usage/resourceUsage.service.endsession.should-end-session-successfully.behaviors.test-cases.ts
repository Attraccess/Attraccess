import { ResourceUsage, User } from '@attraccess/database-entities';
import { SelectQueryBuilder } from 'typeorm';
import { EndUsageSessionDto } from './dtos/endUsageSession.dto';
import { ResourceSessionStartedEvent } from './events/resource-usage.events';
import { registerEndsessionScopeFixture } from './resourceUsage.service.endsession-9b9974.test-fixture';
import { BadRequestException } from '@nestjs/common';
import { registerAllowsGroupIntroducersToEndSessionsOwnedByOthersPart13Cases } from './resourceUsage.service.endsession.allows-group-introducers-to-end-sessions-owned-by-others.behaviors.test-cases';
import { registerAllowsResourceIntroducersAndMaintainersToEndSessionsOwnedPart12Cases } from './resourceUsage.service.endsession.allows-group-introducers-to-end-sessions-owned-by-others.behaviors.test-cases';
import { registerAllowsTheSupervisorOfASupervisedSessionToEndItWithoutAPart14Cases } from './resourceUsage.service.endsession.allows-group-introducers-to-end-sessions-owned-by-others.behaviors.test-cases';
import { registerAllowsUsersWithResourcesUpdatePermissionToEndSessionsOwnPart11Cases } from './resourceUsage.service.endsession.allows-group-introducers-to-end-sessions-owned-by-others.behaviors.test-cases';
import { registerDoesNotEmitTheAutoPromotionCounterEventForAnUnsupervisePart16Cases } from './resourceUsage.service.endsession.does-not-emit-the-auto-promotion-counter-event-for-an-unsupervise.behaviors.test-cases';
import { registerDoesNotEmitTheNoteEventWhenSkipnotenotificationIsSetFloPart8Cases } from './resourceUsage.service.endsession.does-not-emit-the-auto-promotion-counter-event-for-an-unsupervise.behaviors.test-cases';
import { registerEmitsAResourceSessionEndedNotificationEventAfterEndingSoPart5Cases } from './resourceUsage.service.endsession.does-not-emit-the-auto-promotion-counter-event-for-an-unsupervise.behaviors.test-cases';
import { registerEmitsASystemResourceSessionEndedNotificationEventForFlowPart6Cases } from './resourceUsage.service.endsession.does-not-emit-the-auto-promotion-counter-event-for-an-unsupervise.behaviors.test-cases';
import { registerEmitsResourceusagenoteaddedeventWhenAUserNoteIsPresentPart7Cases } from './resourceUsage.service.endsession.does-not-emit-the-auto-promotion-counter-event-for-an-unsupervise.behaviors.test-cases';
import { registerEmitsTheAutoPromotionCounterEventWhenASupervisedSessionPart15Cases } from './resourceUsage.service.endsession.does-not-emit-the-auto-promotion-counter-event-for-an-unsupervise.behaviors.test-cases';
import { registerLeavesTheSessionActiveWhenFailureIsPropagatedPart2Cases } from './resourceUsage.service.endsession.leaves-the-session-active-when-failure-is-propagated.behaviors.test-cases';
import { registerLooksUpTheActiveSessionInsideTheStopTransactionPart10Cases } from './resourceUsage.service.endsession.leaves-the-session-active-when-failure-is-propagated.behaviors.test-cases';
import { registerReturnsTheNoActivityEndedSessionWithItsConfiguredEndNotPart3Cases } from './resourceUsage.service.endsession.leaves-the-session-active-when-failure-is-propagated.behaviors.test-cases';
import { registerRollsBackEndingTheSessionWhenBillingFailsPart4Cases } from './resourceUsage.service.endsession.leaves-the-session-active-when-failure-is-propagated.behaviors.test-cases';
import { registerRunsTheStoppedSessionFlowAfterReservationButBeforeUsagePart1Cases } from './resourceUsage.service.endsession.leaves-the-session-active-when-failure-is-propagated.behaviors.test-cases';
import { registerShouldEndSessionSuccessfullyCases } from './resourceUsage.service.endsession.should-end-session-successfully.behaviors.test-cases';
import { registerShouldThrowErrorWhenNoActiveSessionExistsPart9Cases } from './resourceUsage.service.endsession.should-end-session-successfully.behaviors.test-cases';
import { registerResourceUsageServiceFixture } from './resourceUsage.service.resource-usage-service.test-fixture';

export function registerShouldEndSessionSuccessfullyCases(fixture: ReturnType<typeof registerEndsessionScopeFixture>) {
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
    fixture.fixture.resourceUsageRepository.findOne
      .mockResolvedValueOnce(mockActiveSession) // 1) getActiveSession
      .mockResolvedValueOnce(mockUpdatedSession) // 2) emitUsageEvent fetch
      .mockResolvedValueOnce(mockUpdatedSession); // 3) fetch updated session to return

    const mockUpdateQueryBuilder = fixture.fixture.createMockQueryBuilder(null);
    // Ensure update(ResourceUsage) is called: our mock returns chainable builder
    (mockUpdateQueryBuilder.update as jest.Mock).mockReturnValue(mockUpdateQueryBuilder);
    fixture.fixture.resourceUsageRepository.createQueryBuilder.mockReturnValue(
      mockUpdateQueryBuilder as unknown as SelectQueryBuilder<ResourceUsage>,
    );

    const result = await fixture.fixture.service.endSession(1, fixture.mockUser, dto);

    expect(result).toBe(mockUpdatedSession);
    expect(fixture.fixture.resourceUsageRepository.manager.transaction).toHaveBeenCalled();
    expect(fixture.fixture.eventEmitter.emitAsync).toHaveBeenCalledWith(
      ResourceSessionStartedEvent.EVENT_NAME,
      expect.any(Object),
    );

    const emitted = fixture.fixture.eventEmitter.emitAsync.mock.calls.find(
      (c) => c[0] === ResourceSessionStartedEvent.EVENT_NAME,
    );
    const eventPayload = emitted?.[1] as ResourceSessionStartedEvent;
    expect(eventPayload).toBeInstanceOf(ResourceSessionStartedEvent);
    expect(eventPayload.usage).toMatchObject({ id: 1, userId: 1, endNotes: 'Session completed' });
    expect(fixture.fixture.mockAuditService.recordResource).toHaveBeenCalledWith({
      action: 'usage_session.ended',
      actorId: 1,
      authenticationMethod: 'session',
      subjectId: 1,
      details: { usageId: 1, usageUserId: 1 },
    });
  });
}

export function registerShouldThrowErrorWhenNoActiveSessionExistsPart9Cases(
  fixture: ReturnType<typeof registerEndsessionScopeFixture>,
) {
  it('should throw error when no active session exists', async () => {
    const dto: EndUsageSessionDto = { notes: 'Session completed' };

    // Mock getActiveSession to return null (no active session)
    fixture.fixture.resourceUsageRepository.findOne.mockResolvedValue(null);

    await expect(fixture.fixture.service.endSession(1, fixture.mockUser, dto)).rejects.toThrow(
      new BadRequestException('No active session found'),
    );
  });
}

export function registerEndSessionCases(fixture: ReturnType<typeof registerResourceUsageServiceFixture>) {
  describe('endSession', () => {
    const scope = registerEndsessionScopeFixture(fixture);
    registerShouldEndSessionSuccessfullyCases(scope);
    registerRunsTheStoppedSessionFlowAfterReservationButBeforeUsagePart1Cases(scope);
    registerLeavesTheSessionActiveWhenFailureIsPropagatedPart2Cases(scope);
    registerReturnsTheNoActivityEndedSessionWithItsConfiguredEndNotPart3Cases(scope);
    registerRollsBackEndingTheSessionWhenBillingFailsPart4Cases(scope);
    registerEmitsAResourceSessionEndedNotificationEventAfterEndingSoPart5Cases(scope);
    registerEmitsASystemResourceSessionEndedNotificationEventForFlowPart6Cases(scope);
    registerEmitsResourceusagenoteaddedeventWhenAUserNoteIsPresentPart7Cases(scope);
    registerDoesNotEmitTheNoteEventWhenSkipnotenotificationIsSetFloPart8Cases(scope);
    registerShouldThrowErrorWhenNoActiveSessionExistsPart9Cases(scope);
    registerLooksUpTheActiveSessionInsideTheStopTransactionPart10Cases(scope);
    registerAllowsUsersWithResourcesUpdatePermissionToEndSessionsOwnPart11Cases(scope);
    registerAllowsResourceIntroducersAndMaintainersToEndSessionsOwnedPart12Cases(scope);
    registerAllowsGroupIntroducersToEndSessionsOwnedByOthersPart13Cases(scope);
    registerAllowsTheSupervisorOfASupervisedSessionToEndItWithoutAPart14Cases(scope);
    registerEmitsTheAutoPromotionCounterEventWhenASupervisedSessionPart15Cases(scope);
    registerDoesNotEmitTheAutoPromotionCounterEventForAnUnsupervisePart16Cases(scope);
  });
}
