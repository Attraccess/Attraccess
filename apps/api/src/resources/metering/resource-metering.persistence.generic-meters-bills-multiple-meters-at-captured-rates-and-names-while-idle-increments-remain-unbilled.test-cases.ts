import { ResourceFlowNode } from '@attraccess/database-entities';
import { GenericMetersTestScope } from './resource-metering.persistence.spec';
export function registerGenericMetersBillsMultipleMetersAtCapturedRatesAndNamesWhileIdleIncrementsRemainUnbilled(
  scope: GenericMetersTestScope,
): void {
  it('bills multiple meters at captured rates and names while idle increments remain unbilled', async () => {
    await scope.seedMeter();
    const other = await scope.metering.createMeter(1, 'Heartbeats');
    await scope.metering.setRate(1, other.id, 2);
    await scope.source.getRepository(ResourceFlowNode).save({
      id: 'heartbeat-report',
      resourceId: 1,
      type: scope.T.OUTPUT_METERING_REPORT,
      data: { meterId: other.id, mode: 'increment', value: '1' },
    });
    await scope.metering.report(1, other.id, { kind: 'reading', mode: 'increment', value: '4' });
    const started = await scope.usage.startSession(1, scope.users[0], {} as never);
    await scope.metering.setRate(1, other.id, 100);
    await scope.metering.updateMeter(1, other.id, 'Renamed heartbeats');
    await scope.metering.report(1, other.id, { kind: 'reading', mode: 'increment', value: '3' });
    await scope.metering.report(1, other.id, { kind: 'reading', mode: 'increment', value: '2' });
    expect((await scope.metering.getLive(1)).meters.find((meter) => meter.id === other.id)).toEqual(
      expect.objectContaining({
        name: 'Renamed heartbeats',
        creditsPerUnit: 100,
        session: expect.objectContaining({ meterName: 'Heartbeats', creditsPerUnit: 2, latestValue: '5' }),
      }),
    );
    await scope.usage.endSession(1, scope.users[0], {} as never);
    const bill = await scope.items(started.id);
    expect(bill.transaction.amount).toBe(-55);
    expect(bill.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'Heartbeats', meterQuantity: '5', meterCreditsPerUnit: 2, unitPrice: 10 }),
        expect.objectContaining({ name: 'Energy (kWh)', meterQuantity: '1.5', unitPrice: 45 }),
      ]),
    );
    await scope.metering.report(1, other.id, { kind: 'reading', mode: 'increment', value: '7' });
    expect((await scope.metering.listMeters(1)).find((m) => m.id === other.id)?.lifetimeValue).toBe('16');
    expect((await scope.items(started.id)).transaction.amount).toBe(-55);
  });
}
