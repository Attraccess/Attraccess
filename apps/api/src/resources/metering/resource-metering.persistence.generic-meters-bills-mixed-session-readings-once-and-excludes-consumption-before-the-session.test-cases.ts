import { GenericMetersTestScope } from './resource-metering.persistence.spec';
export function registerGenericMetersBillsMixedSessionReadingsOnceAndExcludesConsumptionBeforeTheSession(
  scope: GenericMetersTestScope,
): void {
  it('bills mixed session readings once and excludes consumption before the session', async () => {
    await scope.seedMeter();
    await scope.metering.report(1, 1, { kind: 'reading', value: '100' });
    scope.onStart = ({ complete }) => complete({ kind: 'ready', baseline: { value: '100' } });
    const started = await scope.usage.startSession(1, scope.users[0], {} as never);
    await scope.metering.report(1, 1, { kind: 'reading', mode: 'increment', value: '2' });
    await scope.metering.report(1, 1, { kind: 'reading', value: '103' });
    expect((await scope.metering.listMeters(1))[0].session?.latestValue).toBe('3');
    scope.onCollect = scope.reading('104');
    await scope.usage.endSession(1, scope.users[0], {} as never);
    expect((await scope.items(started.id)).transaction.amount).toBe(-120);
    expect((await scope.metering.listMeters(1))[0].lifetimeValue).toBe('4');
  });
}
