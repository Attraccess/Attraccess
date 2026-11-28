import {
  BillingTransaction,
  FormSubmission,
  Project,
  ResourceOperatingInterval,
  Resource,
  ResourceUsage,
  ResourceUsageLifecycleAttempt,
} from '@attraccess/database-entities';
import {
  BillingTransactionStatus,
  ProjectSwitchCharging,
  ResourceFlowNodeType,
  ResourceFormAction,
  ResourceType,
} from '@attraccess/application-models';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { InsufficientBalanceError } from '../../../billing/errors/insufficient-balance.error';
import { FlowExecutionError } from '../../flows/errors/flow-execution.error';
import { ResourceOperatingAttributionService } from '../../operating-intervals/resource-operating-attribution.service';
import { createOperatingTimelineStore } from '../../../database/adapters/operating-intervals/typeorm-operating-timeline.store';
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
import { usageInternals } from '../sessions/fixtures/compose.test-fixture';

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

  it('splits operating time at the switch: before it to the old part, after it to the continuation', async () => {
    const tick = () => new Promise((resolve) => setTimeout(resolve, 5)); // distinct instants, nothing to wait for
    await startInProject();
    await scope.operating.transition(1, 'operating');
    await tick();
    await switchTo(2);
    await tick();
    await scope.operating.transition(1, 'idle');
    await scope.usage.endSession(1, scope.users[0], {});

    const [interval] = await scope.source.getRepository(ResourceOperatingInterval).find();
    const [previous, continuation] = await usages();
    const switchTime = previous.endTime as Date;
    const attribution = new ResourceOperatingAttributionService(createOperatingTimelineStore(scope.source));
    const shareOf = async (part: ResourceUsage) => (await attribution.getShareForUsage(part))?.shareMs;

    expect(interval.startTime.getTime()).toBeLessThan(switchTime.getTime());
    expect((interval.endTime as Date).getTime()).toBeGreaterThan(switchTime.getTime());
    expect(await shareOf(previous)).toBe(switchTime.getTime() - interval.startTime.getTime());
    expect(await shareOf(continuation)).toBe((interval.endTime as Date).getTime() - switchTime.getTime());
    // Neither part counts the other as a session it shared the machine with.
    expect((await attribution.getShareForUsage(previous))?.shared).toBe(false);
    expect((await attribution.getShareForUsage(continuation))?.shared).toBe(false);
    // Together exactly the running time of the unsplit session, which ran through the whole interval.
    const unsplitMs = (interval.endTime as Date).getTime() - interval.startTime.getTime();
    expect(((await shareOf(previous)) ?? 0) + ((await shareOf(continuation)) ?? 0)).toBe(unsplitMs);
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

  it('refuses a session that does not run on a machine', async () => {
    const started = await startInProject();
    // A session left running on a resource that is a door now.
    await scope.source.query(`UPDATE resource SET type = $1 WHERE id = 1`, [ResourceType.Door]);
    scope.flow.runFlow.mockClear();

    await expect(switchTo(2)).rejects.toThrow(
      new BadRequestException('Only running machine sessions can switch their project'),
    );
    await expect(switchTo(2, 0, started.id)).rejects.toBeInstanceOf(BadRequestException);

    expect(flowRuns()).toEqual([]);
    expect(await usages()).toEqual([expect.objectContaining({ id: started.id, projectId: 1, endTime: null })]);
    expect(await attempts()).toBe(0);
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

  it('records who switched which part to which project in the audit log', async () => {
    const started = await startInProject();
    const { audit } = usageInternals(scope.usage).projectSwitch as unknown as { audit: { record: jest.Mock } };
    audit.record.mockClear();

    const continuation = await scope.usage.switchSessionProject(
      1,
      scope.users[0],
      { projectId: 2 },
      { auditOrigin: { id: 1, authenticationMethod: 'api-token' } },
    );
    const toNone = await switchTo(null);

    const switched = audit.record.mock.calls
      .map(([event]) => event)
      .filter((event) => event.action === 'usage_session.project_switched');
    expect(switched).toEqual([
      {
        domain: 'resource',
        action: 'usage_session.project_switched',
        actor: { id: 1, authenticationMethod: 'api-token' },
        subject: { type: 'resource', id: 1 },
        details: {
          usageId: started.id,
          newUsageId: continuation.id,
          usageUserId: 1,
          previousProjectId: 1,
          projectId: 2,
        },
      },
      // No project, before or after, is left out rather than written as null.
      expect.objectContaining({
        actor: { id: 1, authenticationMethod: 'session' },
        details: { usageId: continuation.id, newUsageId: toNone.id, usageUserId: 1, previousProjectId: 2 },
      }),
    ]);
  });

  it('refuses a project the owner is not a member of without touching the session', async () => {
    const started = await startInProject();
    const projects = Reflect.get(usageInternals(scope.usage).projectSwitch, 'projectsService') as {
      findOneById: jest.Mock;
    };
    projects.findOneById.mockRejectedValueOnce(new NotFoundException('Project not found'));
    scope.flow.runFlow.mockClear();

    await expect(switchTo(2)).rejects.toBeInstanceOf(NotFoundException);

    expect(projects.findOneById).toHaveBeenLastCalledWith(1, 2);
    expect(flowRuns()).toEqual([]);
    await expectUnchanged(started.id);
  });

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
    const { sessions } = usageInternals(scope.usage).lifecycle;
    expect(await sessions.countOccupiedSlots(1)).toBe(2);
    parked.release();
    await switching;

    expect((await scope.usage.getActiveSessionOverview(1, 1)).activeSessionCount).toBe(2);
  });
});
