import {
  BillingTransaction,
  FormSubmission,
  Resource,
  ResourceOperatingInterval,
  ResourceUsage,
  ResourceUsageLifecycleAttempt,
  User,
} from '@attraccess/database-entities';
import { BillingTransactionStatus, ResourceFormAction, ResourceUsageAction } from '@attraccess/application-models';
import { InsufficientBalanceError } from '../../../billing/errors/insufficient-balance.error';
import { recoverOrphanedUsages } from '../../../database/postgres/postgres-usage-recovery';
import { ResourceInUseError } from '../errors/resource-in-use.error';
import {
  closeLifecycleFixture,
  resetTestFixture,
} from '../../../database/adapters/usage/lifecycle-fixtures/setup.test-fixture';
import { unitOfWorkFor } from '../../../database/adapters/shared-unit-of-work';
import { createUsageLifecyclePersistenceAroundExternalFlowsFixture } from '../../../database/adapters/usage/lifecycle-fixtures/state.test-fixture';

// Real repositories and relations for the lifecycle boundary; peripheral domain tables are omitted.
describe('Usage lifecycle persistence around external flows', () => {
  const scope = createUsageLifecyclePersistenceAroundExternalFlowsFixture();

  beforeEach(async () => {
    await resetTestFixture(scope);
  });

  afterEach(async () => {
    await closeLifecycleFixture(scope);
    jest.restoreAllMocks();
  });

  it.each([false, true])(
    'recovers a legacy orphan on restart without losing forms or changing billing (bill=%s)',
    async (hasBill) => {
      await scope.source.getRepository(Resource).update(1, { allowTakeOver: false });
      const orphan = await scope.seedLegacyOrphan({
        startTime: new Date('2026-09-23T14:00:40Z'),
        startNotes: 'DEMO: ongoing laboratory run',
        endNotes: 'Original note',
        attributedOperatingDurationInMinutes: 17,
      });
      await scope.source.getRepository(FormSubmission).save({
        formId: 11,
        resourceUsageId: orphan.id,
        userId: 1,
        action: ResourceFormAction.START,
        data: { answer: 'kept' },
      });
      if (hasBill)
        await scope.source.getRepository(BillingTransaction).save({
          resourceUsageId: orphan.id,
          userId: 1,
          amount: 7,
          status: BillingTransactionStatus.Completed,
        });
      const before = await scope.publishedState();
      const emitted = jest.spyOn(scope.events, 'emit');
      expect((await scope.usage.getResourceUsageHistory(1)).data.map((row) => row.id)).toEqual([orphan.id]);
      expect(await scope.usage.getActiveSession(1)).toBeNull();
      expect((await scope.usage.getActiveSessions([1])).get(1)).toEqual([]);
      await expect(scope.usage.endSession(1, scope.users[0], {})).rejects.toThrow('No active session found');

      await scope.usage.onModuleInit();
      const after = await scope.publishedState();
      expect(after.sessions).toEqual([
        expect.objectContaining({
          id: orphan.id,
          startTime: orphan.startTime,
          endTime: orphan.startTime,
          startNotes: orphan.startNotes,
          isFinalized: false,
          lifecyclePending: false,
          usageInMinutes: 0,
          attributedOperatingDurationInMinutes: 0,
          endNotes: expect.stringContaining('Original note\n[Recovery: cancelled orphan'),
        }),
      ]);
      expect(after.submissions).toEqual(before.submissions);
      expect(after.transactions).toEqual(before.transactions);
      expect(after.users).toEqual(before.users);
      const journal = await scope.source.query('SELECT * FROM resource_usage_recovery');
      expect(journal).toEqual([
        expect.objectContaining({
          usageId: orphan.id,
          resourceId: 1,
          userId: 1,
          originalEndNotes: 'Original note',
          originalAttributedOperatingDurationInMinutes: 17,
          reason: 'cancelled_orphan_unfinalized_session',
        }),
      ]);
      await scope.usage.recoverInterruptedLifecycles();
      expect(await scope.publishedState()).toEqual(after);
      expect(await scope.source.query('SELECT * FROM resource_usage_recovery')).toEqual(journal);
      expect(emitted).not.toHaveBeenCalled();
      expect(scope.flow.runFlow).not.toHaveBeenCalled();
      expect(scope.billing.chargeForResourceUsage).not.toHaveBeenCalled();
      expect(scope.billing.handleResourceUsageStart).not.toHaveBeenCalled();
      expect(scope.billing.notifyResourceUsageCharge).not.toHaveBeenCalled();
      expect((await scope.usage.getResourceUsageHistory(1)).data[0].formSubmissions).toHaveLength(1);
      const started = await scope.usage.startSession(1, scope.users[1], {});
      expect((await scope.usage.getActiveSession(1))?.id).toBe(started.id);
      expect((await scope.usage.getActiveSessions([1])).get(1)?.at(-1)?.id).toBe(started.id);
    },
  );

  it('reconciles legacy orphans on startup and then enforces open-state and occupancy constraints', async () => {
    const orphan = await scope.seedLegacyOrphan();
    await scope.usage.recoverInterruptedLifecycles();
    expect(await scope.source.getRepository(ResourceUsage).findOneByOrFail({ id: orphan.id })).toMatchObject({
      endTime: orphan.startTime,
      isFinalized: false,
      usageInMinutes: 0,
    });
    await expect(
      scope.source.getRepository(ResourceUsage).save({
        resourceId: 1,
        userId: 1,
        usageAction: ResourceUsageAction.Usage,
        startTime: new Date(),
      }),
    ).rejects.toThrow('Open usage must be finalized or lifecycle-pending');
    await expect(scope.source.getRepository(ResourceUsage).update(orphan.id, { endTime: null })).rejects.toThrow(
      'Open usage must be finalized or lifecycle-pending',
    );
    const active = await scope.seedActiveSession();
    await expect(scope.seedActiveSession()).rejects.toThrow(
      'User already has an active usage session on this resource',
    );
    // The database guards one session per person; capacity per machine is enforced by the lifecycle.
    const candidate = await scope.source.getRepository(ResourceUsage).save({
      resourceId: 1,
      userId: 1,
      usageAction: ResourceUsageAction.Usage,
      startTime: new Date(),
      lifecyclePending: true,
      isFinalized: false,
    });
    await expect(
      scope.source.getRepository(ResourceUsage).update(candidate.id, {
        isFinalized: true,
        lifecyclePending: false,
      }),
    ).rejects.toThrow('User already has an active usage session on this resource');
    await expect(
      scope.source.getRepository(ResourceUsage).save({
        resourceId: 1,
        userId: 1,
        usageAction: ResourceUsageAction.Usage,
        startTime: new Date(),
        lifecyclePending: true,
      }),
    ).rejects.toThrow('duplicate key value violates unique constraint');
    await expect(scope.usage.startSession(1, scope.users[1], {})).rejects.toThrow(
      'A usage lifecycle operation is already in progress',
    );
    await expect(scope.usage.endSession(1, scope.users[0], {})).rejects.toThrow(
      'A usage lifecycle operation is already in progress',
    );
    expect((await scope.usage.getActiveSession(1))?.id).toBe(active.id);
    expect((await scope.usage.getActiveSessions([1])).get(1)?.at(-1)?.id).toBe(active.id);
    await scope.source.getRepository(ResourceUsage).delete(candidate.id);
    await scope.usage.recoverInterruptedLifecycles();
    await expect(scope.usage.startSession(1, scope.users[1], {})).rejects.toBeInstanceOf(ResourceInUseError);
    expect(scope.flow.runFlow).not.toHaveBeenCalled();
  });

  it('retains duplicate legacy real sessions and resolves them consistently without cancelling or charging them', async () => {
    const first = await scope.seedActiveSession();
    // The one-session-per-person guard refuses a duplicate now; legacy data from before it still exists.
    const second = await scope.withoutIntegrityTriggers(() => scope.seedActiveSession());
    const before = await scope.publishedState();
    await scope.usage.recoverInterruptedLifecycles();
    expect(await scope.publishedState()).toEqual(before);
    expect((await scope.usage.getActiveSession(1))?.id).toBe(second.id);
    expect((await scope.usage.getActiveSessions([1])).get(1)?.at(-1)?.id).toBe(second.id);
    await expect(scope.seedActiveSession()).rejects.toThrow(
      'User already has an active usage session on this resource',
    );
    await scope.usage.endSession(1, scope.users[0], {});
    expect((await scope.usage.getActiveSession(1))?.id).toBe(first.id);
    expect((await scope.usage.getActiveSessions([1])).get(1)?.at(-1)?.id).toBe(first.id);
    expect(await scope.source.query('SELECT * FROM resource_usage_recovery')).toEqual([]);
  });

  it('keeps valid in-flight start reservations protected and never quarantines them', async () => {
    let enteredFlow!: () => void;
    const entered = new Promise<void>((resolve) => {
      enteredFlow = resolve;
    });
    let releaseFlow!: () => void;
    const released = new Promise<void>((resolve) => {
      releaseFlow = resolve;
    });
    scope.flow.runFlow.mockImplementation(async () => {
      enteredFlow();
      await released;
    });
    const start = scope.usage.startSession(1, scope.users[0], {});
    await entered;
    try {
      expect(await scope.usage.getActiveSession(1)).toBeNull();
      expect((await scope.usage.getActiveSessions([1])).get(1)).toEqual([]);
      expect((await scope.usage.getResourceUsageHistory(1)).total).toBe(0);
      await expect(scope.usage.startSession(1, scope.users[1], { forceTakeOver: true })).rejects.toThrow(
        'A usage lifecycle operation is already in progress',
      );
      await expect(scope.usage.endSession(1, scope.users[0], {})).rejects.toThrow(
        'A usage lifecycle operation is already in progress',
      );
      expect(await scope.source.transaction((manager) => recoverOrphanedUsages(manager))).toBe(0);
      expect(await scope.source.getRepository(ResourceUsage).countBy({ lifecyclePending: true })).toBe(1);
      expect(await scope.source.getRepository(ResourceUsageLifecycleAttempt).count()).toBe(1);
    } finally {
      releaseFlow();
    }
    const session = await start;
    expect((await scope.usage.getActiveSession(1))?.id).toBe(session.id);
    expect(scope.flow.runFlow).toHaveBeenCalledTimes(1);
    expect(scope.billing.handleResourceUsageStart).toHaveBeenCalledTimes(1);
    expect(await scope.source.query('SELECT * FROM resource_usage_recovery')).toEqual([]);
  });

  it('never repairs history without its audit journal', async () => {
    const orphan = await scope.seedLegacyOrphan();
    const removeTrigger = await scope.installTrigger({
      name: 'reject_recovery_audit',
      table: 'resource_usage_recovery',
      event: 'INSERT',
      body: "RAISE EXCEPTION 'journal unavailable';",
    });
    await expect(scope.usage.recoverInterruptedLifecycles()).rejects.toThrow('journal unavailable');
    expect(await scope.source.getRepository(ResourceUsage).findOneByOrFail({ id: orphan.id })).toEqual(orphan);
    expect(await scope.source.query('SELECT * FROM resource_usage_recovery')).toEqual([]);
    await removeTrigger();

    await scope.usage.recoverInterruptedLifecycles();

    const journal = await scope.source.query('SELECT * FROM resource_usage_recovery');
    expect(journal).toEqual([expect.objectContaining({ usageId: orphan.id })]);
    expect(await scope.source.getRepository(ResourceUsage).findOneByOrFail({ id: orphan.id })).toMatchObject({
      endTime: orphan.startTime,
      isFinalized: false,
    });
  });

  it('rolls back a written recovery journal when the usage update fails', async () => {
    const orphan = await scope.seedLegacyOrphan({
      startTime: new Date('2026-09-23T14:00:40Z'),
      startNotes: 'DEMO: ongoing laboratory run',
      endNotes: 'Original note',
      attributedOperatingDurationInMinutes: 17,
    });
    const before = await scope.publishedState();
    const journalBefore = await scope.source.query('SELECT * FROM resource_usage_recovery');
    // This failure proves the journal INSERT succeeded within the recovery transaction.
    const removeTrigger = await scope.installTrigger({
      name: 'reject_recovery_update',
      table: 'resource_usage',
      event: 'UPDATE',
      when: `OLD."id" = ${orphan.id}`,
      body: `IF EXISTS (SELECT 1 FROM resource_usage_recovery WHERE "usageId" = OLD."id") THEN
          RAISE EXCEPTION 'usage update rejected after journal insert';
        END IF;
        RAISE EXCEPTION 'recovery journal missing before update';`,
    });

    await expect(scope.usage.recoverInterruptedLifecycles()).rejects.toThrow(
      'usage update rejected after journal insert',
    );
    expect(await scope.publishedState()).toEqual(before);
    expect(await scope.source.query('SELECT * FROM resource_usage_recovery')).toEqual(journalBefore);

    await removeTrigger();
    await scope.usage.recoverInterruptedLifecycles();
    expect(await scope.source.getRepository(ResourceUsage).findOneByOrFail({ id: orphan.id })).toMatchObject({
      endTime: orphan.startTime,
      isFinalized: false,
      attributedOperatingDurationInMinutes: 0,
    });
    expect(await scope.source.query('SELECT "usageId" FROM resource_usage_recovery')).toEqual([{ usageId: orphan.id }]);
  });

  it.each([false, true])(
    'preserves the complete price contract through a start flow (takeover=%s)',
    async (takeover) => {
      if (takeover) await scope.seedActiveSession();
      const starter = scope.users[1];
      await scope.source.getRepository(User).update(starter.id, { billingFactor: 50 });
      starter.billingFactor = 75; // Request authentication may predate a billing-factor edit.
      scope.flow.runFlow.mockImplementation(async () => {
        await scope.source.getRepository(User).update(starter.id, { billingFactor: 150 });
        scope.billing.getResourceBillingConfiguration.mockResolvedValue({
          creditsPerUsage: 99,
          creditsPerMinute: 99,
          creditsPerOperatingMinute: 99,
        });
      });

      const session = await scope.usage.startSession(1, starter, { forceTakeOver: takeover });

      expect(session).toMatchObject({
        lifecyclePending: false,
        creditsPerUsage: 5,
        billingFactor: 50,
        sessionDurationCreditsPerMinute: 2,
        operatingDurationCreditsPerMinute: 3,
      });
      expect(
        await scope.source.getRepository(BillingTransaction).findOneBy({ resourceUsageId: session.id }),
      ).toMatchObject({
        status: BillingTransactionStatus.Pending,
        amount: 0,
      });
      expect(await scope.source.getRepository(ResourceUsageLifecycleAttempt).count()).toBe(0);
    },
  );

  it('does not start or run physical flows if its price snapshot cannot be persisted', async () => {
    await scope.installTrigger({
      name: 'reject_price_snapshot',
      table: 'resource_usage',
      event: 'UPDATE OF "billingFactor"',
      body: "RAISE EXCEPTION 'snapshot unavailable';",
    });

    await expect(scope.usage.startSession(1, scope.users[0], {})).rejects.toThrow('snapshot unavailable');

    expect(await scope.source.getRepository(ResourceUsage).count()).toBe(0);
    expect(await scope.source.getRepository(BillingTransaction).count()).toBe(0);
    expect(await scope.source.getRepository(ResourceUsageLifecycleAttempt).count()).toBe(0);
    expect(scope.flow.runFlow).not.toHaveBeenCalled();
  });

  it('publishes neither the session nor its bill if pending transaction creation fails', async () => {
    scope.billing.handleResourceUsageStart.mockImplementation(async (_resourceId, session, user, tx) => {
      await unitOfWorkFor(scope.source).handleOf(tx).save(BillingTransaction, {
        resourceUsageId: session.id,
        userId: user.id,
        amount: 0,
        status: BillingTransactionStatus.Pending,
      });
      throw new Error('pending transaction unavailable');
    });

    await expect(scope.usage.startSession(1, scope.users[0], {})).rejects.toThrow('pending transaction unavailable');

    expect(await scope.source.getRepository(ResourceUsage).count()).toBe(0);
    expect(await scope.source.getRepository(BillingTransaction).count()).toBe(0);
    expect(await scope.source.getRepository(ResourceUsageLifecycleAttempt).count()).toBe(0);
    expect(scope.flow.trackResourceActivity).not.toHaveBeenCalled();
  });

  it('aborts a failed start without publishing its candidate, forms, or bill and keeps accepted operation', async () => {
    const before = await scope.publishedState();
    scope.failAfterObservation();

    await expect(scope.usage.startSession(1, scope.users[0], { notes: 'Pending start' })).rejects.toThrow(
      'Downstream external command failed',
    );

    expect(await scope.publishedState()).toEqual(before);
    await scope.expectObservationAndNoAttempt();
  });

  it('keeps the existing session and charge unchanged after a failed stop while preserving operation', async () => {
    await scope.seedActiveSession();
    const before = await scope.publishedState();
    scope.failAfterObservation();

    await expect(scope.usage.endSession(1, scope.users[0], { notes: 'Pending stop' })).rejects.toThrow(
      'Downstream external command failed',
    );

    expect(await scope.publishedState()).toEqual(before);
    await scope.expectObservationAndNoAttempt();
  });

  it('keeps the outgoing session intact and removes the candidate after a failed takeover', async () => {
    await scope.seedActiveSession();
    const before = await scope.publishedState();
    scope.failAfterObservation();

    await expect(scope.usage.startSession(1, scope.users[1], { forceTakeOver: true })).rejects.toThrow(
      'Downstream external command failed',
    );

    expect(await scope.publishedState()).toEqual(before);
    await scope.expectObservationAndNoAttempt();
  });

  it('rejects same-user takeover when the outgoing charge leaves too little balance for replacement', async () => {
    await scope.seedActiveSession();
    await scope.source.getRepository(User).update(scope.users[0].id, { creditBalance: 23 });
    const before = await scope.publishedState();
    const checkedBalances: number[] = [];
    scope.billing.validateResourceUsageStart.mockImplementation(async (_resourceId, session, user, tx) => {
      const storedUser = await unitOfWorkFor(scope.source).handleOf(tx).findOneByOrFail(User, { id: user.id });
      checkedBalances.push(storedUser.creditBalance);
      if (storedUser.creditBalance < session.sessionDurationCreditsPerMinute) throw new InsufficientBalanceError();
    });
    scope.billing.handleResourceUsageStart.mockImplementation(async (resourceId, session, user, tx) => {
      await scope.billing.validateResourceUsageStart(resourceId, session, user, tx);
      return unitOfWorkFor(scope.source).handleOf(tx).save(BillingTransaction, {
        resourceUsageId: session.id,
        userId: user.id,
        amount: 0,
        status: BillingTransactionStatus.Pending,
      });
    });
    scope.flow.runFlow.mockImplementation(async (resourceId, _trigger, payload, _manager, { lifecycleAttemptId }) => {
      await scope.operating.transition(resourceId, 'operating', {
        flowNodeId: 'observed-operation',
        flowRunId: 'same-user-takeover',
      });
      await scope.usage.stageLifecycleBillingItem(lifecycleAttemptId, resourceId, payload.id, scope.draftItem);
    });

    await expect(scope.usage.startSession(1, scope.users[0], { forceTakeOver: true })).rejects.toBeInstanceOf(
      InsufficientBalanceError,
    );

    expect(checkedBalances).toEqual([23, 0]);
    expect(await scope.publishedState()).toEqual(before);
    expect(await scope.source.getRepository(ResourceUsageLifecycleAttempt).count()).toBe(0);
    expect(await scope.source.getRepository(ResourceOperatingInterval).count()).toBe(1);
    expect(scope.billing.notifyResourceUsageCharge).not.toHaveBeenCalled();
    expect(scope.flow.trackResourceActivity).not.toHaveBeenCalled();
  });

  it('does not publish a pending start after its flow has triggered maintenance', async () => {
    scope.maintenance.hasActiveMaintenance.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    scope.flow.runFlow.mockImplementation(async (resourceId) => {
      await scope.operating.transition(resourceId, 'operating', {
        flowNodeId: 'observed-operation',
        flowRunId: 'maintenance-triggered',
      });
    });

    await expect(scope.usage.startSession(1, scope.users[0], { notes: 'Pending start' })).rejects.toThrow(
      'ResourceMaintenanceInUseException',
    );

    expect(await scope.source.getRepository(ResourceUsage).count()).toBe(0);
    expect(await scope.source.getRepository(ResourceUsageLifecycleAttempt).count()).toBe(0);
    expect(scope.billing.handleResourceUsageStart).not.toHaveBeenCalled();
    expect(scope.flow.trackResourceActivity).not.toHaveBeenCalled();
  });

  it('does not publish a tentative start when its flow ends the session', async () => {
    scope.flow.runFlow.mockImplementation(async (_resourceId, _trigger, _payload, _manager, { lifecycleAttemptId }) => {
      await scope.usage.cancelLifecycleCandidate(lifecycleAttemptId, 1);
    });

    await expect(scope.usage.startSession(1, scope.users[0], { notes: 'Ended by flow' })).rejects.toThrow(
      'The tentative usage session was cancelled',
    );

    expect(await scope.source.getRepository(ResourceUsage).count()).toBe(0);
    expect(await scope.source.getRepository(ResourceUsageLifecycleAttempt).count()).toBe(0);
    expect(scope.billing.handleResourceUsageStart).not.toHaveBeenCalled();
    expect(scope.flow.trackResourceActivity).not.toHaveBeenCalled();
  });

  it('keeps a canceled candidate reservation until its flow settles', async () => {
    let releaseFlow!: () => void;
    const flowSettled = new Promise<void>((resolve) => {
      releaseFlow = resolve;
    });
    let candidateCancelled!: () => void;
    const cancellationComplete = new Promise<void>((resolve) => {
      candidateCancelled = resolve;
    });
    scope.flow.runFlow.mockImplementation(async (_resourceId, _trigger, _payload, _manager, { lifecycleAttemptId }) => {
      await scope.usage.cancelLifecycleCandidate(lifecycleAttemptId, 1);
      candidateCancelled();
      await flowSettled;
    });

    const firstStart = scope.usage.startSession(1, scope.users[0], { notes: 'Ended by flow' });
    await cancellationComplete;

    await expect(scope.usage.startSession(1, scope.users[1], { notes: 'Competing start' })).rejects.toThrow(
      'A usage lifecycle operation is already in progress',
    );

    releaseFlow();
    await expect(firstStart).rejects.toThrow('The tentative usage session was cancelled');
    expect(await scope.source.getRepository(ResourceUsageLifecycleAttempt).count()).toBe(0);
  });

  it('claims a candidate before stopped-flow effects so concurrent ends run them once', async () => {
    const candidate = await scope.source.getRepository(ResourceUsage).save({
      resourceId: 1,
      userId: 1,
      usageAction: ResourceUsageAction.Usage,
      startTime: new Date(),
      endTime: null,
      lifecyclePending: true,
      isFinalized: false,
    });
    await scope.source.getRepository(ResourceUsageLifecycleAttempt).save({
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
    scope.flow.runFlow.mockImplementation(async () => {
      stoppedFlowStarted();
      await flowSettled;
    });

    const firstEnd = scope.usage.endLifecycleCandidate('candidate-cancellation', 1, 'Stopped');
    await stoppedFlowStartedPromise;
    const secondEnd = scope.usage.endLifecycleCandidate('candidate-cancellation', 1, 'Stopped');

    await expect(secondEnd).rejects.toThrow('The usage lifecycle attempt has no candidate session');
    expect(scope.flow.runFlow).toHaveBeenCalledTimes(1);
    expect(await scope.source.getRepository(ResourceUsage).findOneBy({ id: candidate.id })).toBeNull();
    await expect(
      scope.source.getRepository(ResourceUsageLifecycleAttempt).findOneByOrFail({ id: 'candidate-cancellation' }),
    ).resolves.toMatchObject({ candidateUsageId: null });

    releaseFlow();
    await expect(firstEnd).resolves.toBeUndefined();
  });

  it('aborts an abandoned takeover at startup without replaying flows or discarding accepted operation', async () => {
    const previous = await scope.seedActiveSession();
    const before = await scope.publishedState();
    const candidate = await scope.source.getRepository(ResourceUsage).save({
      resourceId: 1,
      userId: 2,
      usageAction: ResourceUsageAction.Usage,
      startTime: new Date(),
      endTime: null,
      lifecyclePending: true,
      isFinalized: false,
    });
    await scope.source.getRepository(ResourceUsageLifecycleAttempt).save({
      id: 'abandoned-attempt',
      resourceId: 1,
      kind: 'takeover',
      previousUsageId: previous.id,
      candidateUsageId: candidate.id,
      transitionTime: candidate.startTime,
      formSubmissions: [
        { formId: 11, resourceUsageId: candidate.id, userId: 2, action: ResourceFormAction.TAKEOVER, data: {} },
      ],
      billingItems: [{ ...scope.draftItem, usageId: previous.id }],
    });
    await scope.operating.transition(1, 'operating', { flowNodeId: 'observed-operation', flowRunId: 'failed-flow' });

    await scope.usage.onModuleInit();

    expect(await scope.publishedState()).toEqual(before);
    expect(scope.flow.runFlow).not.toHaveBeenCalled();
    await scope.expectObservationAndNoAttempt();
    await scope.usage.recoverInterruptedLifecycles();
    expect(await scope.publishedState()).toEqual(before);
    expect(await scope.source.query('SELECT * FROM resource_usage_recovery')).toEqual([]);
  });
});

export type UsageLifecyclePersistenceAroundExternalFlowsTestScope = ReturnType<
  typeof createUsageLifecyclePersistenceAroundExternalFlowsFixture
>;
