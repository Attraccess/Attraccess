import { Logger } from '@nestjs/common';
import { ResourceFlowNode, ResourceFlowNodeType } from '@attraccess/database-entities';
import { ResourceHealthService } from '../../health/resource-health.service';
import { FlowExecutionError } from '../errors/flow-execution.error';
import { HealthSetExecutor } from './health-set.executor';
import { NodeExecutionContext } from './node-executor.interface';

function createNode(data: object, resourceId = 1): ResourceFlowNode {
  return {
    id: 'health-set-1',
    type: ResourceFlowNodeType.OUTPUT_RESOURCE_HEALTH_SET,
    resourceId,
    data,
  } as unknown as ResourceFlowNode;
}

describe('HealthSetExecutor', () => {
  let executor: HealthSetExecutor;
  let resourceHealthService: ResourceHealthService;
  let ctx: NodeExecutionContext;

  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'debug').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);

    resourceHealthService = {
      reportHealth: jest.fn(async () => undefined),
    } as unknown as ResourceHealthService;

    executor = new HealthSetExecutor(resourceHealthService);

    ctx = {
      transactionManager: undefined,
      compileTemplate: jest.fn((tpl: string) => tpl),
      getTemplateVariables: jest.fn(),
      setTemplateVariables: jest.fn(),
    } as unknown as NodeExecutionContext;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('reports healthy from static config: reason null, source MANUAL, identifier compiled', async () => {
    const node = createNode({ identifier: 'Shelly', status: 'healthy', reason: 'should be ignored' }, 7);
    const input = { foo: 'bar' };

    const result = await executor.execute(node, input, ctx);

    expect(ctx.compileTemplate).toHaveBeenCalledWith('Shelly', input);
    expect(resourceHealthService.reportHealth).toHaveBeenCalledWith({
      resourceId: 7,
      identifier: 'Shelly',
      status: 'healthy',
      reason: null,
      source: 'manual',
    });
    expect(result).toEqual({ payload: input });
  });

  it('reports unhealthy from static config using compiled static reason and MANUAL source', async () => {
    (ctx.compileTemplate as jest.Mock).mockImplementation((tpl: string, data: { temp?: number }) =>
      tpl === 'temp={{temp}}' ? `temp=${data.temp}` : tpl,
    );
    const node = createNode({ identifier: 'Internal', status: 'unhealthy', reason: 'temp={{temp}}' });
    const input = { temp: 91 };

    await executor.execute(node, input, ctx);

    expect(resourceHealthService.reportHealth).toHaveBeenCalledWith({
      resourceId: 1,
      identifier: 'Internal',
      status: 'unhealthy',
      reason: 'temp=91',
      source: 'manual',
    });
  });

  it('payload health.status override switches source to PAYLOAD and uses payload reason', async () => {
    const node = createNode({ identifier: 'Shelly', status: 'healthy', reason: 'fallback' });
    const input = { health: { status: 'unhealthy', reason: 'lost wifi' } };

    await executor.execute(node, input, ctx);

    expect(resourceHealthService.reportHealth).toHaveBeenCalledWith({
      resourceId: 1,
      identifier: 'Shelly',
      status: 'unhealthy',
      reason: 'lost wifi',
      source: 'payload',
    });
  });

  it('payload health.identifier override replaces compiled static identifier', async () => {
    const node = createNode({ identifier: 'StaticId', status: 'unhealthy', reason: 'static reason' });
    const input = { health: { identifier: 'PayloadId' } };

    await executor.execute(node, input, ctx);

    // identifier override path bypasses compileTemplate for identifier
    expect(ctx.compileTemplate).not.toHaveBeenCalledWith('StaticId', input);
    expect(resourceHealthService.reportHealth).toHaveBeenCalledWith(
      expect.objectContaining({ identifier: 'PayloadId', status: 'unhealthy' }),
    );
  });

  it('uses compiled static reason when payload reason absent on unhealthy status', async () => {
    const node = createNode({ identifier: '', status: 'unhealthy', reason: 'static fallback' });
    const input = {};

    await executor.execute(node, input, ctx);

    expect(ctx.compileTemplate).toHaveBeenCalledWith('static fallback', input);
    expect(resourceHealthService.reportHealth).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'unhealthy', reason: 'static fallback', source: 'manual' }),
    );
  });

  it('ignores empty-string payload identifier override and falls back to compiled static identifier', async () => {
    const node = createNode({ identifier: 'StaticId', status: 'healthy', reason: '' });
    const input = { health: { identifier: '' } };

    await executor.execute(node, input, ctx);

    expect(ctx.compileTemplate).toHaveBeenCalledWith('StaticId', input);
    expect(resourceHealthService.reportHealth).toHaveBeenCalledWith(
      expect.objectContaining({ identifier: 'StaticId' }),
    );
  });

  it('ignores empty-string payload status override and keeps MANUAL source', async () => {
    const node = createNode({ identifier: '', status: 'healthy', reason: '' });
    const input = { health: { status: '' } };

    await executor.execute(node, input, ctx);

    expect(resourceHealthService.reportHealth).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'healthy', source: 'manual' }),
    );
  });

  it('throws FlowExecutionError on invalid payload status', async () => {
    const node = createNode({ identifier: '', status: 'healthy', reason: '' });
    const input = { health: { status: 'maybe' } };

    await expect(executor.execute(node, input, ctx)).rejects.toBeInstanceOf(FlowExecutionError);
    await expect(executor.execute(node, input, ctx)).rejects.toThrow(/expected "healthy" or "unhealthy"/);
    expect(resourceHealthService.reportHealth).not.toHaveBeenCalled();
  });

  it('throws FlowExecutionError when node data fails schema validation', async () => {
    // status is required by the schema; "invalid" is not a valid enum value
    const node = createNode({ identifier: 'x', status: 'invalid', reason: '' });

    await expect(executor.execute(node, {}, ctx)).rejects.toBeInstanceOf(FlowExecutionError);
    await expect(executor.execute(node, {}, ctx)).rejects.toThrow(/Invalid health-set node data/);
    expect(resourceHealthService.reportHealth).not.toHaveBeenCalled();
  });

  it('defaults identifier/reason to empty string when omitted and applies schema defaults', async () => {
    const node = createNode({ status: 'healthy' });
    const input = {};

    await executor.execute(node, input, ctx);

    // default identifier '' compiled
    expect(ctx.compileTemplate).toHaveBeenCalledWith('', input);
    expect(resourceHealthService.reportHealth).toHaveBeenCalledWith({
      resourceId: 1,
      identifier: '',
      status: 'healthy',
      reason: null,
      source: 'manual',
    });
  });

  it('throws FlowExecutionError when node.data is missing entirely (status required)', async () => {
    const node = { id: 'n', type: ResourceFlowNodeType.OUTPUT_RESOURCE_HEALTH_SET, resourceId: 1 } as unknown as ResourceFlowNode;

    await expect(executor.execute(node, {}, ctx)).rejects.toBeInstanceOf(FlowExecutionError);
    expect(resourceHealthService.reportHealth).not.toHaveBeenCalled();
  });
});
