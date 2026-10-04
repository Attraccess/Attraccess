import { compileFlowTemplate } from '../flow-template';
import { ResourceFlowNode } from '@attraccess/database-entities';
import { MeteringReadyExecutor } from './metering-ready.executor';
import { MeteringReportExecutor } from './metering-report.executor';
import { MeteringRunContext, NodeExecutionContext } from './node-executor.interface';

const context = (metering?: Partial<MeteringRunContext>): NodeExecutionContext & { complete: jest.Mock } => {
  const complete = jest.fn().mockResolvedValue(undefined);
  return {
    compileTemplate: compileFlowTemplate,
    metering: metering ? { meterId: 1, operationId: 'op', kind: 'final', complete, ...metering } : undefined,
    complete,
  } as never;
};

const node = (data: object) => ({ resourceId: 1, data: { meterId: 1, ...data } }) as unknown as ResourceFlowNode;

describe('metering completion nodes', () => {
  it('report renders a converted value, time and source from the flow payload and replies once', async () => {
    const ctx = context();
    ctx.metering = { meterId: 1, operationId: 'op', kind: 'final', complete: ctx.complete };
    const input = { wago: { measurement: { value: 1500, unit: 'watt-hour', at: '2026-09-28T10:00:00Z' } } };
    const result = await new MeteringReportExecutor({ report: jest.fn() } as never).execute(
      node({
        value: '{{scaleDecimal wago.measurement.value "1/1000"}}',
        observedAt: '{{wago.measurement.at}}',
        source: 'cc100',
      }),
      input,
      ctx,
    );
    expect(result.payload).toBe(input);
    expect(ctx.complete).toHaveBeenCalledWith({
      kind: 'reading',
      mode: 'total',
      value: '1.5',
      observedAt: '2026-09-28T10:00:00Z',
      source: 'cc100',
    });
  });

  it('reports increments outside a collection branch', async () => {
    const report = jest.fn().mockResolvedValue(undefined);
    await new MeteringReportExecutor({ report } as never).execute(
      node({ value: '3', mode: 'increment' }),
      {},
      context(),
    );
    expect(report).toHaveBeenCalledWith(
      1,
      1,
      expect.objectContaining({ kind: 'reading', mode: 'increment', value: '3' }),
      undefined,
      undefined,
      undefined,
    );
  });

  it('ready acknowledges a resettable source without a baseline', async () => {
    const ctx = context({ kind: 'start' });
    await new MeteringReadyExecutor().execute(node({}), {}, ctx);
    expect(ctx.complete).toHaveBeenCalledWith({ kind: 'ready', baseline: undefined, source: undefined });
  });

  it('ready records the baseline of a lifetime counter', async () => {
    const ctx = context({ kind: 'start' });
    await new MeteringReadyExecutor().execute(
      node({ baselineValue: '{{meter.total}}', source: 'grid' }),
      { meter: { total: 1000.25 } },
      ctx,
    );
    expect(ctx.complete).toHaveBeenCalledWith({
      kind: 'ready',
      baseline: { value: '1000.25' },
      source: 'grid',
    });
  });

  it('ready refuses a configured baseline that renders empty instead of billing the whole counter', async () => {
    const ctx = context({ kind: 'start' });
    await expect(
      new MeteringReadyExecutor().execute(node({ baselineValue: '{{meter.missing}}' }), {}, {
        ...ctx,
        compileTemplate: () => '',
      } as never),
    ).rejects.toThrow(/baseline value rendered empty/);
    expect(ctx.complete).not.toHaveBeenCalled();
  });

  it('report refuses a configured observed-at time that renders empty', async () => {
    const ctx = context({ kind: 'final' });
    await expect(
      new MeteringReportExecutor({ report: jest.fn() } as never).execute(
        node({ value: '1', observedAt: '{{at}}' }),
        {},
        {
          ...ctx,
          compileTemplate: (template: string) => (template === '{{at}}' ? '' : template),
        } as never,
      ),
    ).rejects.toThrow(/observed-at time rendered empty/);
    expect(ctx.complete).not.toHaveBeenCalled();
  });

  it('ready refuses to run outside a start branch', async () => {
    await expect(new MeteringReadyExecutor().execute(node({}), {}, context({ kind: 'final' }))).rejects.toThrow(
      /Metering start/,
    );
  });
});
