import { ResourceMeteringSession, ResourceMeteringSessionStatus, ResourceUsage } from '@attraccess/database-entities';
import { inheritTestScope } from '../../test-utils/inherit-test-scope';
import { FlowDefinedMeteringTestScope } from './resource-metering.persistence.spec';

export function createGenericMetersFixture(parentScope: FlowDefinedMeteringTestScope) {
  async function seedLegacyMeterUsages(newestHasMeter: boolean) {
    const usages = parentScope.source.getRepository(ResourceUsage);
    const sessions = parentScope.source.getRepository(ResourceMeteringSession);
    // Insert the newest start first so selection must consider time before ID.
    const newest = await usages.save({
      resourceId: 1,
      userId: 1,
      startTime: new Date(Date.now() - 1_800_000),
      isFinalized: true,
      meterRates: [{ meterId: 1, name: 'Newest', creditsPerUnit: 0 }],
    });
    const older = await usages.save({
      resourceId: 1,
      userId: 2,
      startTime: new Date(Date.now() - 3_600_000),
      isFinalized: true,
      meterRates: [{ meterId: 1, name: 'Older', creditsPerUnit: 30 }],
    });
    for (const session of newestHasMeter ? [older, newest] : [older]) {
      await sessions.save({
        id: `meter-${session.id}`,
        resourceId: 1,
        usageId: session.id,
        status: ResourceMeteringSessionStatus.Active,
        creditsPerUnit: session.meterRates?.[0].creditsPerUnit,
        latestValue: '0',
      });
    }
    return { newest, older };
  }

  const scope = inheritTestScope(
    {
      get seedMeter() {
        return parentScope.seedMeter;
      },
      get metering() {
        return parentScope.metering;
      },
      set metering(value: typeof parentScope.metering) {
        parentScope.metering = value;
      },
      get seedLegacyMeterUsages() {
        return seedLegacyMeterUsages;
      },
      get usage() {
        return parentScope.usage;
      },
      set usage(value: typeof parentScope.usage) {
        parentScope.usage = value;
      },
      get onCollect() {
        return parentScope.onCollect;
      },
      set onCollect(value: typeof parentScope.onCollect) {
        parentScope.onCollect = value;
      },
      get sessionOf() {
        return parentScope.sessionOf;
      },
      get source() {
        return parentScope.source;
      },
      set source(value: typeof parentScope.source) {
        parentScope.source = value;
      },
      get onStart() {
        return parentScope.onStart;
      },
      set onStart(value: typeof parentScope.onStart) {
        parentScope.onStart = value;
      },
      get users() {
        return parentScope.users;
      },
      set users(value: typeof parentScope.users) {
        parentScope.users = value;
      },
      get items() {
        return parentScope.items;
      },
      get T() {
        return parentScope.T;
      },
      get reading() {
        return parentScope.reading;
      },
      get log() {
        return parentScope.log;
      },
      set log(value: typeof parentScope.log) {
        parentScope.log = value;
      },
      get correctionsOf() {
        return parentScope.correctionsOf;
      },
    },
    parentScope,
  );
  return scope;
}
