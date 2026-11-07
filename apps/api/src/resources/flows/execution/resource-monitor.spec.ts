import { Logger } from '@nestjs/common';
import { ResourceFlowNode, ResourceFlowNodeType } from '@attraccess/database-entities';
import { globalHeartbeatKey, heartbeatKey } from '../node-executors';
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
  const startFlow = jest.fn(async (..._args: unknown[]): Promise<never[]> => []);
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
  return { monitor, activity, heartbeats, startFlow, health, repository };
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

  it('starts at most ten runs at once and still fires every due pair', async () => {
    const global = noActivityNode('g', 5, { flowId: 1 });
    const machines = Array.from({ length: 25 }, (_, index) => 100 + index);
    const { monitor, activity, startFlow } = build([], [global], machines);
    for (const id of machines) activity.set(id, minutes(6));
    let running = 0;
    let peak = 0;
    startFlow.mockImplementation(async () => {
      running++;
      peak = Math.max(peak, running);
      await Promise.resolve();
      running--;
      return [] as never[];
    });

    await monitor.checkResourceActivity();

    expect(startFlow).toHaveBeenCalledTimes(25);
    expect(peak).toBe(10);
  });

  it('keeps firing later pairs when one run fails', async () => {
    const global = noActivityNode('g', 5, { flowId: 1 });
    const machines = Array.from({ length: 12 }, (_, index) => 100 + index);
    const { monitor, activity, startFlow } = build([], [global], machines);
    for (const id of machines) activity.set(id, minutes(6));
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    startFlow.mockRejectedValueOnce(new Error('boom'));

    await monitor.checkResourceActivity();

    expect(startFlow).toHaveBeenCalledTimes(12);
  });

  it('only loads no-activity nodes of enabled global flows', async () => {
    const { monitor, repository } = build([], [], [10]);
    await monitor.checkResourceActivity();
    expect(repository.find).toHaveBeenCalledWith({
      where: expect.objectContaining({ flow: { enabled: true, scope: 'global' } }),
    });
  });
});

describe('FlowResourceMonitor heartbeats', () => {
  const heartbeatNode = (id: string, timeoutSeconds: number, extra: Partial<ResourceFlowNode>) =>
    ({
      id,
      type: ResourceFlowNodeType.OUTPUT_RESOURCE_HEALTH_HEARTBEAT,
      data: { identifier: 'bridge', timeoutSeconds, unhealthyReason: 'gone' },
      resourceId: null,
      flowId: null,
      ...extra,
    }) as unknown as ResourceFlowNode;
  const secondsAgo = (n: number) => new Date(Date.now() - n * 1000);

  it('marks every resource that beat through a global node unhealthy after the timeout', async () => {
    const node = heartbeatNode('hb', 60, { flowId: 1 });
    // The heartbeat query shares the repository mock's find().
    const { monitor, heartbeats, health } = build([], [node], []);
    heartbeats.set(globalHeartbeatKey('hb', 7, 'bridge'), secondsAgo(120));
    heartbeats.set(globalHeartbeatKey('hb', 8, 'bridge'), new Date());

    await monitor.checkHealthHeartbeats();

    expect(health.reportHealth).toHaveBeenCalledTimes(1);
    expect(health.reportHealth).toHaveBeenCalledWith(
      expect.objectContaining({ resourceId: 7, identifier: 'bridge', reason: 'gone' }),
    );
    expect(heartbeats.has(globalHeartbeatKey('hb', 7, 'bridge'))).toBe(true);
  });

  it("does not judge a resource flow's beats with a global node of the same identifier", async () => {
    const own = heartbeatNode('own', 600, { resourceId: 7 });
    const global = heartbeatNode('hb', 60, { flowId: 1 });
    const { monitor, heartbeats, health } = build([], [own, global], []);
    heartbeats.set(heartbeatKey(7, 'bridge'), secondsAgo(120));

    await monitor.checkHealthHeartbeats();

    expect(health.reportHealth).not.toHaveBeenCalled();
    expect(heartbeats.has(heartbeatKey(7, 'bridge'))).toBe(true);
  });

  it("judges a resource node only by its own beats, not a global node's", async () => {
    const own = heartbeatNode('own', 60, { resourceId: 7 });
    const global = heartbeatNode('hb', 600, { flowId: 1 });
    const { monitor, heartbeats, health } = build([], [own, global], []);
    heartbeats.set(heartbeatKey(7, 'bridge'), secondsAgo(10));
    heartbeats.set(globalHeartbeatKey('hb', 7, 'bridge'), secondsAgo(120));

    await monitor.checkHealthHeartbeats();
    expect(health.reportHealth).not.toHaveBeenCalled();

    heartbeats.set(heartbeatKey(7, 'bridge'), secondsAgo(120));
    heartbeats.set(globalHeartbeatKey('hb', 7, 'bridge'), new Date());
    await monitor.checkHealthHeartbeats();
    expect(health.reportHealth).toHaveBeenCalledTimes(1);
    expect(health.reportHealth).toHaveBeenCalledWith(expect.objectContaining({ resourceId: 7, identifier: 'bridge' }));
  });

  it('keeps beats of current global nodes and drops those of removed nodes or old identifiers', async () => {
    const global = heartbeatNode('hb', 600, { flowId: 1 });
    const { monitor, heartbeats } = build([], [global], []);
    heartbeats.set(globalHeartbeatKey('hb', 7, 'bridge'), new Date());
    heartbeats.set(globalHeartbeatKey('hb', 7, 'old-name'), new Date());
    heartbeats.set(globalHeartbeatKey('removed', 7, 'bridge'), new Date());
    heartbeats.set(heartbeatKey(7, 'bridge'), new Date());

    await monitor.checkHealthHeartbeats();

    expect([...heartbeats.keys()]).toEqual([globalHeartbeatKey('hb', 7, 'bridge')]);
  });

  it('only loads heartbeat nodes of resource flows and enabled global flows', async () => {
    const { monitor, repository } = build([], [], []);
    await monitor.checkHealthHeartbeats();
    expect(repository.find).toHaveBeenCalledWith({
      where: [
        expect.objectContaining({ flowId: expect.anything() }),
        expect.objectContaining({ flow: { enabled: true, scope: 'global' } }),
      ],
    });
  });
});
