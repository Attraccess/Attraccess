import { BillingTransaction, ResourceMeteringOperation, ResourceMeteringSession } from '@attraccess/database-entities';
import { GenericMetersTestScope } from './resource-metering.persistence.spec';
export function registerGenericMetersAttributesSToTheNewestUsageOnlyInitializedS(scope: GenericMetersTestScope): void {
  it.each([
    ['report', true],
    ['report', false],
    ['poll', true],
    ['poll', false],
  ] as const)('attributes %s to the newest usage only, initialized=%s', async (path, initialized) => {
    await scope.seedMeter();
    await scope.metering.setRate(1, 1, 0);
    const { newest, older } = await scope.seedLegacyMeterUsages(initialized);
    expect((await scope.usage.getActiveSession(1))?.id).toBe(newest.id);
    expect((await scope.metering.getLive(1)).meters[0].session).toMatchObject({ usageId: newest.id });

    const report = { kind: 'reading', mode: 'increment', value: '2' } as const;
    if (path === 'report') await scope.metering.report(1, 1, report);
    else {
      scope.onCollect = ({ complete }) => complete(report);
      await scope.metering.collectInterimReadings();
    }

    expect((await scope.sessionOf(older.id)).latestValue).toBe('0');
    if (initialized) expect((await scope.sessionOf(newest.id)).latestValue).toBe('2000000000');
    else expect(await scope.source.getRepository(ResourceMeteringSession).countBy({ usageId: newest.id })).toBe(0);
    expect((await scope.metering.getLive(1)).meters[0].lifetimeValue).toBe('2');
    expect(
      await scope.source.getRepository(ResourceMeteringOperation).findOneByOrFail({ kind: 'interim' }),
    ).toMatchObject({
      status: 'completed',
      sessionId: initialized ? `meter-${newest.id}` : null,
    });
    expect(await scope.source.getRepository(BillingTransaction).count()).toBe(0);
  });
}
