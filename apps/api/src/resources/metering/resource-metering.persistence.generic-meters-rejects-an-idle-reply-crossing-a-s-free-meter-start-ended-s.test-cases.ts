import {
  ResourceMeter,
  ResourceFlowEdge,
  ResourceFlowNode,
  ResourceMeteringOperation,
  ResourceMeteringSession,
  ResourceUsageLifecycleAttempt,
} from '@attraccess/database-entities';
import { MeteringReadings } from './metering-readings';
import { GenericMetersTestScope } from './resource-metering.persistence.spec';
export function registerGenericMetersRejectsAnIdleReplyCrossingASFreeMeterStartEndedS(
  scope: GenericMetersTestScope,
): void {
  it.each([
    ['failed', false],
    ['failed', true],
    ['unconfigured', false],
    ['unconfigured', true],
  ])('rejects an idle reply crossing a %s free-meter start, ended=%s', async (start, ended) => {
    await scope.seedMeter();
    await scope.metering.setRate(1, 1, 0);
    await scope.source.getRepository(ResourceMeter).update(1, { counterValue: '100000000000' });
    await scope.source.getRepository(ResourceMeteringOperation).save({
      id: 'outstanding-idle',
      resourceId: 1,
      meterId: 1,
      sessionId: null,
      kind: 'interim',
      status: 'pending',
      requestedAt: new Date(),
    });
    if (start === 'failed') {
      scope.onStart = async () => {
        throw new Error('offline');
      };
    } else {
      await scope.source.getRepository(ResourceFlowNode).delete(['start', 'ready']);
      await scope.source.getRepository(ResourceFlowEdge).delete('e1');
    }
    const started = await scope.usage.startSession(1, scope.users[0], {} as never);
    expect(await scope.source.getRepository(ResourceMeteringSession).count()).toBe(0);
    expect(await scope.source.getRepository(ResourceUsageLifecycleAttempt).count()).toBe(0);
    if (ended) await scope.usage.endSession(1, scope.users[0], {} as never);
    await expect(
      new MeteringReadings(scope.source.manager, new Map()).complete('outstanding-idle', {
        kind: 'reading',
        value: '105',
      }),
    ).rejects.toThrow('session boundary');
    expect((await scope.metering.listMeters(1))[0].counterValue).toBe('100');
    expect((await scope.metering.listMeters(1))[0].lifetimeValue).toBe('0');
    expect((await scope.items(started.id)).transaction.amount).toBe(0);
  });
}
