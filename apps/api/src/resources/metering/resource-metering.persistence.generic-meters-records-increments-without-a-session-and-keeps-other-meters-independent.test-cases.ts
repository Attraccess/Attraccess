import { ResourceMeteringSession } from '@attraccess/database-entities';
import { GenericMetersTestScope } from './resource-metering.persistence.spec';
export function registerGenericMetersRecordsIncrementsWithoutASessionAndKeepsOtherMetersIndependent(
  scope: GenericMetersTestScope,
): void {
  it('records increments without a session and keeps other meters independent', async () => {
    const other = await scope.metering.createMeter(1, 'Heartbeats');
    await scope.metering.report(1, other.id, { kind: 'reading', mode: 'increment', value: '2.5' });
    await scope.metering.report(1, other.id, { kind: 'reading', mode: 'increment', value: '3.25' });
    const meters = await scope.metering.listMeters(1);
    expect(meters.find((m) => m.id === other.id)).toEqual(
      expect.objectContaining({ lifetimeValue: '5.75', session: null }),
    );
    expect(meters.find((m) => m.id === 1)?.lifetimeValue).toBe('0');
    expect(await scope.source.getRepository(ResourceMeteringSession).count()).toBe(0);
    await expect(scope.metering.report(99, other.id, { kind: 'reading', value: '1' })).rejects.toThrow(
      'METER_NOT_FOUND',
    );
  });
}
