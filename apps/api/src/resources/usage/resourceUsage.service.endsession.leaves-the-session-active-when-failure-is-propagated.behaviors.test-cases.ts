import { ResourceFlowNodeType, ResourceUsage, User, Resource, ResourceType } from '@attraccess/database-entities';
import { SelectQueryBuilder } from 'typeorm';
import { ExternalEffectFailureError } from '../flows/errors/external-effect-failure.error';
import { FlowExecutionError } from '../flows/errors/flow-execution.error';
import { ResourceUsageSessionEndedEvent } from './events/resource-usage.events';
import { registerEndsessionScopeFixture } from './resourceUsage.service.endsession-9b9974.test-fixture';
import { EndUsageSessionDto } from './dtos/endUsageSession.dto';

export function registerLeavesTheSessionActiveWhenFailureIsPropagatedPart2Cases(
  fixture: ReturnType<typeof registerEndsessionScopeFixture>,
) {
  it.each([
    {
      failure: 'an acknowledgement timeout',
      error: new ExternalEffectFailureError(
        'MQTT acknowledgement timed out',
        new Error('MQTT acknowledgement timed out'),
        'acknowledgement-timeout',
      ),
    },
    {
      failure: 'an error node failure',
      error: new FlowExecutionError('Bitte die Tür schließen'),
    },
  ])('leaves the session active when $failure is propagated', async ({ error }) => {
    const mockActiveSession = {
      id: 1,
      resourceId: 1,
      userId: 1,
      startTime: new Date(),
      user: { id: 1 } as User,
    } as ResourceUsage;
    const mockUpdatedSession = { ...mockActiveSession, endTime: new Date(), endNotes: 'Auto-ended' };
    let usageTransactionCommitted = false;

    fixture.fixture.resourceUsageRepository.findOne
      .mockResolvedValueOnce(mockActiveSession)
      .mockResolvedValueOnce(mockUpdatedSession);
    fixture.fixture.flowExecutorService.runFlow.mockRejectedValueOnce(error);
    const mockUpdateQueryBuilder = fixture.fixture.createMockQueryBuilder(null);
    let sessionEnded = false;
    (fixture.fixture.transactionalEntityManager.createQueryBuilder as jest.Mock).mockReturnValue(
      mockUpdateQueryBuilder as unknown as SelectQueryBuilder<ResourceUsage>,
    );
    (mockUpdateQueryBuilder.execute as jest.Mock).mockImplementation(async () => {
      sessionEnded = true;
    });
    (fixture.fixture.resourceUsageRepository.manager.transaction as jest.Mock).mockImplementationOnce(
      async (callback) => {
        const result = await callback(fixture.fixture.transactionalEntityManager);
        usageTransactionCommitted = true;
        return result;
      },
    );

    await expect(fixture.fixture.service.endSession(1, mockActiveSession.user, { notes: 'Auto-ended' })).rejects.toBe(
      error,
    );

    expect(fixture.fixture.eventEmitter.emitAsync).not.toHaveBeenCalled();
    expect(fixture.fixture.eventEmitter.emit).not.toHaveBeenCalledWith(
      ResourceUsageSessionEndedEvent.EVENT_NAME,
      expect.any(Object),
    );
    expect(fixture.fixture.mockMetricsService.resourceUsageSessionsTotal.inc).not.toHaveBeenCalled();
    expect(usageTransactionCommitted).toBe(true);
    expect(sessionEnded).toBe(false);
    expect(fixture.fixture.transactionalEntityManager.update).not.toHaveBeenCalled();
    expect(fixture.fixture.billingService.chargeForResourceUsage).not.toHaveBeenCalled();
    expect(fixture.fixture.mockAuditService.recordResource).not.toHaveBeenCalled();
    expect(fixture.fixture.lifecycleAttempts.size).toBe(0);
    expect(fixture.fixture.flowExecutorService.runFlow).toHaveBeenCalledWith(
      1,
      ResourceFlowNodeType.INPUT_RESOURCE_USAGE_STOPPED,
      expect.any(Object),
      undefined,
      { lifecycleAttemptId: expect.any(String) },
    );
  });
}

export function registerLooksUpTheActiveSessionInsideTheStopTransactionPart10Cases(
  fixture: ReturnType<typeof registerEndsessionScopeFixture>,
) {
  it('looks up the active session inside the stop transaction', async () => {
    const dto: EndUsageSessionDto = { notes: 'Session completed' };
    const sessionOwner = { id: 1, username: 'owner' } as User;
    const mockActiveSession = {
      id: 5,
      resourceId: 12,
      userId: sessionOwner.id,
      startTime: new Date(),
      user: sessionOwner,
      resource: { id: 12, name: 'Laser cutter' } as Resource,
    } as ResourceUsage;
    const mockUpdatedSession = { ...mockActiveSession, endTime: new Date(), endNotes: 'Session completed' };
    let transactionStarted = false;

    (fixture.fixture.resourceUsageRepository.manager.transaction as jest.Mock).mockImplementationOnce(async (cb) => {
      transactionStarted = true;
      return cb(fixture.fixture.transactionalEntityManager);
    });
    fixture.fixture.resourceUsageRepository.findOne.mockImplementation(async () => {
      expect(transactionStarted).toBe(true);
      return fixture.fixture.resourceUsageRepository.findOne.mock.calls.length === 1
        ? mockActiveSession
        : mockUpdatedSession;
    });

    await fixture.fixture.service.endSession(mockActiveSession.resourceId, sessionOwner, dto);

    expect(fixture.fixture.flowExecutorService.runFlow).toHaveBeenCalledTimes(1);
    expect(fixture.fixture.billingService.chargeForResourceUsage).toHaveBeenCalledTimes(1);
  });
}

export function registerReturnsTheNoActivityEndedSessionWithItsConfiguredEndNotPart3Cases(
  fixture: ReturnType<typeof registerEndsessionScopeFixture>,
) {
  it('returns the no-activity-ended session with its configured end notes in usage history immediately', async () => {
    const configuredEndNotes = 'Ended automatically after 5 minutes of inactivity';
    const usage = {
      id: 42,
      resourceId: 1,
      userId: 1,
      startTime: new Date(),
      endTime: null,
      endNotes: null,
      user: { id: 1, username: 'member' } as User,
      resource: { id: 1, type: ResourceType.Machine } as Resource,
    } as ResourceUsage;
    const updateQueryBuilder = fixture.fixture.createMockQueryBuilder(null);

    fixture.fixture.resourceUsageRepository.findOne.mockImplementation(async ({ where }) => {
      if (where?.id === usage.id || (where?.resourceId === usage.resourceId && usage.endTime === null)) {
        return usage;
      }
      return null;
    });
    fixture.fixture.resourceUsageRepository.findAndCount = jest.fn().mockResolvedValue([[usage], 1]);
    (fixture.fixture.transactionalEntityManager.createQueryBuilder as jest.Mock).mockReturnValue(updateQueryBuilder);
    fixture.fixture.transactionalEntityManager.update.mockImplementation(async (entity, _id, values) => {
      if (entity === ResourceUsage) Object.assign(usage, values);
      return { affected: 1 };
    });

    // No-activity flows end a session with configured notes and skip interactive end forms.
    await fixture.fixture.service.endSession(
      usage.resourceId,
      usage.user,
      { notes: configuredEndNotes },
      { skipFormSubmissions: true, skipNoteNotification: true },
    );
    const history = await fixture.fixture.service.getResourceUsageHistory(usage.resourceId, 1, 10, usage.userId);

    expect(history.data).toEqual([expect.objectContaining({ id: usage.id, endNotes: configuredEndNotes })]);
  });
}

export function registerRollsBackEndingTheSessionWhenBillingFailsPart4Cases(
  fixture: ReturnType<typeof registerEndsessionScopeFixture>,
) {
  it('rolls back ending the session when billing fails', async () => {
    const mockActiveSession = {
      id: 1,
      resourceId: 1,
      userId: 1,
      startTime: new Date(),
      user: { id: 1 } as User,
    } as ResourceUsage;
    const mockUpdatedSession = { ...mockActiveSession, endTime: new Date(), endNotes: 'Auto-ended' };
    const billingError = new Error('Billing failed');

    fixture.fixture.resourceUsageRepository.findOne
      .mockResolvedValueOnce(mockActiveSession)
      .mockResolvedValueOnce(mockUpdatedSession);
    fixture.fixture.billingService.chargeForResourceUsage.mockRejectedValueOnce(billingError);

    await expect(
      fixture.fixture.service.endSession(1, mockActiveSession.user, { notes: 'Auto-ended' }),
    ).rejects.toThrow(billingError);

    expect(fixture.fixture.billingService.chargeForResourceUsage).toHaveBeenCalledWith(
      mockUpdatedSession,
      fixture.fixture.transactionalEntityManager,
    );
    expect(fixture.fixture.flowExecutorService.runFlow).toHaveBeenCalledTimes(1);
    expect(fixture.fixture.eventEmitter.emitAsync).not.toHaveBeenCalled();
  });
}

export function registerRunsTheStoppedSessionFlowAfterReservationButBeforeUsagePart1Cases(
  fixture: ReturnType<typeof registerEndsessionScopeFixture>,
) {
  it('runs the stopped-session flow after reservation but before usage finalization', async () => {
    const mockActiveSession = {
      id: 1,
      resourceId: 1,
      userId: 1,
      startTime: new Date(),
      user: { id: 1 } as User,
    } as ResourceUsage;
    const mockUpdatedSession = { ...mockActiveSession, endTime: new Date(), endNotes: 'Auto-ended' };
    const calls: string[] = [];
    let usageTransactionCommitted = false;

    fixture.fixture.resourceUsageRepository.findOne
      .mockResolvedValueOnce(mockActiveSession)
      .mockResolvedValueOnce(mockUpdatedSession)
      .mockResolvedValueOnce(mockUpdatedSession);

    const mockUpdateQueryBuilder = fixture.fixture.createMockQueryBuilder(null);
    (fixture.fixture.transactionalEntityManager.createQueryBuilder as jest.Mock).mockReturnValue(
      mockUpdateQueryBuilder as unknown as SelectQueryBuilder<ResourceUsage>,
    );
    fixture.fixture.transactionalEntityManager.update.mockImplementation(async (entity, _id, values) => {
      if (entity === ResourceUsage && values.endTime) calls.push('update');
      return { affected: 1 };
    });
    fixture.fixture.flowExecutorService.runFlow.mockImplementation(async () => {
      expect(usageTransactionCommitted).toBe(true);
      calls.push('flow');
      return [];
    });
    (fixture.fixture.resourceUsageRepository.manager.transaction as jest.Mock).mockImplementationOnce(
      async (callback) => {
        const result = await callback(fixture.fixture.transactionalEntityManager);
        usageTransactionCommitted = true;
        return result;
      },
    );

    await fixture.fixture.service.endSession(1, mockActiveSession.user, { notes: 'Auto-ended' });

    expect(calls).toEqual(['flow', 'update']);
    expect(fixture.fixture.flowExecutorService.runFlow).toHaveBeenCalledWith(
      1,
      ResourceFlowNodeType.INPUT_RESOURCE_USAGE_STOPPED,
      expect.objectContaining({ endNotes: 'Auto-ended' }),
      undefined,
      { lifecycleAttemptId: expect.any(String) },
    );
  });
}
