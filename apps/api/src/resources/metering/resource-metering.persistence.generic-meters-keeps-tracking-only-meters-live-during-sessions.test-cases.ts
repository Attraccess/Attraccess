import { GenericMetersTestScope } from './resource-metering.persistence.spec';
export function registerGenericMetersKeepsTrackingOnlyMetersLiveDuringSessions(scope: GenericMetersTestScope): void {
  it('keeps tracking-only meters live during sessions', async () => {
    await scope.seedMeter();
    await scope.metering.setRate(1, 1, 0);
    const started = await scope.usage.startSession(1, scope.users[0], {} as never);
    const session = await scope.sessionOf(started.id);
    scope.onCollect = scope.reading('3');
    await scope.metering['runOperation'](session, 'interim', {
      trigger: scope.T.INPUT_METERING_COLLECT,
      timeoutSeconds: 5,
    });
    expect((await scope.metering.getLive(1)).meters[0]).toEqual(
      expect.objectContaining({
        lifetimeValue: '3',
        session: expect.objectContaining({ latestValue: '3', chargeCredits: 0 }),
      }),
    );
    await scope.usage.endSession(1, scope.users[0], {} as never);
    expect((await scope.items(started.id)).items).toEqual([
      expect.objectContaining({ meterQuantity: '3', meterCreditsPerUnit: 0, unitPrice: 0 }),
    ]);
  });
}
