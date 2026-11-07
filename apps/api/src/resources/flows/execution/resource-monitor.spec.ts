import { Logger } from '@nestjs/common';
import { ResourceFlowNode, ResourceFlowNodeType } from '@attraccess/database-entities';
import { FlowResourceMonitor } from './resource-monitor';

const noActivityNode = (id: string, minInactivityMinutes: number, extra: Partial<ResourceFlowNode> = {}) =>
  ({
    id,
    type: ResourceFlowNodeType.INPUT_RESOURCE_ACTIVITY_NO_ACTIVITY,
    data: { minInactivityMinutes },
    resourceId: null,
    flowId: null,
    ...extra,
  }) as unknown as ResourceFlowNode;

function build(resourceNodes: ResourceFlowNode[], globalNodes: ResourceFlowNode[], activeResourceIds: number[]) {
  const queryBuilder = {
    innerJoin: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    distinct: jest.fn().mockReturnThis(),
    getMany: jest.fn(async () => resourceNodes),
  };
  const usageQueryBuilder = {
    select: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    distinct: jest.fn().mockReturnThis(),
    getRawMany: jest.fn(async () => activeResourceIds.map((resourceId) => ({ resourceId }))),
  };
  const repository = {
    createQueryBuilder: jest.fn(() => queryBuilder),
    find: jest.fn(async () => globalNodes),
    manager: { createQueryBuilder: jest.fn(() => usageQueryBuilder) },
  };
  const activity = new Map<number, Date>();
  const heartbeats = new Map<string, Date>();
  const startFlow = jest.fn(async () => []);
  const health = { reportHealth: jest.fn(async () => undefined) };
  const monitor = new FlowResourceMonitor(
    repository as never,
    activity,
    heartbeats,
    health as never,
    { time: (_name: string, fn: () => Promise<void>) => fn() } as never,
    startFlow,
    new Logger('test'),
  );
  return { monitor, activity, heartbeats, startFlow, health };
}

describe('FlowResourceMonitor no-activity schedules', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-01-01T12:00:00Z'));
    jest.spyOn(Logger.prototype, 'debug').mockImplementation(() => undefined);
  });
  afterEach(() => jest.useRealTimers());

  const minutes = (n: number) => new Date(Date.now() - n * 60_000);

  it('fires a global node for every machine with an active session, with that machine as triggering resource', async () => {
    const global = noActivityNode('g', 5, { flowId: 1 });
    const { monitor, activity, startFlow } = build([], [global], [10, 11]);
    activity.set(10, minutes(6));
    activity.set(11, minutes(6));

    await monitor.checkResourceActivity();

    expect(startFlow).toHaveBeenCalledWith(global, { payload: {} }, { triggeringResourceId: 10 });
    expect(startFlow).toHaveBeenCalledWith(global, { payload: {} }, { triggeringResourceId: 11 });
  });

  it('keeps global and resource no-activity nodes on the same machine on their own schedules', async () => {
    const own = noActivityNode('own', 5, { resourceId: 10 });
    const global = noActivityNode('g', 10, { flowId: 1 });
    const { monitor, activity, startFlow } = build([own], [global], [10]);
    activity.set(10, minutes(6));

    await monitor.checkResourceActivity();
    expect(startFlow.mock.calls.map(([node]) => (node as ResourceFlowNode).id)).toEqual(['own']);

    // The resource node fired at minute 6; at minute 11 it fires again and the global node fires for the first time.
    jest.setSystemTime(new Date(Date.now() + 5 * 60_000));
    await monitor.checkResourceActivity();
    expect(startFlow.mock.calls.map(([node]) => (node as ResourceFlowNode).id)).toEqual(['own', 'own', 'g']);

    // Neither firing touched the resource's last activity.
    expect(activity.get(10)).toEqual(minutes(11));
  });

  it('restarts the countdown on activity', async () => {
    const global = noActivityNode('g', 5, { flowId: 1 });
    const { monitor, activity, startFlow } = build([], [global], [10]);
    activity.set(10, minutes(6));
    await monitor.checkResourceActivity();
    activity.set(10, new Date());
    await monitor.checkResourceActivity();
    expect(startFlow).toHaveBeenCalledTimes(1);
  });
});

describe('FlowResourceMonitor global heartbeats', () => {
  it('marks every resource that beat through a global node unhealthy after the timeout', async () => {
    const node = {
      id: 'hb',
      type: ResourceFlowNodeType.OUTPUT_RESOURCE_HEALTH_HEARTBEAT,
      data: { identifier: 'bridge', timeoutSeconds: 60, unhealthyReason: 'gone' },
      resourceId: null,
      flowId: 1,
    } as unknown as ResourceFlowNode;
    const { monitor, heartbeats, health } = build([], [node], []);
    // The heartbeat query shares the repository mock's find().
    heartbeats.set('7::bridge', new Date(Date.now() - 120_000));
    heartbeats.set('8::bridge', new Date());

    await monitor.checkHealthHeartbeats();

    expect(health.reportHealth).toHaveBeenCalledTimes(1);
    expect(health.reportHealth).toHaveBeenCalledWith(
      expect.objectContaining({ resourceId: 7, identifier: 'bridge', reason: 'gone' }),
    );
    expect(heartbeats.has('7::bridge')).toBe(true);
  });
});
