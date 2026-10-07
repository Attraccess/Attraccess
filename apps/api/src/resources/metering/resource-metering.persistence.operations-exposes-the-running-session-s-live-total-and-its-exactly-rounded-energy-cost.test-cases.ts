import { OperationsTestScope } from './resource-metering.persistence.spec';
export function registerOperationsExposesTheRunningSessionSLiveTotalAndItsExactlyRoundedEnergyCost(
  scope: OperationsTestScope,
): void {
  it("exposes the running session's live total and its exactly rounded energy cost", async () => {
    const session = await scope.activeSession();
    expect((await scope.metering.getLive(1)).meters[0].session).toEqual(
      expect.objectContaining({ latestValue: null, chargeCredits: null, creditsPerUnit: 30 }),
    );
    scope.onCollect = scope.reading('0.05');
    await scope.run(session);
    expect((await scope.metering.getLive(1)).meters[0].session).toEqual(
      expect.objectContaining({ sessionId: session.id, latestValue: '0.05', chargeCredits: 2, creditsPerUnit: 30 }),
    );
    await scope.usage.endSession(1, scope.users[0], {} as never);
    expect((await scope.metering.getLive(1)).meters[0].session).toBeNull();
  });
}
