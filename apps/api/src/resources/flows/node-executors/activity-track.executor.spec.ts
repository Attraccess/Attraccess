import { Logger } from '@nestjs/common';
import { Resource, ResourceFlowNode, ResourceFlowNodeType } from '@attraccess/database-entities';
import { ActivityTrackExecutor } from './activity-track.executor';

function createNode(partial: Partial<ResourceFlowNode>): ResourceFlowNode {
  return {
    id: 'n1',
    type: ResourceFlowNodeType.INPUT_BUTTON,
    resourceId: 1,
    data: {},
    ...partial,
  } as unknown as ResourceFlowNode;
}

describe('ActivityTrackExecutor', () => {
  let resourceActivity: Map<Resource['id'], Date>;
  let executor: ActivityTrackExecutor;

  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'debug').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);

    resourceActivity = new Map<Resource['id'], Date>();
    executor = new ActivityTrackExecutor(resourceActivity);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('stamps the injected map at node.resourceId with a Date instance', async () => {
    const node = createNode({ resourceId: 42 });

    await executor.execute(node, {});

    expect(resourceActivity.has(42)).toBe(true);
    expect(resourceActivity.get(42)).toBeInstanceOf(Date);
  });

  it('uses the current timestamp when stamping', async () => {
    jest.useFakeTimers();
    const now = new Date('2026-06-07T12:00:00.000Z');
    jest.setSystemTime(now);

    const node = createNode({ resourceId: 7 });

    try {
      await executor.execute(node, {});
      expect(resourceActivity.get(7)?.getTime()).toBe(now.getTime());
    } finally {
      jest.useRealTimers();
    }
  });

  it('returns the input as the payload', async () => {
    const node = createNode({ resourceId: 1 });
    const input = { foo: 'bar', count: 3 };

    const result = await executor.execute(node, input);

    expect(result).toEqual({ payload: input });
    expect(result.payload).toBe(input);
    expect(result.outputHandle).toBeUndefined();
  });

  it('overwrites a previous timestamp for the same resourceId', async () => {
    const node = createNode({ resourceId: 5 });

    await executor.execute(node, {});
    const first = resourceActivity.get(5);

    // ensure a measurable difference in time
    jest.useFakeTimers();
    jest.setSystemTime(new Date((first as Date).getTime() + 1000));
    try {
      await executor.execute(node, {});
    } finally {
      jest.useRealTimers();
    }

    const second = resourceActivity.get(5);
    expect(second).toBeInstanceOf(Date);
    expect((second as Date).getTime()).toBeGreaterThan((first as Date).getTime());
    expect(resourceActivity.size).toBe(1);
  });

  it('tracks distinct resourceIds independently in the shared map', async () => {
    await executor.execute(createNode({ resourceId: 1 }), {});
    await executor.execute(createNode({ resourceId: 2 }), {});

    expect(resourceActivity.size).toBe(2);
    expect(resourceActivity.get(1)).toBeInstanceOf(Date);
    expect(resourceActivity.get(2)).toBeInstanceOf(Date);
  });
});
