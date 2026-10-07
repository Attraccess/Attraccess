import { ResourceMeteringSessionStatus } from '@attraccess/database-entities';
import { TakeoverTestScope } from './resource-metering.persistence.spec';
export function registerTakeoverMarksTheOutgoingEnergyFailedNotRetryableWhenItsFinalReadingIsMissingAndTheNextSessio(
  scope: TakeoverTestScope,
): void {
  it('marks the outgoing energy failed, not retryable, when its final reading is missing and the next session took the meter', async () => {
    await scope.parentScope.seedMeter({}, { finalAttempts: 1 });
    const first = await scope.start(scope.parentScope.users[0]);
    scope.parentScope.onCollect = async () => {
      throw new Error('meter unreachable');
    };
    await scope.start(scope.parentScope.users[1], { forceTakeOver: true });
    expect(await scope.parentScope.sessionOf(first.id)).toEqual(
      expect.objectContaining({ status: ResourceMeteringSessionStatus.Failed }),
    );
    await expect(
      scope.parentScope.metering.retrySettlement(1, (await scope.parentScope.sessionOf(first.id)).id, 1),
    ).rejects.toThrow(expect.objectContaining({ message: 'METER_SESSION_NOT_PENDING' }));
  });
}
