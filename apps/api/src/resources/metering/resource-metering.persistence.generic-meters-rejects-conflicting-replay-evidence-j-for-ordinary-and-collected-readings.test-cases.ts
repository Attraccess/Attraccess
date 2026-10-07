import { ResourceMeteringOperation } from '@attraccess/database-entities';
import { GenericMetersTestScope } from './resource-metering.persistence.spec';
export function registerGenericMetersRejectsConflictingReplayEvidenceJForOrdinaryAndCollectedReadings(
  scope: GenericMetersTestScope,
): void {
  it.each([{ observedAt: '2020-01-01T00:00:00Z' }, { observedAt: 'invalid' }, { source: 'different-device' }])(
    'rejects conflicting replay evidence %j for ordinary and collected readings',
    async (conflict) => {
      const report = { kind: 'reading' as const, mode: 'increment' as const, value: '3', source: 'device' };
      await scope.metering.report(1, 1, report, undefined, undefined, 'ordinary');
      await scope.metering.report(1, 1, report, undefined, undefined, 'ordinary');
      await expect(
        scope.metering.report(1, 1, { ...report, ...conflict }, undefined, undefined, 'ordinary'),
      ).rejects.toThrow('conflicting');
      const observedAt = new Date().toISOString();
      const operation = await scope.source.getRepository(ResourceMeteringOperation).save({
        id: 'collection',
        meterId: 1,
        resourceId: 1,
        kind: 'interim',
        status: 'pending',
        requestedAt: new Date(),
      });
      await scope.metering['readings'].complete(operation.id, { ...report, observedAt });
      await scope.metering['readings'].complete(operation.id, { ...report, observedAt });
      await expect(
        scope.metering['readings'].complete(operation.id, { ...report, observedAt, ...conflict }),
      ).rejects.toThrow('answered');
      expect((await scope.metering.listMeters(1))[0].lifetimeValue).toBe('6');
    },
  );
}
