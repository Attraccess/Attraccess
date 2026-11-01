import { Logger } from '@nestjs/common';
import { ResourceFlowNode, ResourceFlowNodeType } from '@attraccess/database-entities';
import { ResourceUsageService } from '../../usage/sessions/resource-usage.service';
import { EndUsageSessionExecutor } from './end-usage-session.executor';
import { NodeExecutionContext } from './node-executor.interface';
import { NoUsageSessionError } from '../errors/no-usage-session.error';
import { FlowExecutionError } from '../errors/flow-execution.error';

function createNode(partial: Partial<ResourceFlowNode>): ResourceFlowNode {
  return {
    id: 'n1',
    type: ResourceFlowNodeType.OUTPUT_RESOURCE_USAGE_END_SESSION,
    resourceId: 1,
    data: {},
    ...partial,
  } as unknown as ResourceFlowNode;
}

describe('EndUsageSessionExecutor', () => {
  let executor: EndUsageSessionExecutor;
  let resourceUsageService: jest.Mocked<
    Pick<ResourceUsageService, 'endLifecycleCandidate' | 'getActiveSessionsForResource' | 'endSession'>
  >;
  let ctx: NodeExecutionContext;
  let compileTemplate: jest.Mock;

  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'debug').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);

    resourceUsageService = {
      endLifecycleCandidate: jest.fn(),
      getActiveSessionsForResource: jest.fn(),
      endSession: jest.fn(),
    };

    compileTemplate = jest.fn((tpl: string) => tpl);
    ctx = {
      transactionManager: undefined,
      compileTemplate,
      getTemplateVariables: jest.fn(),
      setTemplateVariables: jest.fn(),
    } as unknown as NodeExecutionContext;

    executor = new EndUsageSessionExecutor(resourceUsageService as unknown as ResourceUsageService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('queries the active session with the node resourceId and the transaction manager', async () => {
    const txManager = {} as never;
    ctx.transactionManager = txManager;
    const user = { id: 7 };
    resourceUsageService.getActiveSessionsForResource.mockResolvedValue([{ user }] as never);
    resourceUsageService.endSession.mockResolvedValue(undefined as never);

    const node = createNode({ resourceId: 42 });
    await executor.execute(node, {}, ctx);

    expect(resourceUsageService.getActiveSessionsForResource).toHaveBeenCalledWith(42, txManager);
  });

  it('runs the stopped flow before cancelling a tentative session in a usage lifecycle flow', async () => {
    ctx.lifecycleAttemptId = 'attempt-id';

    await expect(
      executor.execute(
        createNode({ resourceId: 42, data: { notes: 'Stopped by {{source}}' } as never }),
        { source: 'start' },
        ctx,
      ),
    ).resolves.toEqual({
      payload: { source: 'start' },
    });

    expect(resourceUsageService.endLifecycleCandidate).toHaveBeenCalledWith('attempt-id', 42, 'Stopped by {{source}}');
    expect(resourceUsageService.getActiveSessionsForResource).not.toHaveBeenCalled();
    expect(resourceUsageService.endSession).not.toHaveBeenCalled();
  });

  it('does not recursively cancel the candidate from its stopped flow', async () => {
    ctx.lifecycleAttemptId = 'attempt-id';
    ctx.lifecycleCandidateCancellation = true;

    await executor.execute(createNode({ resourceId: 42 }), { source: 'stop' }, ctx);

    expect(resourceUsageService.endLifecycleCandidate).not.toHaveBeenCalled();
  });

  it('throws NoUsageSessionError when there is no active session', async () => {
    resourceUsageService.getActiveSessionsForResource.mockResolvedValue([] as never);

    await expect(executor.execute(createNode({}), {}, ctx)).rejects.toBeInstanceOf(NoUsageSessionError);
    expect(resourceUsageService.endSession).not.toHaveBeenCalled();
  });

  it('throws FlowExecutionError when the active session has no owner user', async () => {
    resourceUsageService.getActiveSessionsForResource.mockResolvedValue([{ user: null }] as never);

    await expect(executor.execute(createNode({}), {}, ctx)).rejects.toBeInstanceOf(FlowExecutionError);
    await expect(executor.execute(createNode({}), {}, ctx)).rejects.toThrow(
      'FLOW_EXECUTION_ERROR: Active session has no owner user; cannot end',
    );
    expect(resourceUsageService.endSession).not.toHaveBeenCalled();
  });

  it('compiles the notes template and ends the session with the compiled result', async () => {
    const user = { id: 7 };
    resourceUsageService.getActiveSessionsForResource.mockResolvedValue([{ user }] as never);
    resourceUsageService.endSession.mockResolvedValue(undefined as never);
    compileTemplate.mockImplementation(() => 'compiled notes');

    const node = createNode({ resourceId: 5, data: { notes: 'Hello {{name}}' } as never });
    const input = { name: 'World' };
    const result = await executor.execute(node, input, ctx);

    expect(compileTemplate).toHaveBeenCalledWith('Hello {{name}}', input);
    expect(resourceUsageService.endSession).toHaveBeenCalledWith(
      5,
      user,
      { notes: 'compiled notes' },
      { skipFormSubmissions: true, skipNoteNotification: true, auditOrigin: { actorId: null } },
    );
    expect(result).toEqual({ payload: input });
  });

  it('falls back to the raw notes when the compiled template is only whitespace', async () => {
    const user = { id: 9 };
    resourceUsageService.getActiveSessionsForResource.mockResolvedValue([{ user }] as never);
    resourceUsageService.endSession.mockResolvedValue(undefined as never);
    compileTemplate.mockImplementation(() => '   ');

    const node = createNode({ data: { notes: 'raw value' } as never });
    await executor.execute(node, {}, ctx);

    expect(resourceUsageService.endSession).toHaveBeenCalledWith(
      1,
      user,
      { notes: 'raw value' },
      { skipFormSubmissions: true, skipNoteNotification: true, auditOrigin: { actorId: null } },
    );
  });

  it('passes empty notes when no notes are configured and does not compile', async () => {
    const user = { id: 3 };
    resourceUsageService.getActiveSessionsForResource.mockResolvedValue([{ user }] as never);
    resourceUsageService.endSession.mockResolvedValue(undefined as never);

    const node = createNode({ data: {} as never });
    await executor.execute(node, {}, ctx);

    expect(compileTemplate).not.toHaveBeenCalled();
    expect(resourceUsageService.endSession).toHaveBeenCalledWith(
      1,
      user,
      { notes: '' },
      { skipFormSubmissions: true, skipNoteNotification: true, auditOrigin: { actorId: null } },
    );
  });

  it('passes empty notes when the configured notes string is empty and does not compile', async () => {
    const user = { id: 3 };
    resourceUsageService.getActiveSessionsForResource.mockResolvedValue([{ user }] as never);
    resourceUsageService.endSession.mockResolvedValue(undefined as never);

    const node = createNode({ data: { notes: '' } as never });
    await executor.execute(node, {}, ctx);

    expect(compileTemplate).not.toHaveBeenCalled();
    expect(resourceUsageService.endSession).toHaveBeenCalledWith(
      1,
      user,
      { notes: '' },
      { skipFormSubmissions: true, skipNoteNotification: true, auditOrigin: { actorId: null } },
    );
  });

  it('handles undefined node.data by parsing an empty object', async () => {
    const user = { id: 3 };
    resourceUsageService.getActiveSessionsForResource.mockResolvedValue([{ user }] as never);
    resourceUsageService.endSession.mockResolvedValue(undefined as never);

    const node = createNode({ data: undefined as never });
    const result = await executor.execute(node, { foo: 'bar' }, ctx);

    expect(compileTemplate).not.toHaveBeenCalled();
    expect(resourceUsageService.endSession).toHaveBeenCalledWith(
      1,
      user,
      { notes: '' },
      { skipFormSubmissions: true, skipNoteNotification: true, auditOrigin: { actorId: null } },
    );
    expect(result).toEqual({ payload: { foo: 'bar' } });
  });

  describe('on a machine shared by several people', () => {
    const shared = { type: 'machine', maxParallelSessions: 3 };
    const early = { id: 5, user: { id: 1 }, resource: shared };
    const late = { id: 6, user: { id: 2 }, resource: shared };
    beforeEach(() => {
      resourceUsageService.getActiveSessionsForResource.mockResolvedValue([early, late] as never);
      resourceUsageService.endSession.mockResolvedValue(undefined as never);
    });

    it('ends the session that triggered the run', async () => {
      await executor.execute(createNode({ data: { notes: '' } as never }), { id: 5 }, ctx);

      expect(resourceUsageService.endSession).toHaveBeenCalledWith(
        1,
        early.user,
        { notes: '', usageId: 5 },
        expect.anything(),
      );
    });

    it('prefers usageId (button press) over a generic id in the payload', async () => {
      await executor.execute(createNode({ data: { notes: '' } as never }), { usageId: 5, id: 6 }, ctx);

      expect(resourceUsageService.endSession).toHaveBeenCalledWith(
        1,
        early.user,
        { notes: '', usageId: 5 },
        expect.anything(),
      );
    });

    it('ends nobody when the triggering session already ended (e.g. after a wait)', async () => {
      await expect(
        executor.execute(createNode({ data: { notes: '' } as never }), { usageId: 4 }, ctx),
      ).rejects.toBeInstanceOf(NoUsageSessionError);
      expect(resourceUsageService.endSession).not.toHaveBeenCalled();
    });

    it('keeps ending the newest session when the run names no session', async () => {
      await executor.execute(createNode({ data: { notes: '' } as never }), { foo: 'bar' }, ctx);

      expect(resourceUsageService.endSession).toHaveBeenCalledWith(
        1,
        late.user,
        { notes: '', usageId: 6 },
        expect.anything(),
      );
    });
  });

  it('falls back to the newest session on a single-session machine when the payload names no active session', async () => {
    const machine = { type: 'machine', maxParallelSessions: 1 };
    const early = { id: 5, user: { id: 1 }, resource: machine };
    const late = { id: 6, user: { id: 2 }, resource: machine };
    resourceUsageService.getActiveSessionsForResource.mockResolvedValue([early, late] as never);
    resourceUsageService.endSession.mockResolvedValue(undefined as never);

    await executor.execute(createNode({ data: { notes: '' } as never }), { id: 999 }, ctx);

    expect(resourceUsageService.endSession).toHaveBeenCalledWith(
      1,
      late.user,
      { notes: '', usageId: 6 },
      expect.anything(),
    );
  });
});
