import { ResourceMeteringSession, ResourceMeteringSessionStatus, ResourceUsage } from '@attraccess/database-entities';
import { GenericMetersTestScope } from './resource-metering.persistence.spec';
export function registerGenericMetersExcludesUnpublishedUsagesAndSelectsTheNewestLegacySessionForLiveMetersAndReports(
  scope: GenericMetersTestScope,
): void {
  it('excludes unpublished usages and selects the newest legacy session for live meters and reports', async () => {
    const usages = scope.source.getRepository(ResourceUsage);
    const sessions = scope.source.getRepository(ResourceMeteringSession);
    const seedSession = async (isFinalized: boolean, lifecyclePending: boolean, name: string) => {
      const session = await usages.save({
        resourceId: 1,
        userId: 1,
        startTime: new Date('2026-01-01T00:00:00Z'),
        isFinalized,
        lifecyclePending,
        meterRates: [{ meterId: 1, name, creditsPerUnit: 30 }],
      });
      await sessions.save({
        id: `meter-${session.id}`,
        resourceId: 1,
        usageId: session.id,
        status: ResourceMeteringSessionStatus.Active,
        creditsPerUnit: 30,
        collectionMode: 'increment',
        latestValue: '0',
      });
      return session;
    };

    const orphan = await seedSession(false, false, 'Orphan');
    const pending = await seedSession(true, true, 'Pending end');
    expect((await scope.metering.getLive(1)).meters[0].session).toBeNull();
    await scope.metering.report(1, 1, { kind: 'reading', mode: 'increment', value: '1' });
    expect((await scope.sessionOf(orphan.id)).latestValue).toBe('0');
    expect((await scope.sessionOf(pending.id)).latestValue).toBe('0');

    const older = await seedSession(true, false, 'Older');
    const newest = await seedSession(true, false, 'Newest');
    expect((await scope.usage.getActiveSession(1))?.id).toBe(newest.id);
    expect((await scope.metering.getLive(1)).meters[0].session).toMatchObject({
      usageId: newest.id,
      meterName: 'Newest',
    });
    await scope.metering.report(1, 1, { kind: 'reading', mode: 'increment', value: '2' });
    expect((await scope.sessionOf(newest.id)).latestValue).toBe('2000000000');
    expect((await scope.sessionOf(older.id)).latestValue).toBe('0');
    expect((await scope.sessionOf(orphan.id)).latestValue).toBe('0');
    expect((await scope.sessionOf(pending.id)).latestValue).toBe('0');
    expect((await scope.metering.getLive(1)).meters[0].lifetimeValue).toBe('3');
  });
}
