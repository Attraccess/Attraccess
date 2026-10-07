import { ReconciliationTestScope } from './resource-metering.persistence.spec';
export function registerReconciliationKeepsTheChargePendingWithTheReasonWhenTheRetryIsStaleOrInvalid(
  scope: ReconciliationTestScope,
): void {
  it('keeps the charge pending with the reason when the retry is stale or invalid', async () => {
    const ended = await scope.endWithMissingFinal();
    scope.parentScope.onCollect = scope.parentScope.reading('1.5', { observedAt: '2020-01-01T00:00:00Z' });
    await expect(
      scope.parentScope.metering.retrySettlement(1, (await scope.parentScope.sessionOf(ended.id)).id, 1),
    ).rejects.toThrow(expect.objectContaining({ message: expect.stringMatching(/^METER_SETTLEMENT_FAILED/) }));
    expect(await scope.parentScope.sessionOf(ended.id)).toEqual(
      expect.objectContaining({ status: 'pending', failureReason: expect.stringMatching(/session end boundary/) }),
    );
    expect((await scope.parentScope.items(ended.id)).transaction.amount).toBe(0);
    expect((await scope.parentScope.correctionsOf(ended.id)).corrections).toEqual([]);
    expect(scope.parentScope.audit.recordBillingTransactionAfterCommit).not.toHaveBeenCalled();
    expect(scope.parentScope.liveNotifications.notifyTransactionUpdate).not.toHaveBeenCalled();
  });
}
