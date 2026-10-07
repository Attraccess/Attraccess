import { ResourceUsage, ResourceUsageLifecycleAttempt } from '@attraccess/database-entities';
import { GenericMetersTestScope } from './resource-metering.persistence.spec';
export function registerGenericMetersRetainsExplicitSLifecycleReportTargetingOverTheNewestPublishedUsage(
  scope: GenericMetersTestScope,
): void {
  it.each(['start', 'takeover', 'end'] as const)(
    'retains explicit %s lifecycle report targeting over the newest published usage',
    async (kind) => {
      const { newest, older } = await scope.seedLegacyMeterUsages(true);
      await scope.source.getRepository(ResourceUsage).update(older.id, {
        isFinalized: kind === 'end',
        lifecyclePending: true,
      });
      await scope.source.getRepository(ResourceUsageLifecycleAttempt).save({
        id: 'explicit-lifecycle',
        resourceId: 1,
        kind,
        candidateUsageId: kind === 'end' ? null : older.id,
        previousUsageId: kind === 'end' ? older.id : kind === 'takeover' ? newest.id : null,
        transitionTime: new Date(),
        formSubmissions: [],
        billingItems: [],
      });
      const report = { kind: 'reading', mode: 'increment', value: '3' } as const;
      await expect(scope.metering.report(1, 1, report)).rejects.toThrow('METER_LIFECYCLE_BUSY');
      await scope.metering.report(1, 1, report, undefined, 'explicit-lifecycle');
      expect((await scope.sessionOf(older.id)).latestValue).toBe('3000000000');
      expect((await scope.sessionOf(newest.id)).latestValue).toBe('0');
    },
  );
}
