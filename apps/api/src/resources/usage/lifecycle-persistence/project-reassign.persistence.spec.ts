import {
  ProjectChangeMode,
  ProjectSwitchCharging,
  ResourceFlowNodeType,
  ResourceFormAction,
} from '@attraccess/application-models';
import {
  BillingTransaction,
  FormSubmission,
  Project,
  Resource,
  ResourceUsage,
  ResourceUsageLifecycleAttempt,
} from '@attraccess/database-entities';
import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import {
  closeLifecycleFixture,
  resetTestFixture,
} from '../../../database/adapters/usage/lifecycle-fixtures/setup.test-fixture';
import { createUsageLifecyclePersistenceAroundExternalFlowsFixture } from '../../../database/adapters/usage/lifecycle-fixtures/state.test-fixture';
import { FlowExecutionError } from '../../flows/errors/flow-execution.error';
import { MachineBusyError } from '../errors/machine-busy.error';
import {
  ResourceSessionStartedEvent,
  ResourceUsageProjectReassignedEvent,
  ResourceUsageProjectSwitchedEvent,
  ResourceUsageSessionEndedEvent,
} from '../events/resource-usage.events';
import { usageInternals } from '../sessions/fixtures/compose.test-fixture';

jest.setTimeout(60_000);

/** ATT-1421: the owner moves a whole running session to another project: the same record, another project. */
describe('Moving a whole running session to another project', () => {
  const scope = createUsageLifecyclePersistenceAroundExternalFlowsFixture();

  const usages = () => scope.source.getRepository(ResourceUsage).find({ order: { id: 'ASC' } });
  const bills = () => scope.source.getRepository(BillingTransaction).find({ order: { id: 'ASC' } });
  const attempts = () => scope.source.getRepository(ResourceUsageLifecycleAttempt).count();
  const flowRuns = () => scope.flow.runFlow.mock.calls.map((call) => call[1] as ResourceFlowNodeType);
  const startInProject = () => scope.usage.startSession(1, scope.users[0], { projectId: 1 });
  const change = (mode: ProjectChangeMode, projectId: number | null, user = 0, usageId?: number) =>
    scope.usage.switchSessionProject(1, scope.users[user], { mode, projectId, ...(usageId ? { usageId } : {}) });
  const moveTo = (projectId: number | null, user = 0, usageId?: number) =>
    change(ProjectChangeMode.WHOLE_SESSION, projectId, user, usageId);

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
      { id: 3, name: 'Third project', owner: scope.users[0] },
    ]);
  });

  afterEach(async () => {
    await closeLifecycleFixture(scope);
    jest.restoreAllMocks();
  });

  it('changes only the project of the running record and charges nothing', async () => {
    await scope.source.getRepository(Resource).update(1, { maxSessionDurationMinutes: 480 });
    const started = await startInProject();
    const [before] = await usages();
    const billsBefore = await bills();
    // Charging a split like a new session, with a balance that would not pay for one, has no say here.
    scope.billing.getResourceBillingConfiguration.mockResolvedValue({
      creditsPerUsage: 5,
      creditsPerMinute: 2,
      creditsPerOperatingMinute: 0,
      projectSwitchCharging: ProjectSwitchCharging.NEW_SESSION,
    });
    scope.billing.chargeForResourceUsage.mockClear();
    scope.billing.validateResourceUsageStart.mockClear();
    scope.billing.handleResourceUsageContinuation.mockClear();
    const lifecycle = usageInternals(scope.usage).lifecycle;
    const meters = [jest.spyOn(lifecycle, 'handOverMeters'), jest.spyOn(lifecycle, 'collectFinal')];

    const moved = await moveTo(2);

    expect(moved).toMatchObject({ id: started.id, projectId: 2, project: expect.objectContaining({ id: 2 }) });
    const [after, ...others] = await usages();
    expect(others).toEqual([]);
    expect({ ...after, projectId: before.projectId, updatedAt: undefined }).toEqual({
      ...before,
      updatedAt: undefined,
    });
    expect(after).toMatchObject({ projectId: 2, endTime: null, previousUsageId: null, sessionStartTime: null });
    expect(after.autoEndAt).not.toBeNull();
    expect(await bills()).toEqual(billsBefore);
    expect(scope.billing.chargeForResourceUsage).not.toHaveBeenCalled();
    expect(scope.billing.validateResourceUsageStart).not.toHaveBeenCalled();
    expect(scope.billing.handleResourceUsageContinuation).not.toHaveBeenCalled();
    for (const meter of meters) expect(meter).not.toHaveBeenCalled();
    expect(await attempts()).toBe(0);
  });

  it('runs only the project-reassigned flow, announces only the change and audits it', async () => {
    const started = await startInProject();
    const { audit } = usageInternals(scope.usage).projectReassign as unknown as { audit: { record: jest.Mock } };
    audit.record.mockClear();
    scope.flow.runFlow.mockClear();
    scope.pluginEvents.emit.mockClear();
    const emitted = jest.spyOn(scope.events, 'emit');
    const emittedAsync = jest.spyOn(scope.events, 'emitAsync');

    await moveTo(null);

    expect(flowRuns()).toEqual([ResourceFlowNodeType.INPUT_RESOURCE_USAGE_PROJECT_REASSIGNED]);
    expect(scope.flow.runFlow.mock.calls[0][2]).toMatchObject({
      id: started.id,
      usageId: started.id,
      previousProjectId: 1,
      newProjectId: null,
      newProject: null,
      changeTime: expect.any(Date),
      activeSessions: { before: 1, after: 1, limit: 1 },
    });
    const names = [...emitted.mock.calls, ...emittedAsync.mock.calls].map((call) => call[0]);
    expect(names).toEqual([ResourceUsageProjectReassignedEvent.EVENT_NAME]);
    expect(names).not.toContain(ResourceUsageProjectSwitchedEvent.EVENT_NAME);
    expect(names).not.toContain(ResourceSessionStartedEvent.EVENT_NAME);
    expect(names).not.toContain(ResourceUsageSessionEndedEvent.EVENT_NAME);
    expect(emitted.mock.calls[0][1]).toMatchObject({
      resourceId: 1,
      userId: 1,
      usageId: started.id,
      previousProjectId: 1,
      projectId: null,
    });
    expect(scope.pluginEvents.emit).not.toHaveBeenCalled();
    expect(scope.billing.notifyResourceUsageCharge).not.toHaveBeenCalled();
    expect(audit.record.mock.calls.map(([event]) => event)).toEqual([
      {
        domain: 'resource',
        action: 'usage_session.project_reassigned',
        actor: { id: 1, authenticationMethod: 'session' },
        subject: { type: 'resource', id: 1 },
        details: { usageId: started.id, usageUserId: 1, previousProjectId: 1 },
      },
    ]);
  });

  it('asks for the forms of the chosen mode only and keeps them on the running record', async () => {
    const started = await startInProject();
    const { resourceFormsService } = usageInternals(scope.usage).projectReassign as unknown as {
      resourceFormsService: { prepareRequiredSubmissions: jest.Mock };
    };
    resourceFormsService.prepareRequiredSubmissions.mockClear();

    await moveTo(2);

    expect(resourceFormsService.prepareRequiredSubmissions.mock.calls.map(([request]) => request.action)).toEqual([
      ResourceFormAction.PROJECT_REASSIGN,
    ]);
    const submissions = await scope.source.getRepository(FormSubmission).find({ order: { id: 'ASC' } });
    expect(submissions.map(({ resourceUsageId, action }) => [resourceUsageId, action])).toEqual([
      [started.id, ResourceFormAction.START],
      [started.id, ResourceFormAction.PROJECT_REASSIGN],
    ]);
  });

  it('leaves the project as it was when a required form is missing', async () => {
    await startInProject();
    const { resourceFormsService } = usageInternals(scope.usage).projectReassign as unknown as {
      resourceFormsService: { prepareRequiredSubmissions: jest.Mock };
    };
    resourceFormsService.prepareRequiredSubmissions.mockRejectedValueOnce(new BadRequestException('Missing form'));
    scope.flow.runFlow.mockClear();

    await expect(moveTo(2)).rejects.toBeInstanceOf(BadRequestException);

    expect(flowRuns()).toEqual([]);
    expect(await usages()).toEqual([expect.objectContaining({ projectId: 1, endTime: null })]);
    expect(await attempts()).toBe(0);
  });

  it('changes only the running part of a session that was split before', async () => {
    await startInProject();
    const continuation = await change(ProjectChangeMode.SPLIT, 2);
    const [first] = await usages();
    const billsBefore = await bills();

    await moveTo(3);

    const [previous, running] = await usages();
    expect(previous).toEqual(first);
    expect(running).toMatchObject({
      id: continuation.id,
      projectId: 3,
      previousUsageId: first.id,
      startTime: continuation.startTime,
      endTime: null,
    });
    expect(await bills()).toEqual(billsBefore);
  });

  it('books the whole record to the new project when it ends', async () => {
    const started = await startInProject();
    await moveTo(2);

    await scope.usage.endSession(1, scope.users[0], {});

    expect(await usages()).toEqual([expect.objectContaining({ id: started.id, projectId: 2 })]);
  });

  it('leaves the project as it was when its flow fails', async () => {
    await startInProject();
    scope.flow.runFlow.mockRejectedValueOnce(new FlowExecutionError('relay offline'));

    await expect(moveTo(2)).rejects.toBeInstanceOf(FlowExecutionError);

    expect(await usages()).toEqual([expect.objectContaining({ projectId: 1, endTime: null })]);
    expect(await attempts()).toBe(0);
    await expect(moveTo(2)).resolves.toMatchObject({ projectId: 2 });
  });

  it('does not let its flow cancel the session being changed', async () => {
    await startInProject();
    scope.flow.runFlow.mockImplementationOnce(async (resourceId, _type, _payload, _manager, options) => {
      await scope.usage.endLifecycleCandidate(options?.lifecycleAttemptId as string, resourceId as number, 'cancel');
    });

    await expect(moveTo(2)).rejects.toBeInstanceOf(FlowExecutionError);

    expect(await usages()).toEqual([expect.objectContaining({ projectId: 1, endTime: null })]);
    expect(await attempts()).toBe(0);
  });

  it('ends the session after the change when its flow asks to end all sessions', async () => {
    const started = await startInProject();
    scope.flow.runFlow.mockImplementationOnce(async (resourceId, _type, _payload, _manager, options) => {
      await scope.usage.deferSessionEnds(
        options?.lifecycleAttemptId as string,
        resourceId as number,
        { kind: 'all' },
        'closing time',
      );
    });

    await moveTo(2);

    const [ended] = await usages();
    expect(ended).toMatchObject({ id: started.id, projectId: 2, endNotes: expect.stringContaining('closing time') });
    expect(ended.endTime).not.toBeNull();
  });

  it('refuses the current project, other people, foreign projects and sessions that do not run', async () => {
    const started = await startInProject();

    await expect(moveTo(1)).rejects.toBeInstanceOf(BadRequestException);
    await expect(moveTo(2, 1, started.id)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(moveTo(2, 1)).rejects.toBeInstanceOf(NotFoundException);
    const projects = Reflect.get(usageInternals(scope.usage).projectReassign, 'projectsService') as {
      findOneById: jest.Mock;
    };
    projects.findOneById.mockRejectedValueOnce(new NotFoundException('Project not found'));
    await expect(moveTo(2)).rejects.toBeInstanceOf(NotFoundException);
    await scope.usage.endSession(1, scope.users[0], {});
    await expect(moveTo(2, 0, started.id)).rejects.toBeInstanceOf(NotFoundException);

    expect(await usages()).toEqual([expect.objectContaining({ projectId: 1 })]);
    expect(await attempts()).toBe(0);
  });

  it.each([
    ['a stop', () => scope.usage.endSession(1, scope.users[0], {})],
    ['a split', () => change(ProjectChangeMode.SPLIT, 3)],
    ['another move', () => moveTo(3)],
  ])('refuses %s while the move is pending, and the move still commits', async (_name, other) => {
    const started = await startInProject();
    const parked = parkNextFlow();
    const moving = moveTo(2);
    await parked.entered;

    await expect(other()).rejects.toBeInstanceOf(ConflictException);
    parked.release();
    await moving;

    expect(await usages()).toEqual([expect.objectContaining({ id: started.id, projectId: 2, endTime: null })]);
    expect(await attempts()).toBe(0);
  });

  it('is refused while a stop is pending, which then ends the session under its old project', async () => {
    await startInProject();
    const parked = parkNextFlow();
    const stopping = scope.usage.endSession(1, scope.users[0], {});
    await parked.entered;

    // The queue of the machine may let the move wait for the stop: then nothing is left to change.
    const moving = expect(moveTo(2)).rejects.toThrow();
    parked.release();
    await stopping;
    await moving;

    expect(await usages()).toEqual([expect.objectContaining({ projectId: 1, endTime: expect.any(Date) })]);
    expect(await attempts()).toBe(0);
  });

  it('keeps a stop of the same session on a shared machine from slipping in', async () => {
    await scope.source.getRepository(Resource).update(1, { maxParallelSessions: 2 });
    const started = await startInProject();
    const { lifecycle } = usageInternals(scope.usage);
    const parked = parkNextFlow();
    const moving = moveTo(2);
    await parked.entered;

    expect(await lifecycle.sessions.isSessionBeingEnded(started.id)).toBe(true);
    expect(await lifecycle.sessions.isSessionBeingSwitched(started.id)).toBe(true);
    const stopping = scope.usage.endSession(1, scope.users[0], {}).catch((error: unknown) => error);
    parked.release();
    await moving;
    const stopped = await stopping;

    // The stop either waited for its turn and ended the moved session, or was refused as busy.
    const [usage] = await usages();
    expect(usage.projectId).toBe(2);
    if (stopped instanceof Error) expect(stopped).toBeInstanceOf(MachineBusyError);
    else expect(usage.endTime).not.toBeNull();
    expect(await attempts()).toBe(0);
  });

  it('cleans up after a move cut off by a crash, leaving the session running as it was', async () => {
    const started = await startInProject();
    const { lifecycle } = usageInternals(scope.usage);
    await lifecycle.sessions.saveAttempt({
      id: '00000000-0000-4000-8000-000000000001',
      resourceId: 1,
      kind: 'project-reassign',
      candidateUsageId: null,
      previousUsageId: started.id,
      transitionTime: new Date(),
      formSubmissions: [],
      billingItems: [],
    });

    await lifecycle.recoverInterruptedLifecycles();

    expect(await attempts()).toBe(0);
    expect(await usages()).toEqual([expect.objectContaining({ id: started.id, projectId: 1, endTime: null })]);
  });
});
