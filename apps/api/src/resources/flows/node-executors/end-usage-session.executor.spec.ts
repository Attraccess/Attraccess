import { Logger } from '@nestjs/common';
import { ResourceFlowNode, ResourceFlowNodeType } from '@attraccess/database-entities';
import { ResourceUsageService } from '../../usage/resourceUsage.service';
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
  let resourceUsageService: jest.Mocked<Pick<ResourceUsageService, 'getActiveSession' | 'endSession'>>;
  let ctx: NodeExecutionContext;
  let compileTemplate: jest.Mock;

  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'debug').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);

    resourceUsageService = {
      getActiveSession: jest.fn(),
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
    resourceUsageService.getActiveSession.mockResolvedValue({ user } as never);
    resourceUsageService.endSession.mockResolvedValue(undefined as never);

    const node = createNode({ resourceId: 42 });
    await executor.execute(node, {}, ctx);

    expect(resourceUsageService.getActiveSession).toHaveBeenCalledWith(42, false, txManager);
  });

  it('throws NoUsageSessionError when there is no active session', async () => {
    resourceUsageService.getActiveSession.mockResolvedValue(null as never);

    await expect(executor.execute(createNode({}), {}, ctx)).rejects.toBeInstanceOf(NoUsageSessionError);
    expect(resourceUsageService.endSession).not.toHaveBeenCalled();
  });

  it('throws FlowExecutionError when the active session has no owner user', async () => {
    resourceUsageService.getActiveSession.mockResolvedValue({ user: null } as never);

    await expect(executor.execute(createNode({}), {}, ctx)).rejects.toBeInstanceOf(FlowExecutionError);
    await expect(executor.execute(createNode({}), {}, ctx)).rejects.toThrow(
      'FLOW_EXECUTION_ERROR: Active session has no owner user; cannot end',
    );
    expect(resourceUsageService.endSession).not.toHaveBeenCalled();
  });

  it('compiles the notes template and ends the session with the compiled result', async () => {
    const user = { id: 7 };
    resourceUsageService.getActiveSession.mockResolvedValue({ user } as never);
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
      { skipFormSubmissions: true, skipNoteNotification: true },
    );
    expect(result).toEqual({ payload: input });
  });

  it('falls back to the raw notes when the compiled template is only whitespace', async () => {
    const user = { id: 9 };
    resourceUsageService.getActiveSession.mockResolvedValue({ user } as never);
    resourceUsageService.endSession.mockResolvedValue(undefined as never);
    compileTemplate.mockImplementation(() => '   ');

    const node = createNode({ data: { notes: 'raw value' } as never });
    await executor.execute(node, {}, ctx);

    expect(resourceUsageService.endSession).toHaveBeenCalledWith(
      1,
      user,
      { notes: 'raw value' },
      { skipFormSubmissions: true, skipNoteNotification: true },
    );
  });

  it('passes empty notes when no notes are configured and does not compile', async () => {
    const user = { id: 3 };
    resourceUsageService.getActiveSession.mockResolvedValue({ user } as never);
    resourceUsageService.endSession.mockResolvedValue(undefined as never);

    const node = createNode({ data: {} as never });
    await executor.execute(node, {}, ctx);

    expect(compileTemplate).not.toHaveBeenCalled();
    expect(resourceUsageService.endSession).toHaveBeenCalledWith(
      1,
      user,
      { notes: '' },
      { skipFormSubmissions: true, skipNoteNotification: true },
    );
  });

  it('passes empty notes when the configured notes string is empty and does not compile', async () => {
    const user = { id: 3 };
    resourceUsageService.getActiveSession.mockResolvedValue({ user } as never);
    resourceUsageService.endSession.mockResolvedValue(undefined as never);

    const node = createNode({ data: { notes: '' } as never });
    await executor.execute(node, {}, ctx);

    expect(compileTemplate).not.toHaveBeenCalled();
    expect(resourceUsageService.endSession).toHaveBeenCalledWith(
      1,
      user,
      { notes: '' },
      { skipFormSubmissions: true, skipNoteNotification: true },
    );
  });

  it('handles undefined node.data by parsing an empty object', async () => {
    const user = { id: 3 };
    resourceUsageService.getActiveSession.mockResolvedValue({ user } as never);
    resourceUsageService.endSession.mockResolvedValue(undefined as never);

    const node = createNode({ data: undefined as never });
    const result = await executor.execute(node, { foo: 'bar' }, ctx);

    expect(compileTemplate).not.toHaveBeenCalled();
    expect(resourceUsageService.endSession).toHaveBeenCalledWith(
      1,
      user,
      { notes: '' },
      { skipFormSubmissions: true, skipNoteNotification: true },
    );
    expect(result).toEqual({ payload: { foo: 'bar' } });
  });
});
