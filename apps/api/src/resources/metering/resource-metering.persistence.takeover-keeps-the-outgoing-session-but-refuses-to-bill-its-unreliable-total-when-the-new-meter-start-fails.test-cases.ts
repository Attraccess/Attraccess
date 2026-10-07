import { BadRequestException } from '@nestjs/common';
import { ResourceMeteringSessionStatus } from '@attraccess/database-entities';
import { TakeoverTestScope } from './resource-metering.persistence.spec';
export function registerTakeoverKeepsTheOutgoingSessionButRefusesToBillItsUnreliableTotalWhenTheNewMeterStartFails(
  scope: TakeoverTestScope,
): void {
  it('keeps the outgoing session but refuses to bill its unreliable total when the new meter start fails', async () => {
    await scope.parentScope.seedMeter({}, { finalAttempts: 1 });
    const first = await scope.start(scope.parentScope.users[0]);
    scope.parentScope.onStart = async () => {
      throw new Error('meter did not answer');
    };
    await expect(scope.start(scope.parentScope.users[1], { forceTakeOver: true })).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect((await scope.parentScope.usage.getActiveSession(1))?.id).toBe(first.id);
    expect((await scope.parentScope.sessionOf(first.id)).compromisedReason).toMatch(/re-initialized by a takeover/);

    scope.parentScope.onStart = scope.parentScope.ready;
    const ended = await scope.end(scope.parentScope.users[0]);
    expect(await scope.parentScope.sessionOf(ended.id)).toEqual(
      expect.objectContaining({
        status: ResourceMeteringSessionStatus.Failed,
        failureReason: expect.stringMatching(/re-initialized by a takeover/),
      }),
    );
    expect((await scope.parentScope.metering.getStatus(1)).unsettled).toEqual([
      expect.objectContaining({ retryable: false }),
    ]);
    expect((await scope.parentScope.items(ended.id)).items.filter((item) => item.name === 'Energy (kWh)')).toEqual([
      expect.objectContaining({ meterQuantity: null, meterCreditsPerUnit: 30, unitPrice: 0 }),
    ]);
  });
}
