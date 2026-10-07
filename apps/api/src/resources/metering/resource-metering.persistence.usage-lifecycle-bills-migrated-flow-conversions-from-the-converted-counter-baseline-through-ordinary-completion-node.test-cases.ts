import { ResourceFlowNode } from '@attraccess/database-entities';
import { MeteringReport } from '../flows/node-executors';
import { MeteringReadyExecutor, MeteringReportExecutor } from '../flows/node-executors';
import { compileFlowTemplate } from '../flows/flow-template';
import { MeterFlowConversions1790300000000 } from '../../database/migrations/1790300000000-meter-flow-conversions';
import { UsageLifecycleTestScope } from './resource-metering.persistence.spec';
export function registerUsageLifecycleBillsMigratedFlowConversionsFromTheConvertedCounterBaselineThroughOrdinaryCompletionNode(
  scope: UsageLifecycleTestScope,
): void {
  it('bills migrated flow conversions from the converted counter baseline through ordinary completion nodes', async () => {
    await scope.seedMeter();
    const nodes = scope.source.getRepository(ResourceFlowNode);
    await nodes.update('ready', { data: { meterId: 1, baselineValue: '{{reading}}', legacyEnergyUnit: 'Wh' } });
    await nodes.update('report', { data: { meterId: 1, value: '{{reading}}', legacyEnergyUnit: '{{unit}}' } });
    const runner = scope.source.createQueryRunner();
    try {
      await new MeterFlowConversions1790300000000().up(runner);
    } finally {
      await runner.release();
    }
    const completion = (complete: (report: MeteringReport) => Promise<void>, kind: 'start' | 'final') => ({
      compileTemplate: compileFlowTemplate,
      metering: { meterId: 1, operationId: 'op', kind, complete },
    });
    scope.onStart = async ({ complete }) => {
      await new MeteringReadyExecutor().execute(
        await nodes.findOneByOrFail({ id: 'ready' }),
        { reading: '1000000' },
        completion(complete, 'start') as never,
      );
    };
    scope.onCollect = async ({ complete }) => {
      await new MeteringReportExecutor(scope.metering).execute(
        await nodes.findOneByOrFail({ id: 'report' }),
        { reading: '1001500', unit: 'Wh' },
        completion(complete, 'final') as never,
      );
    };
    await scope.start();
    const ended = await scope.end();
    const { transaction, items: rows } = await scope.items(ended.id);
    expect(transaction.amount).toBe(-45);
    expect(rows).toEqual([expect.objectContaining({ meterQuantity: '1.5', meterCreditsPerUnit: 30, unitPrice: 45 })]);
    expect((await nodes.findOneByOrFail({ id: 'report' })).data).not.toHaveProperty('legacyEnergyUnit');
  });
}
