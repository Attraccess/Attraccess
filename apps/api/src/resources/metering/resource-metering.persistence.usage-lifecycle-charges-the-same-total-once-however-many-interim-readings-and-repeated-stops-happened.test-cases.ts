import { BadRequestException } from '@nestjs/common';
import { ResourceMeteringOperation, ResourceMeteringSession } from '@attraccess/database-entities';
import { UsageLifecycleTestScope } from './resource-metering.persistence.spec';
export function registerUsageLifecycleChargesTheSameTotalOnceHoweverManyInterimReadingsAndRepeatedStopsHappened(
  scope: UsageLifecycleTestScope,
): void {
  it('charges the same total once however many interim readings and repeated stops happened', async () => {
    await scope.seedMeter();
    const first = await scope.start();
    const session = await scope.source.getRepository(ResourceMeteringSession).findOneByOrFail({ usageId: first.id });
    for (const total of ['0.5', '1.0', '1.0', '1.4']) {
      scope.onCollect = scope.reading(total);
      await scope.metering['runOperation'](session, 'interim', {
        trigger: scope.T.INPUT_METERING_COLLECT,
        timeoutSeconds: 5,
      });
    }
    scope.onCollect = scope.reading('1.5');
    const ended = await scope.end();
    expect((await scope.items(ended.id)).items.filter((item) => item.name === 'Energy (kWh)')).toHaveLength(1);
    // A second stop finds no active session and cannot add the energy again.
    await expect(scope.end()).rejects.toBeInstanceOf(BadRequestException);
    expect((await scope.items(ended.id)).transaction.amount).toBe(-45);
    // Settling again inside another transaction is a no-op.
    const finalOperation = await scope.source
      .getRepository(ResourceMeteringOperation)
      .findOneByOrFail({ kind: 'final' });
    await scope.source.transaction((manager) =>
      scope.metering.settleInTransaction(manager, ended.id, {
        status: 'collected',
        meters: { [finalOperation.sessionId ?? 'missing']: { status: 'ready', operationId: finalOperation.id } },
      }),
    );
    expect((await scope.items(ended.id)).items.filter((item) => item.name === 'Energy (kWh)')).toHaveLength(1);
  });
}
