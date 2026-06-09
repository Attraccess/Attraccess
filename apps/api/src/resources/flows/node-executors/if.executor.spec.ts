import { Logger } from '@nestjs/common';
import { ResourceFlowNode, ResourceFlowNodeType } from '@attraccess/database-entities';
import { IfExecutor } from './if.executor';
import { FlowExecutionError } from '../errors/flow-execution.error';

function makeNode(data: Record<string, unknown>): ResourceFlowNode {
  return {
    id: 'n1',
    type: ResourceFlowNodeType.PROCESSING_IF,
    resourceId: 1,
    data,
  } as unknown as ResourceFlowNode;
}

describe('IfExecutor', () => {
  let executor: IfExecutor;

  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'debug').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    executor = new IfExecutor();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('= operator', () => {
    it('returns output-true when string values are equal', async () => {
      const node = makeNode({ path: 'a', comparisonOperator: '=', comparisonValue: 'hello', comparisonValueIsPath: false });
      const input = { a: 'hello' };
      const result = await executor.execute(node, input);
      expect(result).toEqual({ payload: input, outputHandle: 'output-true' });
    });

    it('returns output-false when values differ', async () => {
      const node = makeNode({ path: 'a', comparisonOperator: '=', comparisonValue: 'hello', comparisonValueIsPath: false });
      const result = await executor.execute(node, { a: 'world' });
      expect(result.outputHandle).toBe('output-false');
    });
  });

  describe('!= operator', () => {
    it('returns output-true when values differ', async () => {
      const node = makeNode({ path: 'a', comparisonOperator: '!=', comparisonValue: 'hello', comparisonValueIsPath: false });
      const result = await executor.execute(node, { a: 'world' });
      expect(result.outputHandle).toBe('output-true');
    });

    it('returns output-false when values are equal', async () => {
      const node = makeNode({ path: 'a', comparisonOperator: '!=', comparisonValue: 'hello', comparisonValueIsPath: false });
      const result = await executor.execute(node, { a: 'hello' });
      expect(result.outputHandle).toBe('output-false');
    });
  });

  describe('> operator', () => {
    it('returns output-true when comparisonValue > sourceValue', async () => {
      const node = makeNode({ path: 'a', comparisonOperator: '>', comparisonValue: '10', comparisonValueIsPath: false });
      const result = await executor.execute(node, { a: 5 });
      expect(result.outputHandle).toBe('output-true');
    });

    it('returns output-false when comparisonValue <= sourceValue', async () => {
      const node = makeNode({ path: 'a', comparisonOperator: '>', comparisonValue: '5', comparisonValueIsPath: false });
      const result = await executor.execute(node, { a: 10 });
      expect(result.outputHandle).toBe('output-false');
    });
  });

  describe('< operator', () => {
    it('returns output-true when comparisonValue < sourceValue', async () => {
      const node = makeNode({ path: 'a', comparisonOperator: '<', comparisonValue: '5', comparisonValueIsPath: false });
      const result = await executor.execute(node, { a: 10 });
      expect(result.outputHandle).toBe('output-true');
    });

    it('returns output-false when comparisonValue >= sourceValue', async () => {
      const node = makeNode({ path: 'a', comparisonOperator: '<', comparisonValue: '10', comparisonValueIsPath: false });
      const result = await executor.execute(node, { a: 5 });
      expect(result.outputHandle).toBe('output-false');
    });
  });

  describe('>= operator', () => {
    it('returns output-true when comparisonValue >= sourceValue (equal)', async () => {
      const node = makeNode({ path: 'a', comparisonOperator: '>=', comparisonValue: '5', comparisonValueIsPath: false });
      const result = await executor.execute(node, { a: 5 });
      expect(result.outputHandle).toBe('output-true');
    });

    it('returns output-false when comparisonValue < sourceValue', async () => {
      const node = makeNode({ path: 'a', comparisonOperator: '>=', comparisonValue: '4', comparisonValueIsPath: false });
      const result = await executor.execute(node, { a: 5 });
      expect(result.outputHandle).toBe('output-false');
    });
  });

  describe('<= operator', () => {
    it('returns output-true when comparisonValue <= sourceValue (equal)', async () => {
      const node = makeNode({ path: 'a', comparisonOperator: '<=', comparisonValue: '5', comparisonValueIsPath: false });
      const result = await executor.execute(node, { a: 5 });
      expect(result.outputHandle).toBe('output-true');
    });

    it('returns output-false when comparisonValue > sourceValue', async () => {
      const node = makeNode({ path: 'a', comparisonOperator: '<=', comparisonValue: '6', comparisonValueIsPath: false });
      const result = await executor.execute(node, { a: 5 });
      expect(result.outputHandle).toBe('output-false');
    });
  });

  describe('comparisonValueIsPath', () => {
    it('resolves comparisonValue from input via path when true', async () => {
      const node = makeNode({ path: 'a', comparisonOperator: '=', comparisonValue: 'b', comparisonValueIsPath: true });
      const result = await executor.execute(node, { a: 'x', b: 'x' });
      expect(result.outputHandle).toBe('output-true');
    });

    it('returns output-false when resolved comparison path differs from source', async () => {
      const node = makeNode({ path: 'a', comparisonOperator: '=', comparisonValue: 'b', comparisonValueIsPath: true });
      const result = await executor.execute(node, { a: 'x', b: 'y' });
      expect(result.outputHandle).toBe('output-false');
    });
  });

  describe('missing path defaults to ""', () => {
    it('treats a missing source path as empty string', async () => {
      const node = makeNode({ path: 'missing', comparisonOperator: '=', comparisonValue: '', comparisonValueIsPath: false });
      const result = await executor.execute(node, { a: 'x' });
      expect(result.outputHandle).toBe('output-true');
    });

    it('treats a missing comparison path as empty string when comparisonValueIsPath', async () => {
      const node = makeNode({ path: 'a', comparisonOperator: '=', comparisonValue: 'missing', comparisonValueIsPath: true });
      const result = await executor.execute(node, { a: '' });
      expect(result.outputHandle).toBe('output-true');
    });
  });

  describe('unknown operator', () => {
    it('throws FlowExecutionError on the default branch', async () => {
      const node = makeNode({ path: 'a', comparisonOperator: '??', comparisonValue: '1', comparisonValueIsPath: false });
      await expect(executor.execute(node, { a: 1 })).rejects.toBeInstanceOf(FlowExecutionError);
      await expect(executor.execute(node, { a: 1 })).rejects.toThrow(
        'FLOW_EXECUTION_ERROR: Unknown comparison operator: ??'
      );
    });
  });
});
