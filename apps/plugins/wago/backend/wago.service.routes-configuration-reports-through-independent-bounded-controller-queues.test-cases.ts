import { WagoService } from './wago.service';
import type { WagoServiceTestScope } from './wago.service.spec';

export function registerRoutesConfigurationReportsThroughIndependentBoundedControllerQueues(
  scope: WagoServiceTestScope,
): void {
  it('routes configuration reports through independent bounded controller queues', async () => {
    const first = { ...scope.controller(), trustState: 'claimed' as const };
    const second = { ...scope.controller(), id: 2, hardwareId: 'cc100-02', trustState: 'claimed' as const };
    const { service, context } = scope.createService([first, second]);
    let releaseFirst!: () => void;
    const onConfigurationReported = jest
      .spyOn(
        service as unknown as { onConfigurationReported: WagoService['onConfigurationReported'] },
        'onConfigurationReported',
      )
      .mockImplementation((controllerId) =>
        controllerId === first.id ? new Promise<void>((resolve) => (releaseFirst = resolve)) : Promise.resolve(),
      );

    await service.onApplicationBootstrap();

    const reportSubscriptions = (context.mqtt.subscribe as jest.Mock).mock.calls.filter(([, topic]) =>
      topic.endsWith('/configuration/reported'),
    );
    expect(reportSubscriptions).toHaveLength(1);
    expect(reportSubscriptions[0][1]).toBe('attraccess/wago/v1/controllers/+/configuration/reported');
    const handler = reportSubscriptions[0][2] as (message: { topic: string; payload: Buffer }) => void;
    const firstResult = handler({
      topic: 'attraccess/wago/v1/controllers/cc100-01/configuration/reported',
      payload: Buffer.from('{}'),
    });
    const secondResult = handler({
      topic: 'attraccess/wago/v1/controllers/cc100-02/configuration/reported',
      payload: Buffer.from('{}'),
    });

    expect(firstResult).toBeUndefined();
    expect(secondResult).toBeUndefined();
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(onConfigurationReported).toHaveBeenCalledWith(second.id, expect.any(Buffer));
    releaseFirst();
  });
}

export function registerSerializesConcurrentClaimsForTheSameController(scope: WagoServiceTestScope): void {
  it('serializes concurrent claims for the same controller', async () => {
    const { service } = scope.createService();
    const withClaimLock = (
      Reflect.get(service, 'withClaimLock') as <T>(id: number, operation: () => Promise<T>) => Promise<T>
    ).bind(service);
    const started: number[] = [];
    let release!: () => void;
    const first = withClaimLock(1, async () => {
      started.push(1);
      await new Promise<void>((resolve) => {
        release = resolve;
      });
    });
    const second = withClaimLock(1, async () => started.push(2));

    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(started).toEqual([1]);
    release();
    await Promise.all([first, second]);
    expect(started).toEqual([1, 2]);
  });
}

export function registerSerializesConfigurationReportsWithPublicationForTheSameController(
  scope: WagoServiceTestScope,
): void {
  it('serializes configuration reports with publication for the same controller', async () => {
    const { service, revisionRepository } = scope.createService([
      { ...scope.controller(), trustState: 'claimed' as const },
    ]);
    const revision = {
      id: 1,
      controllerId: 1,
      revision: 2,
      snapshot: '{}',
      contentHash: 'a'.repeat(64),
      state: 'published' as const,
      rejectionErrors: null,
      publishedAt: '2026-01-01T00:00:00.000Z',
      reportedAt: null,
    };
    revisionRepository.findOneBy.mockResolvedValue(revision);
    const withConfigurationLock = (
      Reflect.get(service, 'withConfigurationLock') as <T>(id: number, operation: () => Promise<T>) => Promise<T>
    ).bind(service);
    const onConfigurationReported = (
      Reflect.get(service, 'onConfigurationReported') as (controllerId: number, payload: Buffer) => Promise<void>
    ).bind(service);
    let releasePublish!: () => void;
    const publish = withConfigurationLock(1, () => new Promise<void>((resolve) => (releasePublish = resolve)));
    const report = onConfigurationReported(
      1,
      Buffer.from(JSON.stringify({ revision: 2, contentHash: revision.contentHash })),
    );

    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(revisionRepository.save).not.toHaveBeenCalled();
    releasePublish();
    await Promise.all([publish, report]);
    expect(revisionRepository.save).toHaveBeenCalledWith(expect.objectContaining({ state: 'applied' }));
  });
}

export function registerStartsTheEditorFromTheLastAppliedRevisionWithoutCreatingADraft(
  scope: WagoServiceTestScope,
): void {
  it('starts the editor from the last applied revision without creating a draft', async () => {
    const { service, revisionRepository, draftRepository } = scope.createService([
      { ...scope.controller(), trustState: 'claimed' },
    ]);
    const revision = {
      revision: 4,
      state: 'applied',
      snapshot: '{"version":1,"physicalPoints":[],"logicalChannels":[]}',
    };
    revisionRepository.find.mockResolvedValue([revision]);
    expect(await service.getConfigurationBaseline(1)).toBe(revision);
    expect(revisionRepository.find).toHaveBeenCalledWith({
      where: { controllerId: 1, state: 'applied' },
      order: { revision: 'DESC' },
      take: 1,
    });
    expect(draftRepository.save).not.toHaveBeenCalled();
  });
}

export function registerSubscribesAMigratedControllerDirectlyWithoutContactingItsUnreachablePreviousBroker(
  scope: WagoServiceTestScope,
): void {
  it('subscribes a migrated controller directly without contacting its unreachable previous broker', async () => {
    const claimed = { ...scope.controller(), trustState: 'claimed' as const, mqttServerId: 3 };
    const { service, context } = scope.createService([claimed], [], 2);
    const handlers = new Map<
      string,
      (message: { serverId: number; topic: string; payload: Buffer }) => Promise<void>
    >();
    jest.mocked(context.mqtt.subscribe).mockImplementation(async (serverId, topic, handler) => {
      if (serverId === 2) throw new Error('old-broker-unreachable');
      handlers.set(topic, handler as (message: { serverId: number; topic: string; payload: Buffer }) => Promise<void>);
      return { unsubscribe: jest.fn() };
    });
    const heartbeat = jest
      .spyOn(service as unknown as { onHeartbeat(id: string, payload: Buffer): Promise<void> }, 'onHeartbeat')
      .mockResolvedValue(undefined);
    await service.refreshNetworkConnection(1);
    expect(context.mqtt.subscribe).toHaveBeenCalledTimes(6);
    expect(jest.mocked(context.mqtt.subscribe).mock.calls.every(([serverId]) => serverId === 3)).toBe(true);
    const topic = 'attraccess/wago/v1/controllers/cc100-01/heartbeat',
      payload = Buffer.from('device-heartbeat');
    await handlers.get(topic)?.({ serverId: 2, topic, payload });
    expect(heartbeat).not.toHaveBeenCalled();
    await handlers.get(topic)?.({ serverId: 3, topic, payload });
    expect(heartbeat).toHaveBeenCalledWith('cc100-01', payload);
  });
}

export function registerUnsubscribesAnInFlightReplacementWhenTheModuleIsDestroyed(scope: WagoServiceTestScope): void {
  it('unsubscribes an in-flight replacement when the module is destroyed', async () => {
    let finishSubscribe!: () => void;
    const { service, context, subscriptions } = scope.createService([], [], 2);
    (context.mqtt.subscribe as jest.Mock).mockImplementation(
      () =>
        new Promise((resolve) => {
          finishSubscribe = () => {
            const subscription = { unsubscribe: jest.fn() };
            subscriptions.push(subscription);
            resolve(subscription);
          };
        }),
    );
    const subscribeConfiguredServers = (Reflect.get(service, 'subscribeConfiguredServers') as () => Promise<void>).bind(
      service,
    );

    const rebuild = subscribeConfiguredServers();
    await new Promise<void>((resolve) => setImmediate(resolve));
    service.onModuleDestroy();
    finishSubscribe();
    await rebuild;

    expect(subscriptions[0].unsubscribe).toHaveBeenCalledTimes(1);
  });
}
