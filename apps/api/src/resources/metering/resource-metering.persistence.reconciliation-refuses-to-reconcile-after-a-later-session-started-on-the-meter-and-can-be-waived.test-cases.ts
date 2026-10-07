import { ResourceMeteringSession, ResourceMeteringSessionStatus } from '@attraccess/database-entities';
import { ReconciliationTestScope } from './resource-metering.persistence.spec';
export function registerReconciliationRefusesToReconcileAfterALaterSessionStartedOnTheMeterAndCanBeWaived(
  scope: ReconciliationTestScope,
): void {
  it('refuses to reconcile after a later session started on the meter, and can be waived', async () => {
    const ended = await scope.endWithMissingFinal();
    await scope.start(scope.parentScope.users[1]);
    const session = await scope.parentScope.sessionOf(ended.id);
    // Starting the next session already failed the older pending energy.
    expect(session.status).toBe(ResourceMeteringSessionStatus.Failed);
    await scope.parentScope.source
      .getRepository(ResourceMeteringSession)
      .update(session.id, { status: ResourceMeteringSessionStatus.Pending });
    await expect(scope.parentScope.metering.retrySettlement(1, session.id, 1)).rejects.toThrow(
      expect.objectContaining({ message: expect.stringMatching(/^METER_SETTLEMENT_FAILED/) }),
    );
    expect((await scope.parentScope.metering.waive(1, session.id, 7)).status).toBe(
      ResourceMeteringSessionStatus.Waived,
    );
    expect(scope.parentScope.audit.recordResource).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'meter_charge.waived', actorId: 7, subjectId: 1 }),
    );
    await expect(scope.parentScope.metering.waive(1, session.id, 7)).rejects.toThrow(
      expect.objectContaining({ message: 'METER_SESSION_NOT_PENDING' }),
    );
  });
}
