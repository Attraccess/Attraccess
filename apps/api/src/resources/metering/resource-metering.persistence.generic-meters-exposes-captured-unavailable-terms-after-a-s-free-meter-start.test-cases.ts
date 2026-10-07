import { ResourceMeteringSession, ResourceUsage } from '@attraccess/database-entities';
import { GenericMetersTestScope } from './resource-metering.persistence.spec';
export function registerGenericMetersExposesCapturedUnavailableTermsAfterASFreeMeterStart(
  scope: GenericMetersTestScope,
): void {
  it.each(['failed', 'unconfigured'])(
    'exposes captured unavailable terms after a %s free-meter start',
    async (start) => {
      await scope.metering.setRate(1, 1, 0);
      if (start === 'failed') {
        await scope.seedMeter();
        scope.onStart = async () => {
          throw new Error('offline');
        };
      }
      const started = await scope.usage.startSession(1, scope.users[0], {} as never);
      expect(await scope.source.getRepository(ResourceMeteringSession).count()).toBe(0);
      await scope.metering.updateMeter(1, 1, 'Renamed later');
      await scope.metering.setRate(1, 1, 99);
      const unavailable = {
        sessionId: null,
        usageId: started.id,
        meterName: 'Energy (kWh)',
        creditsPerUnit: 0,
        latestValue: null,
        chargeCredits: null,
        latestObservedAt: null,
        source: null,
      };
      expect((await scope.metering.listMeters(1))[0]).toMatchObject({
        name: 'Renamed later',
        creditsPerUnit: 99,
        session: unavailable,
      });
      expect((await scope.metering.getLive(1)).meters[0].session).toEqual(unavailable);

      const usages = scope.source.getRepository(ResourceUsage);
      await usages.update(started.id, { meterRates: [] });
      expect((await scope.metering.listMeters(1))[0].session).toBeNull();
      await usages.update(started.id, { meterRates: started.meterRates, lifecyclePending: true });
      expect((await scope.metering.listMeters(1))[0].session).toBeNull();
      await usages.update(started.id, { lifecyclePending: false });
      await scope.usage.endSession(1, scope.users[0], {} as never);
      expect((await scope.metering.listMeters(1))[0].session).toBeNull();
      expect((await scope.items(started.id)).transaction.amount).toBe(0);
    },
  );
}
