import {
  BillingTransaction,
  BillingTransactionStatus,
  FormSubmission,
  Resource,
  ResourceFormAction,
  ResourceOperatingInterval,
  ResourceUsage,
  ResourceUsageAction,
  ResourceUsageLifecycleAttempt,
  User,
} from '@attraccess/database-entities';
import { rm } from 'node:fs/promises';
import { DataSource, DataSourceOptions } from 'typeorm';
import { InsufficientBalanceError } from './../../billing/errors/insufficient-balance.error';
import { dataSourceConfig } from './../../database/datasource';
import { ResourceUsageIntegrity1790100000000 } from './../../database/migrations/1790100000000-resource-usage-integrity';
import { recoverOrphanedUsages } from './../../database/resource-usage-integrity';
import { closeResourceTransactionConnection } from './../../database/run-serialized-transaction';
import { ResourceInUseError } from './errors/resource-in-use.error';
import { resetTestFixture } from './resource-usage-lifecycle.persistence.setup.test-fixture';
import { createUsageLifecyclePersistenceAroundExternalFlowsFixture } from './usage-lifecycle-persistence.state.test-fixture';

// Real repositories and relations for the lifecycle boundary; peripheral domain tables are omitted.
describe('Usage lifecycle persistence around external flows', () => {
  const scope = createUsageLifecyclePersistenceAroundExternalFlowsFixture();

  beforeEach(async () => {
    await resetTestFixture(scope);
  });

  afterEach(async () => {
    scope.usage?.onModuleDestroy();
    if (scope.source) {
      await closeResourceTransactionConnection(scope.source);
      if (scope.source.isInitialized) await scope.source.destroy();
    }
    if (scope.directory) await rm(scope.directory, { recursive: true, force: true });
    jest.restoreAllMocks();
  });

  it.each([false, true])(
    'recovers a legacy orphan on restart without losing forms or changing billing (bill=%s)',
    async (hasBill) => {
      await scope.source.getRepository(Resource).update(1, { allowTakeOver: false });
      const orphan = await scope.source.getRepository(ResourceUsage).save({
        resourceId: 1,
        userId: 1,
        startTime: new Date('2026-09-23T14:00:40Z'),
        endTime: null,
        isFinalized: false,
        lifecyclePending: false,
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
      expect((await scope.usage.getActiveSessions([1])).get(1)).toBeNull();
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
      expect((await scope.usage.getActiveSessions([1])).get(1)?.id).toBe(started.id);
    },
  );

  it('reconciles legacy orphans before enforcing open-state and occupancy constraints', async () => {
    const orphan = await scope.source.getRepository(ResourceUsage).save({
      resourceId: 1,
      userId: 1,
      startTime: new Date(),
      isFinalized: false,
      lifecyclePending: false,
    });
    await scope.migrateIntegrity();
    expect(await scope.source.getRepository(ResourceUsage).findOneByOrFail({ id: orphan.id })).toMatchObject({
      endTime: orphan.startTime,
      isFinalized: false,
      usageInMinutes: 0,
    });
    await expect(
      scope.source.getRepository(ResourceUsage).save({
        resourceId: 1,
        userId: 1,
        startTime: new Date(),
      }),
    ).rejects.toThrow('Open usage must be finalized or lifecycle-pending');
    await expect(scope.source.getRepository(ResourceUsage).update(orphan.id, { endTime: null })).rejects.toThrow(
      'Open usage must be finalized or lifecycle-pending',
    );
    const active = await scope.seedActiveSession();
    await expect(scope.seedActiveSession()).rejects.toThrow('Resource already has an active usage session');
    const candidate = await scope.source.getRepository(ResourceUsage).save({
      resourceId: 1,
      userId: 2,
      startTime: new Date(),
      lifecyclePending: true,
      isFinalized: false,
    });
    await expect(
      scope.source.getRepository(ResourceUsage).update(candidate.id, {
        isFinalized: true,
        lifecyclePending: false,
      }),
    ).rejects.toThrow('Resource already has an active usage session');
    await expect(
      scope.source.getRepository(ResourceUsage).save({
        resourceId: 1,
        userId: 2,
        startTime: new Date(),
        lifecyclePending: true,
      }),
    ).rejects.toThrow('UNIQUE constraint');
    await expect(scope.usage.startSession(1, scope.users[1], {})).rejects.toThrow(
      'A usage lifecycle operation is already in progress',
    );
    await expect(scope.usage.endSession(1, scope.users[0], {})).rejects.toThrow(
      'A usage lifecycle operation is already in progress',
    );
    expect((await scope.usage.getActiveSession(1))?.id).toBe(active.id);
    expect((await scope.usage.getActiveSessions([1])).get(1)?.id).toBe(active.id);
    await scope.source.getRepository(ResourceUsage).delete(candidate.id);
    await scope.usage.recoverInterruptedLifecycles();
    await expect(scope.usage.startSession(1, scope.users[1], {})).rejects.toBeInstanceOf(ResourceInUseError);
    expect(scope.flow.runFlow).not.toHaveBeenCalled();
    expect(await scope.source.query('PRAGMA foreign_key_check')).toEqual([]);
    expect(await scope.source.query('PRAGMA integrity_check')).toEqual([{ integrity_check: 'ok' }]);
  });

  it('retains duplicate legacy real sessions and resolves them consistently without cancelling or charging them', async () => {
    const first = await scope.seedActiveSession();
    const second = await scope.seedActiveSession();
    const before = await scope.publishedState();
    await scope.migrateIntegrity();
    await scope.usage.recoverInterruptedLifecycles();
    expect(await scope.publishedState()).toEqual(before);
    expect((await scope.usage.getActiveSession(1))?.id).toBe(second.id);
    expect((await scope.usage.getActiveSessions([1])).get(1)?.id).toBe(second.id);
    await expect(scope.seedActiveSession()).rejects.toThrow('Resource already has an active usage session');
    await scope.usage.endSession(1, scope.users[0], {});
    expect((await scope.usage.getActiveSession(1))?.id).toBe(first.id);
    expect((await scope.usage.getActiveSessions([1])).get(1)?.id).toBe(first.id);
    expect(await scope.source.query('SELECT * FROM resource_usage_recovery')).toEqual([]);
  });

  it('keeps valid in-flight start reservations protected and never quarantines them', async () => {
    await scope.migrateIntegrity();
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
      expect((await scope.usage.getActiveSessions([1])).get(1)).toBeNull();
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

  it('never repairs history without its audit journal and retains evidence on downgrade', async () => {
    const orphan = await scope.source.getRepository(ResourceUsage).save({
      resourceId: 1,
      userId: 1,
      startTime: new Date(),
      isFinalized: false,
      lifecyclePending: false,
    });
    await scope.source.query(`CREATE TRIGGER reject_recovery_audit BEFORE INSERT ON resource_usage_recovery
      BEGIN SELECT RAISE(ABORT, 'journal unavailable'); END`);
    await expect(scope.usage.recoverInterruptedLifecycles()).rejects.toThrow('journal unavailable');
    expect(await scope.source.getRepository(ResourceUsage).findOneByOrFail({ id: orphan.id })).toEqual(orphan);
    await scope.source.query('DROP TRIGGER reject_recovery_audit');
    await scope.migrateIntegrity();
    const journal = await scope.source.query('SELECT * FROM resource_usage_recovery');
    const runner = scope.source.createQueryRunner();
    try {
      await new ResourceUsageIntegrity1790100000000().down(runner);
    } finally {
      await runner.release();
    }
    expect(await scope.source.query('SELECT * FROM resource_usage_recovery')).toEqual(journal);
    expect(await scope.source.getRepository(ResourceUsage).findOneByOrFail({ id: orphan.id })).toMatchObject({
      endTime: orphan.startTime,
      isFinalized: false,
    });
  });

  it.each(['startup', 'upgrade migration'])(
    'rolls back a written recovery journal when the usage update fails (%s)',
    async (recoveryPath) => {
      const orphan = await scope.source.getRepository(ResourceUsage).save({
        resourceId: 1,
        userId: 1,
        startTime: new Date('2026-09-23T14:00:40Z'),
        startNotes: 'DEMO: ongoing laboratory run',
        endNotes: 'Original note',
        attributedOperatingDurationInMinutes: 17,
        isFinalized: false,
        lifecyclePending: false,
      });
      const before = await scope.publishedState();
      const journalBefore = await scope.source.query('SELECT * FROM resource_usage_recovery');
      // This failure proves the journal INSERT succeeded within the recovery transaction.
      await scope.source.query(`CREATE TRIGGER reject_recovery_update BEFORE UPDATE ON resource_usage
        WHEN OLD.id = ${orphan.id}
        BEGIN
          SELECT CASE WHEN EXISTS (SELECT 1 FROM resource_usage_recovery WHERE usageId = OLD.id)
            THEN RAISE(ABORT, 'usage update rejected after journal insert')
            ELSE RAISE(ABORT, 'recovery journal missing before update') END;
        END`);

      // Retain the production automatic migration runner and its transaction configuration.
      const upgrade = new DataSource({
        ...dataSourceConfig,
        database: scope.source.options.database,
        entities: scope.schemas,
        migrations: [ResourceUsageIntegrity1790100000000],
      } as DataSourceOptions);
      try {
        const recover = () =>
          recoveryPath === 'startup' ? scope.usage.recoverInterruptedLifecycles() : upgrade.initialize();
        await expect(recover()).rejects.toThrow('usage update rejected after journal insert');
        expect(await scope.publishedState()).toEqual(before);
        expect(await scope.source.query('SELECT * FROM resource_usage_recovery')).toEqual(journalBefore);
        if (recoveryPath === 'upgrade migration') {
          expect(await scope.source.query('SELECT * FROM migrations')).toEqual([]);
        }

        await scope.source.query('DROP TRIGGER reject_recovery_update');
        await recover();
        expect(await scope.source.getRepository(ResourceUsage).findOneByOrFail({ id: orphan.id })).toMatchObject({
          endTime: orphan.startTime,
          isFinalized: false,
          attributedOperatingDurationInMinutes: 0,
        });
        expect(await scope.source.query('SELECT usageId FROM resource_usage_recovery')).toEqual([
          { usageId: orphan.id },
        ]);
      } finally {
        if (upgrade.isInitialized) await upgrade.destroy();
      }
    },
  );

  it.each([false, true])(
    'preserves the complete price contract through a start flow (takeover=%s)',
    async (takeover) => {
      await scope.migrateIntegrity();
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
    await scope.source.query(`CREATE TRIGGER reject_price_snapshot BEFORE UPDATE OF billingFactor ON resource_usage
      BEGIN SELECT RAISE(ABORT, 'snapshot unavailable'); END`);

    await expect(scope.usage.startSession(1, scope.users[0], {})).rejects.toThrow('snapshot unavailable');

    expect(await scope.source.getRepository(ResourceUsage).count()).toBe(0);
    expect(await scope.source.getRepository(BillingTransaction).count()).toBe(0);
    expect(await scope.source.getRepository(ResourceUsageLifecycleAttempt).count()).toBe(0);
    expect(scope.flow.runFlow).not.toHaveBeenCalled();
  });

  it('publishes neither the session nor its bill if pending transaction creation fails', async () => {
    scope.billing.handleResourceUsageStart.mockImplementation(async (_resourceId, session, user, manager) => {
      await manager.save(BillingTransaction, {
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
    await scope.migrateIntegrity();
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
    await scope.migrateIntegrity();
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
    scope.billing.validateResourceUsageStart.mockImplementation(async (_resourceId, session, user, manager) => {
      const storedUser = await manager.findOneByOrFail(User, { id: user.id });
      checkedBalances.push(storedUser.creditBalance);
      if (storedUser.creditBalance < session.sessionDurationCreditsPerMinute) throw new InsufficientBalanceError();
    });
    scope.billing.handleResourceUsageStart.mockImplementation(async (resourceId, session, user, manager) => {
      await scope.billing.validateResourceUsageStart(resourceId, session, user, manager);
      return manager.save(BillingTransaction, {
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
    await scope.migrateIntegrity();
    const previous = await scope.seedActiveSession();
    const before = await scope.publishedState();
    const candidate = await scope.source.getRepository(ResourceUsage).save({
      resourceId: 1,
      userId: 2,
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
