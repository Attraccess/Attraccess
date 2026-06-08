import { Logger } from '@nestjs/common';
import { ResourceFlowNode, ResourceFlowNodeType } from '@attraccess/database-entities';
import { SetPayloadExecutor } from './set-payload.executor';
import { NodeExecutionContext } from './node-executor.interface';

function makeCtx(overrides: Partial<NodeExecutionContext> = {}): NodeExecutionContext {
  return {
    transactionManager: undefined,
    compileTemplate: jest.fn((tpl: string) => tpl),
    getTemplateVariables: jest.fn(),
    setTemplateVariables: jest.fn(),
    ...overrides,
  } as unknown as NodeExecutionContext;
}

function makeNode(data: unknown): ResourceFlowNode {
  return {
    id: 'n1',
    type: ResourceFlowNodeType.PROCESSING_SET_PAYLOAD,
    resourceId: 1,
    data,
  } as unknown as ResourceFlowNode;
}

describe('SetPayloadExecutor', () => {
  let executor: SetPayloadExecutor;

  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'debug').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    executor = new SetPayloadExecutor();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('sets a top-level key using the compiled template value', async () => {
    const ctx = makeCtx({ compileTemplate: jest.fn(() => 'compiled-value') });
    const node = makeNode({ entries: [{ key: 'greeting', value: 'tpl' }] });
    const input = { existing: true };

    const result = await executor.execute(node, input, ctx);

    expect(ctx.compileTemplate).toHaveBeenCalledWith('tpl', input);
    expect(result.payload).toEqual({ existing: true, greeting: 'compiled-value' });
  });

  it('sets a nested key path via lodash set', async () => {
    const ctx = makeCtx({ compileTemplate: jest.fn(() => 'deep') });
    const node = makeNode({ entries: [{ key: 'a.b.c', value: '{{x}}' }] });

    const result = await executor.execute(node, {}, ctx);

    expect(result.payload).toEqual({ a: { b: { c: 'deep' } } });
  });

  it('calls compileTemplate once per entry and applies each result', async () => {
    const compileTemplate = jest
      .fn()
      .mockReturnValueOnce('first')
      .mockReturnValueOnce('second');
    const ctx = makeCtx({ compileTemplate });
    const node = makeNode({
      entries: [
        { key: 'one', value: 'tpl1' },
        { key: 'nested.two', value: 'tpl2' },
      ],
    });
    const input = { keep: 'me' };

    const result = await executor.execute(node, input, ctx);

    expect(compileTemplate).toHaveBeenCalledTimes(2);
    expect(compileTemplate).toHaveBeenNthCalledWith(1, 'tpl1', input);
    expect(compileTemplate).toHaveBeenNthCalledWith(2, 'tpl2', input);
    expect(result.payload).toEqual({ keep: 'me', one: 'first', nested: { two: 'second' } });
  });

  it('deep-clones the input so the original payload is not mutated', async () => {
    const ctx = makeCtx({ compileTemplate: jest.fn(() => 'mutated') });
    const node = makeNode({ entries: [{ key: 'nested.value', value: 'v' }] });
    const input = { nested: { value: 'original' } };

    const result = await executor.execute(node, input, ctx);

    expect(input).toEqual({ nested: { value: 'original' } });
    expect(result.payload).toEqual({ nested: { value: 'mutated' } });
    expect((result.payload as { nested: object }).nested).not.toBe(input.nested);
  });

  it('returns a clone of the input unchanged when entries is missing (defaults to [])', async () => {
    const ctx = makeCtx();
    const node = makeNode({});
    const input = { a: 1 };

    const result = await executor.execute(node, input, ctx);

    expect(ctx.compileTemplate).not.toHaveBeenCalled();
    expect(result.payload).toEqual({ a: 1 });
    expect(result.payload).not.toBe(input);
  });

  it('returns an empty object when entries is missing and input is empty', async () => {
    const ctx = makeCtx();
    const node = makeNode({});

    const result = await executor.execute(node, {}, ctx);

    expect(result.payload).toEqual({});
  });

  it('falls back to {} base when input is null', async () => {
    const ctx = makeCtx({ compileTemplate: jest.fn(() => 'val') });
    const node = makeNode({ entries: [{ key: 'k', value: 't' }] });

    const result = await executor.execute(node, null as unknown as object, ctx);

    expect(ctx.compileTemplate).toHaveBeenCalledWith('t', null);
    expect(result.payload).toEqual({ k: 'val' });
  });

  it('falls back to {} base when input is undefined', async () => {
    const ctx = makeCtx({ compileTemplate: jest.fn(() => 'val') });
    const node = makeNode({ entries: [{ key: 'k', value: 't' }] });

    const result = await executor.execute(node, undefined as unknown as object, ctx);

    expect(result.payload).toEqual({ k: 'val' });
  });

  it('passes empty string to compileTemplate when entry value is undefined', async () => {
    const ctx = makeCtx({ compileTemplate: jest.fn(() => 'resolved') });
    const node = makeNode({ entries: [{ key: 'k', value: undefined }] });

    const result = await executor.execute(node, {}, ctx);

    expect(ctx.compileTemplate).toHaveBeenCalledWith('', {});
    expect(result.payload).toEqual({ k: 'resolved' });
  });
});
