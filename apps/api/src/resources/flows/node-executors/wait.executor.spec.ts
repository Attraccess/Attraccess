import { Logger } from '@nestjs/common';
import { ResourceFlowNode, ResourceFlowNodeType } from '@attraccess/database-entities';
import { WaitExecutor } from './wait.executor';

describe('WaitExecutor', () => {
  let executor: WaitExecutor;

  const makeNode = (data: { duration: number; unit: 'seconds' | 'minutes' | 'hours' }): ResourceFlowNode =>
    ({
      id: 'n1',
      type: ResourceFlowNodeType.PROCESSING_WAIT,
      resourceId: 1,
      data,
    } as unknown as ResourceFlowNode);

  beforeEach(() => {
    jest.useFakeTimers();
    jest.spyOn(Logger.prototype, 'debug').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    executor = new WaitExecutor();
  });

  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('waits duration * 1000 ms for seconds and resolves with { payload: input }', async () => {
    const input = { foo: 'bar' };
    const resolved = jest.fn();
    const promise = executor.execute(makeNode({ duration: 3, unit: 'seconds' }), input).then(resolved);

    // Not yet resolved before the exact duration elapses.
    await jest.advanceTimersByTimeAsync(2999);
    expect(resolved).not.toHaveBeenCalled();

    await jest.advanceTimersByTimeAsync(1);
    await promise;

    expect(resolved).toHaveBeenCalledTimes(1);
    expect(resolved).toHaveBeenCalledWith({ payload: input });
  });

  it('multiplies by 60 for minutes', async () => {
    const input = { hello: 'world' };
    const resolved = jest.fn();
    const promise = executor.execute(makeNode({ duration: 2, unit: 'minutes' }), input);
    promise.then(resolved);

    // 2 minutes = 120_000 ms.
    await jest.advanceTimersByTimeAsync(119999);
    expect(resolved).not.toHaveBeenCalled();

    await jest.advanceTimersByTimeAsync(1);
    const result = await promise;

    expect(resolved).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ payload: input });
  });

  it('multiplies by 3600 for hours', async () => {
    const input = { a: 1 };
    const resolved = jest.fn();
    const promise = executor.execute(makeNode({ duration: 1, unit: 'hours' }), input).then(resolved);

    // 1 hour = 3_600_000 ms.
    await jest.advanceTimersByTimeAsync(3599999);
    expect(resolved).not.toHaveBeenCalled();

    await jest.advanceTimersByTimeAsync(1);
    await promise;

    expect(resolved).toHaveBeenCalledTimes(1);
    expect(resolved).toHaveBeenCalledWith({ payload: input });
  });

  it('returns the exact input object reference as payload', async () => {
    const input = { ref: Symbol('x') };
    const promise = executor.execute(makeNode({ duration: 1, unit: 'seconds' }), input);
    await jest.advanceTimersByTimeAsync(1000);
    const result = await promise;
    expect(result.payload).toBe(input);
  });
});
