import {
  BillingTransaction,
  FormSubmission,
  Project,
  Resource,
  ResourceUsage,
  ResourceUsageLifecycleAttempt,
} from '@attraccess/database-entities';
import {
  BillingTransactionStatus,
  ProjectSwitchCharging,
  ResourceFlowNodeType,
  ResourceFormAction,
} from '@attraccess/application-models';
import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { InsufficientBalanceError } from '../../../billing/errors/insufficient-balance.error';
import { FlowExecutionError } from '../../flows/errors/flow-execution.error';
import {
  closeLifecycleFixture,
  resetTestFixture,
} from '../../../database/adapters/usage/lifecycle-fixtures/setup.test-fixture';
import { createUsageLifecyclePersistenceAroundExternalFlowsFixture } from '../../../database/adapters/usage/lifecycle-fixtures/state.test-fixture';
import {
  ResourceSessionStartedEvent,
  ResourceUsageProjectSwitchedEvent,
  ResourceUsageSessionEndedEvent,
  ResourceUsageSessionTakenOverEvent,
} from '../events/resource-usage.events';
import { forkUsageInstance } from '../sessions/fixtures/compose.test-fixture';

jest.setTimeout(60_000);

/** ATT-1421: the owner moves a running session to another project without stopping the machine. */
describe('Switching the project of a running session', () => {
  const scope = createUsageLifecyclePersistenceAroundExternalFlowsFixture();

  const usages = () => scope.source.getRepository(ResourceUsage).find({ order: { id: 'ASC' } });
  const attempts = () => scope.source.getRepository(ResourceUsageLifecycleAttempt).count();
  const openSessions = async () => (await usages()).filter((usage) => !usage.endTime);
  const flowRuns = () => scope.flow.runFlow.mock.calls.map((call) => call[1] as ResourceFlowNodeType);
  const startInProject = (user = 0, projectId = 1) => scope.usage.startSession(1, scope.users[user], { projectId });
  const switchTo = (projectId: number | null, user = 0, usageId?: number) =>
    scope.usage.switchSessionProject(1, scope.users[user], { projectId, ...(usageId ? { usageId } : {}) });

  /** Parks the next flow run inside the flow; `entered` resolves once the change is waiting there. */
  const parkNextFlow = () => {
    let release!: () => void;
    const released = new Promise<void>((resolve) => (release = resolve));
    let enter!: () => void;
    const entered = new Promise<void>((resolve) => (enter = resolve));
    scope.flow.runFlow.mockImplementationOnce(async () => {
      enter();
      await released;
    });
    return { entered, release };
  };

  beforeEach(async () => {
    await resetTestFixture(scope);
    await scope.source.getRepository(Project).save([
      { id: 1, name: 'Old project', owner: scope.users[0] },
      { id: 2, name: 'New project', owner: scope.users[0] },
    ]);
  });

  afterEach(async () => {
    await closeLifecycleFixture(scope);
    jest.restoreAllMocks();
  });

  it('ends the old part and continues the session under the new project, with everything it froze', async () => {
    await scope.source.getRepository(Resource).update(1, { maxSessionDurationMinutes: 480 });
    await scope.source.query(`UPDATE "user" SET "billingFactor" = 80 WHERE id = 1`);
    const started = await startInProject();
    // A later change of the owner's factor or of the machine's maximum must not reach the running session.
    await scope.source.query(`UPDATE "user" SET "billingFactor" = 20 WHERE id = 1`);
    await scope.source.getRepository(Resource).update(1, { maxSessionDurationMinutes: 30 });
    scope.flow.runFlow.mockClear();
    scope.billing.chargeForResourceUsage.mockClear();

    const continuation = await switchTo(2);

    const [previous, next] = await usages();
    expect(next.id).toBe(continuation.id);
    expect(previous.endTime).toEqual(next.startTime);
    expect(previous).toMatchObject({ id: started.id, projectId: 1, endNotes: null, previousUsageId: null });
    expect(next).toMatchObject({
      projectId: 2,
      previousUsageId: previous.id,
      projectSwitchCharging: ProjectSwitchCharging.CONTINUE,
      sessionStartTime: previous.startTime,
      endTime: null,
      isFinalized: true,
      lifecyclePending: false,
      userId: 1,
      billingFactor: 80,
      creditsPerUsage: previous.creditsPerUsage,
      sessionDurationCreditsPerMinute: previous.sessionDurationCreditsPerMinute,
      operatingDurationCreditsPerMinute: previous.operatingDurationCreditsPerMinute,
      autoEndAt: previous.autoEndAt,
      maxAutoEndAt: previous.maxAutoEndAt,
    });
    expect(next.autoEndAt).not.toBeNull();
    expect((await scope.usage.getActiveSession(1))?.id).toBe(next.id);
    expect(await attempts()).toBe(0);

    // The old part is billed like at an end; the continuation has its own pending bill.
    expect(scope.billing.chargeForResourceUsage).toHaveBeenCalledTimes(1);
    expect(scope.billing.chargeForResourceUsage.mock.calls[0][0]).toMatchObject({ id: previous.id });
    const bills = await scope.source.getRepository(BillingTransaction).find({ order: { resourceUsageId: 'ASC' } });
    expect(bills.map((bill) => [bill.resourceUsageId, bill.status])).toEqual([
      [previous.id, BillingTransactionStatus.Completed],
      [next.id, BillingTransactionStatus.Pending],
    ]);
    expect(scope.billing.notifyResourceUsageCharge).toHaveBeenCalledTimes(1);
  });

  it('runs only the project-switch flow, announces only the switch and keeps its forms on the continuation', async () => {
    const started = await startInProject();
    scope.flow.runFlow.mockClear();
    scope.pluginEvents.emit.mockClear();
    const emitted = jest.spyOn(scope.events, 'emit');
    const emittedAsync = jest.spyOn(scope.events, 'emitAsync');

    const continuation = await switchTo(2);

    expect(flowRuns()).toEqual([ResourceFlowNodeType.INPUT_RESOURCE_USAGE_PROJECT_SWITCHED]);
    expect(scope.flow.runFlow.mock.calls[0][2]).toMatchObject({
      id: started.id,
      previousUsageId: started.id,
      newUsageId: continuation.id,
      previousProjectId: 1,
      newProjectId: 2,
      activeSessions: { before: 1, after: 1, limit: 1 },
    });
    const names = [...emitted.mock.calls, ...emittedAsync.mock.calls].map((call) => call[0]);
    expect(names).toEqual([ResourceUsageProjectSwitchedEvent.EVENT_NAME]);
    expect(names).not.toContain(ResourceSessionStartedEvent.EVENT_NAME);
    expect(names).not.toContain(ResourceUsageSessionEndedEvent.EVENT_NAME);
    expect(names).not.toContain(ResourceUsageSessionTakenOverEvent.EVENT_NAME);
    expect(emitted.mock.calls[0][1]).toMatchObject({
      resourceId: 1,
      userId: 1,
      previousUsageId: started.id,
      usageId: continuation.id,
      previousProjectId: 1,
      projectId: 2,
    });
    expect(scope.pluginEvents.emit).not.toHaveBeenCalled();
    const submissions = await scope.source.getRepository(FormSubmission).find({ order: { id: 'ASC' } });
    expect(submissions.map((submission) => [submission.resourceUsageId, submission.action])).toEqual([
      [started.id, ResourceFormAction.START],
      [continuation.id, ResourceFormAction.PROJECT_SWITCH],
    ]);
  });

  it('switches to no project and back, one record per part', async () => {
    await startInProject();
    const second = await switchTo(null);
    const third = await switchTo(1);

    const parts = await usages();
    expect(parts.map((part) => [part.projectId, part.previousUsageId, Boolean(part.endTime)])).toEqual([
      [1, null, true],
      [null, parts[0].id, true],
      [1, second.id, false],
    ]);
    expect(third.sessionStartTime).toEqual(parts[0].startTime);
  });

  it('refuses the current project, other people, and sessions that do not run', async () => {
    await expect(switchTo(2)).rejects.toBeInstanceOf(NotFoundException);
    const started = await startInProject();

    await expect(switchTo(1)).rejects.toBeInstanceOf(BadRequestException);
    // Somebody else naming the session, even a manager. Without a name they simply have no session to switch.
    await expect(switchTo(2, 1, started.id)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(switchTo(2, 1)).rejects.toBeInstanceOf(NotFoundException);
    await expect(switchTo(2, 0, started.id + 100)).rejects.toBeInstanceOf(NotFoundException);

    await scope.usage.endSession(1, scope.users[0], {});
    await expect(switchTo(2, 0, started.id)).rejects.toBeInstanceOf(NotFoundException);
    await expect(switchTo(2)).rejects.toBeInstanceOf(NotFoundException);
    expect(await usages()).toHaveLength(1);
  });

  const expectUnchanged = async (startedId: number) => {
    expect(await usages()).toEqual([
      expect.objectContaining({ id: startedId, projectId: 1, endTime: null, isFinalized: true }),
    ]);
    expect(await attempts()).toBe(0);
    expect(await scope.source.getRepository(BillingTransaction).find()).toEqual([
      expect.objectContaining({ resourceUsageId: startedId, status: BillingTransactionStatus.Pending }),
    ]);
    expect((await scope.source.getRepository(FormSubmission).find()).map((submission) => submission.action)).toEqual([
      ResourceFormAction.START,
    ]);
  };

  it('leaves the session as it was when the switch flow fails', async () => {
    const started = await startInProject();
    scope.flow.runFlow.mockRejectedValueOnce(new FlowExecutionError('relay offline'));

    await expect(switchTo(2)).rejects.toBeInstanceOf(FlowExecutionError);

    await expectUnchanged(started.id);
    await expect(switchTo(2)).resolves.toMatchObject({ projectId: 2 });
  });

  it('leaves the session as it was when the new part cannot be paid for', async () => {
    const started = await startInProject();
    scope.billing.getResourceBillingConfiguration.mockResolvedValue({
      creditsPerUsage: 5,
      creditsPerMinute: 2,
      creditsPerOperatingMinute: 0,
      projectSwitchCharging: ProjectSwitchCharging.NEW_SESSION,
    });
    // The balance covers it before the old part is charged, not after.
    scope.billing.handleResourceUsageContinuation.mockRejectedValueOnce(new InsufficientBalanceError());

    await expect(switchTo(2)).rejects.toBeInstanceOf(InsufficientBalanceError);

    await expectUnchanged(started.id);
    expect(scope.billing.notifyResourceUsageCharge).not.toHaveBeenCalled();
  });

  it('refuses to let a switch flow cancel the session being switched, which would stop the machine', async () => {
    const started = await startInProject();
    scope.flow.runFlow.mockClear();
    scope.flow.runFlow.mockImplementationOnce(async (resourceId, _type, _payload, _manager, options) => {
      await scope.usage.endLifecycleCandidate(options?.lifecycleAttemptId as string, resourceId as number, 'cancel');
    });

    await expect(switchTo(2)).rejects.toBeInstanceOf(FlowExecutionError);

    expect(flowRuns()).toEqual([ResourceFlowNodeType.INPUT_RESOURCE_USAGE_PROJECT_SWITCHED]);
    await expectUnchanged(started.id);
  });

  it('ends the continuation when a switch flow asks to end all sessions', async () => {
    await startInProject();
    scope.flow.runFlow.mockImplementationOnce(async (resourceId, _type, _payload, _manager, options) => {
      await scope.usage.deferSessionEnds(
        options?.lifecycleAttemptId as string,
        resourceId as number,
        { kind: 'all' },
        'closing time',
      );
    });

    const continuation = await switchTo(2);

    expect(await openSessions()).toEqual([]);
    expect((await usages()).find((usage) => usage.id === continuation.id)?.endNotes).toContain('closing time');
  });

  it('keeps an extension made while the switch runs', async () => {
    await scope.source.getRepository(Resource).update(1, { maxSessionDurationMinutes: 480 });
    const started = await scope.usage.startSession(1, scope.users[0], { projectId: 1, estimatedDurationMinutes: 60 });
    const parked = parkNextFlow();
    const switching = switchTo(2);
    await parked.entered;
    const extended = new Date((started.autoEndAt as Date).getTime() + 60 * 60_000);
    await scope.source.getRepository(ResourceUsage).update(started.id, { autoEndAt: extended });
    parked.release();

    expect((await switching).autoEndAt).toEqual(extended);
  });

  it('switches on a full shared machine without changing how many sessions run', async () => {
    await scope.source.getRepository(Resource).update(1, { maxParallelSessions: 2 });
    await startInProject();
    await scope.usage.startSession(1, scope.users[1], {});
    const parked = parkNextFlow();
    const switching = switchTo(2);
    await parked.entered;
    // The pending continuation takes no second slot.
    expect((await scope.usage.getActiveSessionOverview(1, 1)).activeSessionCount).toBe(2);
    const { sessions } = (await import('../sessions/fixtures/compose.test-fixture')).usageInternals(
      scope.usage,
    ).lifecycle;
    expect(await sessions.countOccupiedSlots(1)).toBe(2);
    parked.release();
    await switching;

    expect((await scope.usage.getActiveSessionOverview(1, 1)).activeSessionCount).toBe(2);
  });

  describe('racing other changes of the machine', () => {
    /** At most one published session is open, nothing stays pending, and an ended chain has no open continuation. */
    const expectOneConsistentOutcome = async () => {
      const all = await usages();
      expect(all.filter((usage) => usage.lifecyclePending)).toEqual([]);
      expect(all.filter((usage) => !usage.endTime).length).toBeLessThanOrEqual(1);
      for (const usage of all.filter((candidate) => candidate.previousUsageId !== null)) {
        expect(all.find((candidate) => candidate.id === usage.previousUsageId)?.endTime).not.toBeNull();
      }
      // One continuation per part.
      const continued = all.flatMap((usage) => (usage.previousUsageId === null ? [] : [usage.previousUsageId]));
      expect(new Set(continued).size).toBe(continued.length);
      expect(await attempts()).toBe(0);
    };

    it.each(['this instance', 'another instance'])(
      'refuses a stop, a takeover and a second switch while a switch runs (%s)',
      async (where) => {
        const started = await startInProject();
        const other = where === 'this instance' ? scope.usage : forkUsageInstance(scope.usage, () => undefined);
        const parked = parkNextFlow();
        const switching = switchTo(2, 0, started.id);
        await parked.entered;

        await expect(other.endSession(1, scope.users[0], {})).rejects.toBeInstanceOf(ConflictException);
        await expect(other.startSession(1, scope.users[1], { forceTakeOver: true })).rejects.toBeInstanceOf(
          ConflictException,
        );
        await expect(
          other.switchSessionProject(1, scope.users[0], { projectId: null, usageId: started.id }),
        ).rejects.toBeInstanceOf(ConflictException);

        parked.release();
        await switching;
        await expectOneConsistentOutcome();
        expect(await openSessions()).toHaveLength(1);
      },
    );

    it.each(['stop', 'takeover'])('refuses a switch while a %s of the same session runs', async (change) => {
      const started = await startInProject();
      const other = forkUsageInstance(scope.usage, () => undefined);
      const parked = parkNextFlow();
      const running =
        change === 'stop'
          ? scope.usage.endSession(1, scope.users[0], {})
          : scope.usage.startSession(1, scope.users[1], { forceTakeOver: true });
      await parked.entered;

      await expect(
        other.switchSessionProject(1, scope.users[0], { projectId: 2, usageId: started.id }),
      ).rejects.toBeInstanceOf(ConflictException);

      parked.release();
      await running;
      await expectOneConsistentOutcome();
      expect((await usages()).filter((usage) => usage.previousUsageId !== null)).toEqual([]);
    });

    it('never leaves two active parts when switches and a stop arrive at once from two instances', async () => {
      for (let round = 0; round < 5; round++) {
        const started = await startInProject();
        const other = forkUsageInstance(scope.usage, () => undefined);
        await Promise.allSettled([
          scope.usage.switchSessionProject(1, scope.users[0], { projectId: 2, usageId: started.id }),
          other.endSession(1, scope.users[0], { usageId: started.id }),
          other.switchSessionProject(1, scope.users[0], { projectId: null, usageId: started.id }),
        ]);
        await expectOneConsistentOutcome();
        if ((await openSessions()).length) await scope.usage.endSession(1, scope.users[0], {});
      }
    });
  });
});
