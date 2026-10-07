import { registerUsageLifecyclePersistenceAroundExternalFlowsFixture } from './resource-usage-lifecycle.persistence.usage-lifecycle-persistence-around-external-flows.test-fixture';
import {
  ResourceFormAction,
  ResourceUsage,
  ResourceUsageLifecycleAttempt,
  ResourceUsageAction,
  BillingTransaction,
} from '@attraccess/database-entities';

export function registerAbortsAFailedStartWithoutPublishingItsCandidateFormsOrBillAndKeepsAcceptCases(
  fixture: ReturnType<typeof registerUsageLifecyclePersistenceAroundExternalFlowsFixture>,
) {
  it('aborts a failed start without publishing its candidate, forms, or bill and keeps accepted operation', async () => {
    const before = await fixture.publishedState();
    fixture.failAfterObservation();

    await expect(fixture.usage.startSession(1, fixture.users[0], { notes: 'Pending start' })).rejects.toThrow(
      'Downstream external command failed',
    );

    expect(await fixture.publishedState()).toEqual(before);
    await fixture.expectObservationAndNoAttempt();
  });
}

export function registerAbortsAnAbandonedTakeoverAtStartupWithoutReplayingFlowsOrDiscardingAccepteCases(
  fixture: ReturnType<typeof registerUsageLifecyclePersistenceAroundExternalFlowsFixture>,
) {
  it('aborts an abandoned takeover at startup without replaying flows or discarding accepted operation', async () => {
    const previous = await fixture.seedActiveSession();
    const before = await fixture.publishedState();
    const candidate = await fixture.source.getRepository(ResourceUsage).save({
      resourceId: 1,
      userId: 2,
      startTime: new Date(),
      endTime: null,
      lifecyclePending: true,
      isFinalized: false,
    });
    await fixture.source.getRepository(ResourceUsageLifecycleAttempt).save({
      id: 'abandoned-attempt',
      resourceId: 1,
      kind: 'takeover',
      previousUsageId: previous.id,
      candidateUsageId: candidate.id,
      transitionTime: candidate.startTime,
      formSubmissions: [
        { formId: 11, resourceUsageId: candidate.id, userId: 2, action: ResourceFormAction.TAKEOVER, data: {} },
      ],
      billingItems: [{ ...fixture.draftItem, usageId: previous.id }],
    });
    await fixture.operating.transition(1, 'operating', { flowNodeId: 'observed-operation', flowRunId: 'failed-flow' });

    await fixture.usage.onModuleInit();

    expect(await fixture.publishedState()).toEqual(before);
    expect(fixture.flow.runFlow).not.toHaveBeenCalled();
    await fixture.expectObservationAndNoAttempt();
  });
}

export function registerClaimsACandidateBeforeStoppedFlowEffectsSoConcurrentEndsRunThemOnceCases(
  fixture: ReturnType<typeof registerUsageLifecyclePersistenceAroundExternalFlowsFixture>,
) {
  it('claims a candidate before stopped-flow effects so concurrent ends run them once', async () => {
    const candidate = await fixture.source.getRepository(ResourceUsage).save({
      resourceId: 1,
      userId: 1,
      usageAction: ResourceUsageAction.Usage,
      startTime: new Date(),
      endTime: null,
      lifecyclePending: true,
      isFinalized: false,
    });
    await fixture.source.getRepository(ResourceUsageLifecycleAttempt).save({
      id: 'candidate-cancellation',
      resourceId: 1,
      kind: 'start',
      previousUsageId: null,
      candidateUsageId: candidate.id,
      transitionTime: candidate.startTime,
      formSubmissions: [],
      billingItems: [],
    });
    let releaseFlow!: () => void;
    const flowSettled = new Promise<void>((resolve) => {
      releaseFlow = resolve;
    });
    let stoppedFlowStarted!: () => void;
    const stoppedFlowStartedPromise = new Promise<void>((resolve) => {
      stoppedFlowStarted = resolve;
    });
    fixture.flow.runFlow.mockImplementation(async () => {
      stoppedFlowStarted();
      await flowSettled;
    });

    const firstEnd = fixture.usage.endLifecycleCandidate('candidate-cancellation', 1, 'Stopped');
    await stoppedFlowStartedPromise;
    const secondEnd = fixture.usage.endLifecycleCandidate('candidate-cancellation', 1, 'Stopped');

    await expect(secondEnd).rejects.toThrow('The usage lifecycle attempt has no candidate session');
    expect(fixture.flow.runFlow).toHaveBeenCalledTimes(1);
    expect(await fixture.source.getRepository(ResourceUsage).findOneBy({ id: candidate.id })).toBeNull();
    await expect(
      fixture.source.getRepository(ResourceUsageLifecycleAttempt).findOneByOrFail({ id: 'candidate-cancellation' }),
    ).resolves.toMatchObject({ candidateUsageId: null });

    releaseFlow();
    await expect(firstEnd).resolves.toBeUndefined();
  });
}

export function registerDoesNotPublishAPendingStartAfterItsFlowHasTriggeredMaintenanceCases(
  fixture: ReturnType<typeof registerUsageLifecyclePersistenceAroundExternalFlowsFixture>,
) {
  it('does not publish a pending start after its flow has triggered maintenance', async () => {
    fixture.maintenance.hasActiveMaintenance.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    fixture.flow.runFlow.mockImplementation(async (resourceId) => {
      await fixture.operating.transition(resourceId, 'operating', {
        flowNodeId: 'observed-operation',
        flowRunId: 'maintenance-triggered',
      });
    });

    await expect(fixture.usage.startSession(1, fixture.users[0], { notes: 'Pending start' })).rejects.toThrow(
      'ResourceMaintenanceInUseException',
    );

    expect(await fixture.source.getRepository(ResourceUsage).count()).toBe(0);
    expect(await fixture.source.getRepository(ResourceUsageLifecycleAttempt).count()).toBe(0);
    expect(fixture.billing.handleResourceUsageStart).not.toHaveBeenCalled();
    expect(fixture.flow.trackResourceActivity).not.toHaveBeenCalled();
  });
}

export function registerDoesNotPublishATentativeStartWhenItsFlowEndsTheSessionCases(
  fixture: ReturnType<typeof registerUsageLifecyclePersistenceAroundExternalFlowsFixture>,
) {
  it('does not publish a tentative start when its flow ends the session', async () => {
    fixture.flow.runFlow.mockImplementation(
      async (_resourceId, _trigger, _payload, _manager, { lifecycleAttemptId }) => {
        await fixture.usage.cancelLifecycleCandidate(lifecycleAttemptId, 1);
      },
    );

    await expect(fixture.usage.startSession(1, fixture.users[0], { notes: 'Ended by flow' })).rejects.toThrow(
      'The tentative usage session was cancelled',
    );

    expect(await fixture.source.getRepository(ResourceUsage).count()).toBe(0);
    expect(await fixture.source.getRepository(ResourceUsageLifecycleAttempt).count()).toBe(0);
    expect(fixture.billing.handleResourceUsageStart).not.toHaveBeenCalled();
    expect(fixture.flow.trackResourceActivity).not.toHaveBeenCalled();
  });
}

export function registerDoesNotStartOrRunPhysicalFlowsIfItsPriceSnapshotCannotBePersistedCases(
  fixture: ReturnType<typeof registerUsageLifecyclePersistenceAroundExternalFlowsFixture>,
) {
  it('does not start or run physical flows if its price snapshot cannot be persisted', async () => {
    await fixture.source.query(`CREATE TRIGGER reject_price_snapshot BEFORE UPDATE OF billingFactor ON resource_usage
      BEGIN SELECT RAISE(ABORT, 'snapshot unavailable'); END`);

    await expect(fixture.usage.startSession(1, fixture.users[0], {})).rejects.toThrow('snapshot unavailable');

    expect(await fixture.source.getRepository(ResourceUsage).count()).toBe(0);
    expect(await fixture.source.getRepository(BillingTransaction).count()).toBe(0);
    expect(await fixture.source.getRepository(ResourceUsageLifecycleAttempt).count()).toBe(0);
    expect(fixture.flow.runFlow).not.toHaveBeenCalled();
  });
}

export function registerKeepsACanceledCandidateReservationUntilItsFlowSettlesCases(
  fixture: ReturnType<typeof registerUsageLifecyclePersistenceAroundExternalFlowsFixture>,
) {
  it('keeps a canceled candidate reservation until its flow settles', async () => {
    let releaseFlow!: () => void;
    const flowSettled = new Promise<void>((resolve) => {
      releaseFlow = resolve;
    });
    let candidateCancelled!: () => void;
    const cancellationComplete = new Promise<void>((resolve) => {
      candidateCancelled = resolve;
    });
    fixture.flow.runFlow.mockImplementation(
      async (_resourceId, _trigger, _payload, _manager, { lifecycleAttemptId }) => {
        await fixture.usage.cancelLifecycleCandidate(lifecycleAttemptId, 1);
        candidateCancelled();
        await flowSettled;
      },
    );

    const firstStart = fixture.usage.startSession(1, fixture.users[0], { notes: 'Ended by flow' });
    await cancellationComplete;

    await expect(fixture.usage.startSession(1, fixture.users[1], { notes: 'Competing start' })).rejects.toThrow(
      'A usage lifecycle operation is already in progress',
    );

    releaseFlow();
    await expect(firstStart).rejects.toThrow('The tentative usage session was cancelled');
    expect(await fixture.source.getRepository(ResourceUsageLifecycleAttempt).count()).toBe(0);
  });
}

export function registerKeepsTheExistingSessionAndChargeUnchangedAfterAFailedStopWhilePreservingCases(
  fixture: ReturnType<typeof registerUsageLifecyclePersistenceAroundExternalFlowsFixture>,
) {
  it('keeps the existing session and charge unchanged after a failed stop while preserving operation', async () => {
    await fixture.seedActiveSession();
    const before = await fixture.publishedState();
    fixture.failAfterObservation();

    await expect(fixture.usage.endSession(1, fixture.users[0], { notes: 'Pending stop' })).rejects.toThrow(
      'Downstream external command failed',
    );

    expect(await fixture.publishedState()).toEqual(before);
    await fixture.expectObservationAndNoAttempt();
  });
}

export function registerKeepsTheOutgoingSessionIntactAndRemovesTheCandidateAfterAFailedTakeoverCases(
  fixture: ReturnType<typeof registerUsageLifecyclePersistenceAroundExternalFlowsFixture>,
) {
  it('keeps the outgoing session intact and removes the candidate after a failed takeover', async () => {
    await fixture.seedActiveSession();
    const before = await fixture.publishedState();
    fixture.failAfterObservation();

    await expect(fixture.usage.startSession(1, fixture.users[1], { forceTakeOver: true })).rejects.toThrow(
      'Downstream external command failed',
    );

    expect(await fixture.publishedState()).toEqual(before);
    await fixture.expectObservationAndNoAttempt();
  });
}
