import { Logger } from '@nestjs/common';
import { ResourceFlowNode, ResourceFlowVariableScope } from '@attraccess/database-entities';
import { GetVariablesExecutor } from './get-variables.executor';
import { ResourceFlowVariablesService } from '../resource-flow-variables.service';
import { NodeExecutionContext, TemplateVariables } from './node-executor.interface';

function makeNode(partial: Partial<ResourceFlowNode>): ResourceFlowNode {
  return { id: 'n1', type: 'processing.variables.get', resourceId: 42, data: {}, ...partial } as unknown as ResourceFlowNode;
}

describe('GetVariablesExecutor', () => {
  let variablesService: { get: jest.Mock };
  let executor: GetVariablesExecutor;
  let ctx: NodeExecutionContext;
  let warnSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'debug').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);

    variablesService = { get: jest.fn() };
    executor = new GetVariablesExecutor(variablesService as unknown as ResourceFlowVariablesService);

    ctx = {
      transactionManager: undefined,
      compileTemplate: jest.fn((tpl: string) => tpl),
      getTemplateVariables: jest.fn(),
      setTemplateVariables: jest.fn(),
    } as unknown as NodeExecutionContext;
  });

  it('sets the resolved value at the payloadPath and resolves resource scope ownerId from node.resourceId', async () => {
    variablesService.get.mockResolvedValue('the-value');
    const node = makeNode({
      resourceId: 42,
      data: { variables: [{ key: 'myKey', scope: 'resource', payloadPath: 'a.b.c' }] },
    });
    const input = { existing: 1 };

    const result = await executor.execute(node, input, ctx);

    expect(ctx.compileTemplate).toHaveBeenCalledWith('myKey', input);
    expect(variablesService.get).toHaveBeenCalledWith(ResourceFlowVariableScope.RESOURCE, 42, 'myKey');
    expect(result.payload).toEqual({ existing: 1, a: { b: { c: 'the-value' } } });
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('passes ownerId null for global scope', async () => {
    variablesService.get.mockResolvedValue('g');
    const node = makeNode({
      resourceId: 99,
      data: { variables: [{ key: 'gk', scope: 'global', payloadPath: 'out' }] },
    });

    await executor.execute(node, {}, ctx);

    expect(variablesService.get).toHaveBeenCalledWith(ResourceFlowVariableScope.GLOBAL, null, 'gk');
  });

  it('uses the rendered key from compileTemplate when getting the variable', async () => {
    (ctx.compileTemplate as jest.Mock).mockReturnValue('rendered-key');
    variablesService.get.mockResolvedValue('v');
    const node = makeNode({
      data: { variables: [{ key: '{{tpl}}', scope: 'resource', payloadPath: 'p' }] },
    });

    await executor.execute(node, {}, ctx);

    expect(variablesService.get).toHaveBeenCalledWith(ResourceFlowVariableScope.RESOURCE, 42, 'rendered-key');
  });

  it('logs a warning and still sets undefined at path when the variable is missing', async () => {
    variablesService.get.mockResolvedValue(undefined);
    const node = makeNode({
      data: { variables: [{ key: 'missing', scope: 'global', payloadPath: 'x' }] },
    });

    const result = await executor.execute(node, {}, ctx);

    expect(warnSpy).toHaveBeenCalledWith('GET variable miss: global:missing');
    expect(result.payload).toHaveProperty('x', undefined);
    expect(Object.prototype.hasOwnProperty.call(result.payload, 'x')).toBe(true);
  });

  it('processes every variable in the list', async () => {
    variablesService.get.mockResolvedValueOnce('first').mockResolvedValueOnce('second');
    const node = makeNode({
      data: {
        variables: [
          { key: 'k1', scope: 'resource', payloadPath: 'one' },
          { key: 'k2', scope: 'global', payloadPath: 'nested.two' },
        ],
      },
    });

    const result = await executor.execute(node, {}, ctx);

    expect(variablesService.get).toHaveBeenCalledTimes(2);
    expect(result.payload).toEqual({ one: 'first', nested: { two: 'second' } });
  });

  it('does not mutate the original input (clones via JSON round-trip)', async () => {
    variablesService.get.mockResolvedValue('v');
    const node = makeNode({
      data: { variables: [{ key: 'k', scope: 'resource', payloadPath: 'added' }] },
    });
    const input = { keep: true };

    const result = await executor.execute(node, input, ctx);

    expect(input).toEqual({ keep: true });
    expect(result.payload).not.toBe(input);
  });

  it('carries over template variables onto the payload when getTemplateVariables returns an object', async () => {
    variablesService.get.mockResolvedValue('v');
    const vars: TemplateVariables = { resource: { r: 1 }, global: { g: 2 } };
    (ctx.getTemplateVariables as jest.Mock).mockReturnValue(vars);
    const node = makeNode({
      data: { variables: [{ key: 'k', scope: 'resource', payloadPath: 'p' }] },
    });
    const input = { hi: 1 };

    const result = await executor.execute(node, input, ctx);

    expect(ctx.getTemplateVariables).toHaveBeenCalledWith(input);
    expect(ctx.setTemplateVariables).toHaveBeenCalledWith(result.payload, vars);
  });

  it('does not carry over template variables when getTemplateVariables returns undefined', async () => {
    variablesService.get.mockResolvedValue('v');
    (ctx.getTemplateVariables as jest.Mock).mockReturnValue(undefined);
    const node = makeNode({
      data: { variables: [{ key: 'k', scope: 'resource', payloadPath: 'p' }] },
    });

    await executor.execute(node, {}, ctx);

    expect(ctx.setTemplateVariables).not.toHaveBeenCalled();
  });

  it('throws when node.data fails schema validation (empty variables array)', async () => {
    const node = makeNode({ data: { variables: [] } });

    await expect(executor.execute(node, {}, ctx)).rejects.toThrow();
    expect(variablesService.get).not.toHaveBeenCalled();
  });

  it('throws when payloadPath is missing/empty (schema failure)', async () => {
    const node = makeNode({
      data: { variables: [{ key: 'k', scope: 'resource', payloadPath: '' }] },
    });

    await expect(executor.execute(node, {}, ctx)).rejects.toThrow();
  });
});
