import { ReconciliationTestScope } from './resource-metering.persistence.spec';
export function registerReconciliationRetryingBillsThePendingEnergyAsASeparateCorrectionExactlyOnceAndLeavesTheBillUntouche(
  scope: ReconciliationTestScope,
): void {
  it('retrying bills the pending energy as a separate correction exactly once and leaves the bill untouched', async () => {
    const ended = await scope.endWithMissingFinal();
    const session = await scope.parentScope.sessionOf(ended.id);
    const before = await scope.parentScope.items(ended.id);

    await scope.parentScope.metering.retrySettlement(1, session.id, 1);
    expect(await scope.parentScope.items(ended.id)).toEqual(before);
    const { original, corrections, items: correctionItems } = await scope.parentScope.correctionsOf(ended.id);
    expect(corrections).toEqual([
      expect.objectContaining({ amount: -45, status: 'completed', initiatorId: 1, resourceUsageId: null }),
    ]);
    expect(corrections[0].userId).toBe(original.userId);
    expect(scope.parentScope.audit.recordBillingTransactionAfterCommit).toHaveBeenCalledTimes(1);
    expect(scope.parentScope.audit.recordBillingTransactionAfterCommit).toHaveBeenCalledWith(
      expect.objectContaining({
        transactionId: corrections[0].id,
        userId: original.userId,
        initiatorId: 1,
        amount: -45,
        source: 'meter-correction',
      }),
      expect.anything(),
    );
    expect(scope.parentScope.liveNotifications.notifyTransactionUpdate).toHaveBeenCalledWith(corrections[0].id);
    expect(correctionItems.filter((item) => item.name === 'Energy (kWh)')).toHaveLength(1);
    expect(await scope.parentScope.sessionOf(ended.id)).toEqual(
      expect.objectContaining({ status: 'settled', chargeCredits: 45 }),
    );
    await expect(scope.parentScope.metering.retrySettlement(1, session.id, 1)).rejects.toThrow(
      expect.objectContaining({ message: 'METER_SESSION_NOT_PENDING' }),
    );
    expect((await scope.parentScope.correctionsOf(ended.id)).corrections).toHaveLength(1);
  });
}
