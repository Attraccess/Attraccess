import { Logger } from '@nestjs/common';
import { ResourceFlowNode, ResourceFlowVariableScope } from '@attraccess/database-entities';
import { SetVariablesExecutor } from './set-variables.executor';
import { ResourceFlowVariablesService } from '../resource-flow-variables.service';
import { NodeExecutionContext } from './node-executor.interface';

describe('SetVariablesExecutor', () => {
  let executor: SetVariablesExecutor;
  let variablesService: ResourceFlowVariablesService;
  let ctx: NodeExecutionContext;

  const makeNode = (data: object, resourceId = 7): ResourceFlowNode =>
    ({ id: 'n1', type: 'processing.variables.set', resourceId, data } as unknown as ResourceFlowNode);

  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'debug').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);

    variablesService = {
      set: jest.fn(async () => undefined),
    } as unknown as ResourceFlowVariablesService;

    ctx = {
      transactionManager: undefined,
      compileTemplate: jest.fn((tpl) => tpl),
      getTemplateVariables: jest.fn(),
      setTemplateVariables: jest.fn(),
    } as unknown as NodeExecutionContext;

    executor = new SetVariablesExecutor(variablesService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('returns the input as the payload unchanged', async () => {
    const input = { a: 1 };
    const result = await executor.execute(
      makeNode({ variables: [{ key: 'k', value: '"v"', scope: 'global' }] }),
      input,
      ctx,
    );
    expect(result).toEqual({ payload: input });
    expect(result.payload).toBe(input);
  });

  it('compiles key and value templates against the input', async () => {
    const input = { who: 'world' };
    (ctx.compileTemplate as jest.Mock)
      .mockImplementationOnce(() => 'note')
      .mockImplementationOnce(() => 'hello world');

    await executor.execute(
      makeNode({ variables: [{ key: '{{k}}', value: 'hello {{who}}', scope: 'resource' }] }, 7),
      input,
      ctx,
    );

    expect(ctx.compileTemplate).toHaveBeenNthCalledWith(1, '{{k}}', input);
    expect(ctx.compileTemplate).toHaveBeenNthCalledWith(2, 'hello {{who}}', input);
    expect(variablesService.set).toHaveBeenCalledWith(
      ResourceFlowVariableScope.RESOURCE,
      7,
      'note',
      'hello world',
      7,
    );
  });

  it('uses node.resourceId as ownerId for RESOURCE scope', async () => {
    await executor.execute(
      makeNode({ variables: [{ key: 'note', value: '"x"', scope: 'resource' }] }, 42),
      {},
      ctx,
    );

    expect(variablesService.set).toHaveBeenCalledWith(
      ResourceFlowVariableScope.RESOURCE,
      42,
      'note',
      'x',
      42,
    );
  });

  it('uses null ownerId for GLOBAL scope but still passes resourceId as last arg', async () => {
    await executor.execute(
      makeNode({ variables: [{ key: 'count', value: '5', scope: 'global' }] }, 9),
      {},
      ctx,
    );

    expect(variablesService.set).toHaveBeenCalledWith(ResourceFlowVariableScope.GLOBAL, null, 'count', 5, 9);
  });

  it('JSON-parses numeric string values into numbers', async () => {
    await executor.execute(
      makeNode({ variables: [{ key: 'n', value: '123', scope: 'global' }] }),
      {},
      ctx,
    );

    expect(variablesService.set).toHaveBeenCalledWith(ResourceFlowVariableScope.GLOBAL, null, 'n', 123, 7);
  });

  it('JSON-parses object/array JSON strings into structured values', async () => {
    await executor.execute(
      makeNode({
        variables: [
          { key: 'obj', value: '{"a":1,"b":[2,3]}', scope: 'global' },
          { key: 'arr', value: '[1,2,3]', scope: 'resource' },
        ],
      }, 4),
      {},
      ctx,
    );

    expect(variablesService.set).toHaveBeenNthCalledWith(
      1,
      ResourceFlowVariableScope.GLOBAL,
      null,
      'obj',
      { a: 1, b: [2, 3] },
      4,
    );
    expect(variablesService.set).toHaveBeenNthCalledWith(
      2,
      ResourceFlowVariableScope.RESOURCE,
      4,
      'arr',
      [1, 2, 3],
      4,
    );
  });

  it('JSON-parses booleans and null literals', async () => {
    await executor.execute(
      makeNode({
        variables: [
          { key: 'flag', value: 'true', scope: 'global' },
          { key: 'empty', value: 'null', scope: 'global' },
        ],
      }),
      {},
      ctx,
    );

    expect(variablesService.set).toHaveBeenNthCalledWith(1, ResourceFlowVariableScope.GLOBAL, null, 'flag', true, 7);
    expect(variablesService.set).toHaveBeenNthCalledWith(2, ResourceFlowVariableScope.GLOBAL, null, 'empty', null, 7);
  });

  it('keeps invalid JSON values as the raw rendered string', async () => {
    await executor.execute(
      makeNode({ variables: [{ key: 'greeting', value: 'hello world', scope: 'resource' }] }, 3),
      {},
      ctx,
    );

    expect(variablesService.set).toHaveBeenCalledWith(
      ResourceFlowVariableScope.RESOURCE,
      3,
      'greeting',
      'hello world',
      3,
    );
  });

  it('iterates every variable in order, calling set once per entry', async () => {
    await executor.execute(
      makeNode({
        variables: [
          { key: 'a', value: '1', scope: 'global' },
          { key: 'b', value: '2', scope: 'resource' },
          { key: 'c', value: 'raw', scope: 'global' },
        ],
      }, 11),
      {},
      ctx,
    );

    expect(variablesService.set).toHaveBeenCalledTimes(3);
    expect(variablesService.set).toHaveBeenNthCalledWith(1, ResourceFlowVariableScope.GLOBAL, null, 'a', 1, 11);
    expect(variablesService.set).toHaveBeenNthCalledWith(2, ResourceFlowVariableScope.RESOURCE, 11, 'b', 2, 11);
    expect(variablesService.set).toHaveBeenNthCalledWith(3, ResourceFlowVariableScope.GLOBAL, null, 'c', 'raw', 11);
  });

  it('applies the schema default for an omitted value (empty string stays as raw string)', async () => {
    await executor.execute(
      makeNode({ variables: [{ key: 'k', scope: 'global' }] }),
      {},
      ctx,
    );

    // default value '' -> compileTemplate('') -> '' -> JSON.parse('') throws -> raw ''
    expect(variablesService.set).toHaveBeenCalledWith(ResourceFlowVariableScope.GLOBAL, null, 'k', '', 7);
  });

  it('throws when the variables array is empty (min 1)', async () => {
    await expect(executor.execute(makeNode({ variables: [] }), {}, ctx)).rejects.toThrow();
    expect(variablesService.set).not.toHaveBeenCalled();
  });

  it('throws when a variable is missing a required key', async () => {
    await expect(
      executor.execute(makeNode({ variables: [{ value: '1', scope: 'global' }] }), {}, ctx),
    ).rejects.toThrow();
    expect(variablesService.set).not.toHaveBeenCalled();
  });

  it('throws when scope is not one of the allowed values', async () => {
    await expect(
      executor.execute(makeNode({ variables: [{ key: 'k', value: '1', scope: 'session' }] }), {}, ctx),
    ).rejects.toThrow();
    expect(variablesService.set).not.toHaveBeenCalled();
  });

  it('throws when node.data is missing the variables property entirely', async () => {
    await expect(executor.execute(makeNode({}), {}, ctx)).rejects.toThrow();
    expect(variablesService.set).not.toHaveBeenCalled();
  });
});
