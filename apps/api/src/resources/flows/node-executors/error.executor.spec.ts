import { Logger } from '@nestjs/common';
import { ResourceFlowNode, ResourceFlowNodeType } from '@attraccess/database-entities';
import { ErrorExecutor } from './error.executor';
import { NodeExecutionContext } from './node-executor.interface';
import { FlowExecutionError } from '../errors/flow-execution.error';

function createCtx(overrides: Partial<NodeExecutionContext> = {}): NodeExecutionContext {
  return {
    transactionManager: undefined,
    compileTemplate: jest.fn((tpl: string) => tpl),
    getTemplateVariables: jest.fn(),
    setTemplateVariables: jest.fn(),
    ...overrides,
  } as unknown as NodeExecutionContext;
}

function createNode(data: object): ResourceFlowNode {
  return {
    id: 'n1',
    type: ResourceFlowNodeType.PROCESSING_ERROR,
    resourceId: 1,
    data,
  } as unknown as ResourceFlowNode;
}

describe('ErrorExecutor', () => {
  let executor: ErrorExecutor;

  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'debug').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    executor = new ErrorExecutor();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('compiles the message template with the input and throws a FlowExecutionError', async () => {
    const ctx = createCtx({
      compileTemplate: jest.fn(() => 'Something went wrong: 42'),
    });
    const node = createNode({ message: 'Something went wrong: {{value}}' });
    const input = { value: 42 };

    await expect(executor.execute(node, input, ctx)).rejects.toBeInstanceOf(FlowExecutionError);

    expect(ctx.compileTemplate).toHaveBeenCalledTimes(1);
    expect(ctx.compileTemplate).toHaveBeenCalledWith('Something went wrong: {{value}}', input);
  });

  it('prefixes the compiled message with FLOW_EXECUTION_ERROR', async () => {
    const ctx = createCtx({
      compileTemplate: jest.fn(() => 'boom'),
    });
    const node = createNode({ message: 'tpl' });

    await expect(executor.execute(node, {}, ctx)).rejects.toThrow('FLOW_EXECUTION_ERROR: boom');
  });

  it('throws the raw (uncompiled) template when compileTemplate echoes it', async () => {
    const ctx = createCtx(); // echo compileTemplate
    const node = createNode({ message: 'plain failure message' });

    await expect(executor.execute(node, {}, ctx)).rejects.toThrow(
      'FLOW_EXECUTION_ERROR: plain failure message'
    );
    expect(ctx.compileTemplate).toHaveBeenCalledWith('plain failure message', {});
  });

  it('passes the exact input object through to compileTemplate as the data argument', async () => {
    const ctx = createCtx();
    const node = createNode({ message: '{{a}}-{{b}}' });
    const input = { a: 'x', b: 'y' };

    await expect(executor.execute(node, input, ctx)).rejects.toBeInstanceOf(FlowExecutionError);

    const [, dataArg] = (ctx.compileTemplate as jest.Mock).mock.calls[0];
    expect(dataArg).toBe(input);
  });
});
