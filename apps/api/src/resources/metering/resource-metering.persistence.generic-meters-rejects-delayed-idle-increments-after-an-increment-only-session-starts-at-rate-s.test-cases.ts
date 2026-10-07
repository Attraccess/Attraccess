import { ResourceFlowNode, ResourceMeteringOperation } from '@attraccess/database-entities';
import { GenericMetersTestScope } from './resource-metering.persistence.spec';
export function registerGenericMetersRejectsDelayedIdleIncrementsAfterAnIncrementOnlySessionStartsAtRateS(
  scope: GenericMetersTestScope,
): void {
  it.each([0, 30])(
    'rejects delayed idle increments after an increment-only session starts at rate %s',
    async (rate) => {
      await scope.metering.setRate(1, 1, rate);
      await scope.source.getRepository(ResourceFlowNode).save({
        id: 'increment-report',
        resourceId: 1,
        type: scope.T.OUTPUT_METERING_REPORT,
        data: { meterId: 1, mode: 'increment', value: '1' },
      });
      await scope.metering.report(1, 1, {
        kind: 'reading',
        mode: 'increment',
        value: '3',
        observedAt: new Date(Date.now() - 60_000).toISOString(),
      });
      const started = await scope.usage.startSession(1, scope.users[0], {} as never);
      await expect(
        scope.metering.report(1, 1, {
          kind: 'reading',
          mode: 'increment',
          value: '5',
          observedAt: new Date(started.startTime.getTime() - 1).toISOString(),
        }),
      ).rejects.toThrow('older than the required boundary');
      expect((await scope.metering.listMeters(1))[0].lifetimeValue).toBe('3');
      expect((await scope.sessionOf(started.id)).latestValue).toBe('0');
      expect(await scope.source.getRepository(ResourceMeteringOperation).count()).toBe(1);

      // An observation exactly on the persisted start boundary belongs to the session.
      await scope.metering.report(1, 1, {
        kind: 'reading',
        mode: 'increment',
        value: '2',
        observedAt: started.startTime.toISOString(),
      });
      await scope.usage.endSession(1, scope.users[0], {} as never);
      expect((await scope.metering.listMeters(1))[0].lifetimeValue).toBe('5');
      expect((await scope.items(started.id)).transaction.amount).toBe(rate === 0 ? 0 : -2 * rate);
    },
  );
}
