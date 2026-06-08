import { Logger } from '@nestjs/common';
import { ResourceFlowNode, ResourceFlowNodeType } from '@attraccess/database-entities';
import { PassthroughExecutor } from './passthrough.executor';
import { NodeExecutionContext } from './node-executor.interface';

describe('PassthroughExecutor', () => {
  let executor: PassthroughExecutor;

  const ctx = {
    transactionManager: undefined,
    compileTemplate: jest.fn((tpl: string) => tpl),
    getTemplateVariables: jest.fn(),
    setTemplateVariables: jest.fn(),
  } as unknown as NodeExecutionContext;

  const node = {
    id: 'n1',
    type: ResourceFlowNodeType.INPUT_BUTTON,
    resourceId: 1,
    data: {},
  } as unknown as ResourceFlowNode;

  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'debug').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    executor = new PassthroughExecutor();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('returns the input as the payload by identity (same reference)', async () => {
    const input = { foo: 'bar', nested: { a: 1 } };

    const result = await executor.execute(node, input);

    expect(result).toEqual({ payload: input });
    expect(result.payload).toBe(input);
    expect(result.outputHandle).toBeUndefined();
  });

  it('passes through an empty object unchanged', async () => {
    const input = {};

    const result = await executor.execute(node, input);

    expect(result.payload).toBe(input);
  });

  it('passes through an arbitrary array payload by reference', async () => {
    const input = [1, 2, 3] as unknown as object;

    const result = await executor.execute(node, input);

    expect(result.payload).toBe(input);
  });

  it('does not touch the template helpers on the context', async () => {
    await executor.execute(node, { any: 'thing' });

    expect(ctx.compileTemplate).not.toHaveBeenCalled();
    expect(ctx.getTemplateVariables).not.toHaveBeenCalled();
    expect(ctx.setTemplateVariables).not.toHaveBeenCalled();
  });

  it('ignores the node argument', async () => {
    const input = { value: 42 };

    const result = await executor.execute(undefined as unknown as ResourceFlowNode, input);

    expect(result.payload).toBe(input);
  });
});
