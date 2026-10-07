import { ResourceMeteringSessionStatus } from '@attraccess/database-entities';
import { TakeoverTestScope } from './resource-metering.persistence.spec';
export function registerTakeoverReadsTheOutgoingTotalBeforeReInitializingTheMeterForTheNextSessionAndBillsBoth(
  scope: TakeoverTestScope,
): void {
  it('reads the outgoing total before re-initializing the meter for the next session and bills both', async () => {
    await scope.parentScope.seedMeter();
    const first = await scope.start(scope.parentScope.users[0]);
    scope.parentScope.onCollect = scope.parentScope.reading('2.0');
    const second = await scope.start(scope.parentScope.users[1], { forceTakeOver: true });

    expect(scope.parentScope.log.slice(-4)).toEqual([
      'meter:final',
      'meter:start',
      `flow:${scope.parentScope.T.INPUT_RESOURCE_USAGE_TAKEOVER}`,
      'charge',
    ]);
    const outgoing = await scope.parentScope.items(first.id);
    expect(outgoing.transaction.amount).toBe(-60);
    expect((await scope.parentScope.sessionOf(first.id)).status).toBe(ResourceMeteringSessionStatus.Settled);
    expect((await scope.parentScope.sessionOf(second.id)).status).toBe(ResourceMeteringSessionStatus.Active);
    expect((await scope.parentScope.sessionOf(first.id)).compromisedReason).toBeNull();

    scope.parentScope.onCollect = scope.parentScope.reading('0.5');
    const ended = await scope.end(scope.parentScope.users[1]);
    expect((await scope.parentScope.items(ended.id)).transaction.amount).toBe(-15);
  });
}
