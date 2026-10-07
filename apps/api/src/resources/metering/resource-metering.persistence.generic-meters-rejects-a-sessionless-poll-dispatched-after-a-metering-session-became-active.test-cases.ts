import { ResourceMeteringOperation, ResourceUsage } from '@attraccess/database-entities';
import { MeteringReadings } from './metering-readings';
import { GenericMetersTestScope } from './resource-metering.persistence.spec';
export function registerGenericMetersRejectsASessionlessPollDispatchedAfterAMeteringSessionBecameActive(
  scope: GenericMetersTestScope,
): void {
  it('rejects a sessionless poll dispatched after a metering session became active', async () => {
    await scope.seedMeter();
    const started = await scope.usage.startSession(1, scope.users[0], {} as never);
    await scope.source.getRepository(ResourceUsage).update(started.id, { startTime: new Date(Date.now() - 1_000) });
    // A queued poll may have selected no session before initialization completed.
    await scope.source.getRepository(ResourceMeteringOperation).save({
      id: 'queued-lifetime-poll',
      resourceId: 1,
      meterId: 1,
      sessionId: null,
      kind: 'interim',
      status: 'pending',
      requestedAt: new Date(),
    });
    await expect(
      new MeteringReadings(scope.source.manager, new Map()).complete('queued-lifetime-poll', {
        kind: 'reading',
        mode: 'increment',
        value: '5',
      }),
    ).rejects.toThrow('session boundary');
    expect((await scope.metering.listMeters(1))[0].lifetimeValue).toBe('0');
    expect((await scope.sessionOf(started.id)).latestValue).toBeNull();
  });
}
