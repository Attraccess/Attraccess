import { BadRequestException } from '@nestjs/common';
import {
  ResourceMeter,
  ResourceFlowNode,
  ResourceMeteringSession,
  ResourceMeteringSessionStatus,
} from '@attraccess/database-entities';
import { TakeoverTestScope } from './resource-metering.persistence.spec';
export function registerTakeoverPreservesIncrementOnlyChargesWhenALaterMeterFailsTakeoverInitialization(
  scope: TakeoverTestScope,
): void {
  it('preserves increment-only charges when a later meter fails takeover initialization', async () => {
    const requestedMeter = await scope.parentScope.source.getRepository(ResourceMeter).save({
      resourceId: 1,
      name: 'Water',
      creditsPerUnit: 10,
    });
    await scope.parentScope.seedMeter({}, { finalAttempts: 1 });
    const nodes = scope.parentScope.source.getRepository(ResourceFlowNode);
    for (const node of await nodes.find()) {
      await nodes.update(node.id, { data: { ...node.data, meterId: requestedMeter.id } });
    }
    await nodes.save({
      id: 'increment-report',
      resourceId: 1,
      type: scope.parentScope.T.OUTPUT_METERING_REPORT,
      data: { meterId: 1, mode: 'increment', value: '1' },
    });
    const first = await scope.start(scope.parentScope.users[0]);
    await scope.parentScope.metering.report(1, 1, { kind: 'reading', mode: 'increment', value: '2' });
    const sessions = scope.parentScope.source.getRepository(ResourceMeteringSession);
    const untouched = await sessions.findOneByOrFail({ usageId: first.id, meterId: 1 });
    scope.parentScope.onStart = async () => {
      throw new Error('water meter start failed');
    };
    await expect(scope.start(scope.parentScope.users[1], { forceTakeOver: true })).rejects.toBeInstanceOf(
      BadRequestException,
    );

    expect((await scope.parentScope.usage.getActiveSession(1))?.id).toBe(first.id);
    expect(await sessions.findOneByOrFail({ id: untouched.id })).toEqual(untouched);
    expect(await sessions.countBy({ status: ResourceMeteringSessionStatus.Active })).toBe(2);
    expect(await sessions.findOneByOrFail({ usageId: first.id, meterId: requestedMeter.id })).toEqual(
      expect.objectContaining({ compromisedReason: expect.stringMatching(/re-initialized by a takeover/) }),
    );

    await scope.end(scope.parentScope.users[0]);
    const bill = await scope.parentScope.items(first.id);
    expect(bill.transaction.amount).toBe(-60);
    expect(bill.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'Energy (kWh)',
          meterQuantity: '2',
          meterCreditsPerUnit: 30,
          unitPrice: 60,
        }),
        expect.objectContaining({ name: 'Water', meterQuantity: null, meterCreditsPerUnit: 10, unitPrice: 0 }),
      ]),
    );
    expect((await sessions.findOneByOrFail({ id: untouched.id })).status).toBe(ResourceMeteringSessionStatus.Settled);
  });
}
