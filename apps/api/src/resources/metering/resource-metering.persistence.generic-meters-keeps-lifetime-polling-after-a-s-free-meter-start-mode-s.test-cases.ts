import {
  ResourceMeter,
  ResourceFlowEdge,
  ResourceFlowNode,
  ResourceMeteringOperation,
  ResourceMeteringSession,
  ResourceUsage,
} from '@attraccess/database-entities';
import { GenericMetersTestScope } from './resource-metering.persistence.spec';
export function registerGenericMetersKeepsLifetimePollingAfterASFreeMeterStartModeS(
  scope: GenericMetersTestScope,
): void {
  it.each([
    ['failed', 'increment'],
    ['failed', 'total'],
    ['unconfigured', 'increment'],
    ['unconfigured', 'total'],
  ] as const)('keeps lifetime polling after a %s free-meter start, mode=%s', async (start, mode) => {
    await scope.seedMeter({}, { interimIntervalMinutes: 1 });
    await scope.metering.setRate(1, 1, 0);
    await scope.source.getRepository(ResourceMeter).update(1, { counterValue: '100000000000' });
    if (start === 'failed') {
      scope.onStart = async () => {
        throw new Error('offline');
      };
    } else {
      await scope.source.getRepository(ResourceFlowNode).delete(['start', 'ready']);
      await scope.source.getRepository(ResourceFlowEdge).delete('e1');
    }
    const started = await scope.usage.startSession(1, scope.users[0], {} as never);
    expect(await scope.source.getRepository(ResourceMeteringSession).count()).toBe(0);
    // Keep the poll strictly after the persisted boundary, even on fast machines.
    await scope.source.getRepository(ResourceUsage).update(started.id, { startTime: new Date(Date.now() - 1_000) });
    scope.onCollect = scope.reading(mode === 'increment' ? '5' : '105', { mode });
    await scope.metering.collectInterimReadings();
    expect((await scope.metering.listMeters(1))[0]).toMatchObject({ counterValue: '105', lifetimeValue: '5' });
    const operation = await scope.source.getRepository(ResourceMeteringOperation).findOneByOrFail({ kind: 'interim' });
    expect(operation).toMatchObject({ status: 'completed', sessionId: null });
    await scope.usage.endSession(1, scope.users[0], {} as never);
    const bill = await scope.items(started.id);
    expect(bill.transaction.amount).toBe(0);
    expect(bill.items).toMatchObject([{ unitPrice: 0, meterQuantity: null, meterCreditsPerUnit: 0 }]);
  });
}
