import { ResourceFlowNode } from '@attraccess/database-entities';
import { MeteringReadyExecutor } from './metering-ready.executor';
import { MeteringReportExecutor } from './metering-report.executor';
import { MeteringRunContext, NodeExecutionContext } from './node-executor.interface';

const render = (template: string, data: object) =>
  template.replace(/\{\{(.+?)\}\}/g, (_match, path: string) =>
    String(path.split('.').reduce((value: never, key) => (value as Record<string, never>)?.[key], data as never)),
  );

const context = (metering?: Partial<MeteringRunContext>): NodeExecutionContext & { complete: jest.Mock } => {
  const complete = jest.fn().mockResolvedValue(undefined);
  return {
    compileTemplate: render,
    metering: metering ? { operationId: 'op', kind: 'final', complete, ...metering } : undefined,
    complete,
  } as never;
};

const node = (data: object) => ({ data }) as ResourceFlowNode;

describe('metering completion nodes', () => {
  it('report renders value, unit, time and source from the flow payload and replies once', async () => {
    const ctx = context();
    ctx.metering = { operationId: 'op', kind: 'final', complete: ctx.complete };
    const input = { wago: { measurement: { value: 1500, unit: 'watt-hour', at: '2026-09-28T10:00:00Z' } } };
    const result = await new MeteringReportExecutor().execute(
      node({
        value: '{{wago.measurement.value}}',
        unit: '{{wago.measurement.unit}}',
        observedAt: '{{wago.measurement.at}}',
        source: 'cc100',
      }),
      input,
      ctx,
    );
    expect(result.payload).toBe(input);
    expect(ctx.complete).toHaveBeenCalledWith({
      kind: 'reading',
      value: '1500',
      unit: 'watt-hour',
      observedAt: '2026-09-28T10:00:00Z',
      source: 'cc100',
    });
  });

  it('report refuses to run outside a collection branch', async () => {
    await expect(
      new MeteringReportExecutor().execute(node({ value: '1', unit: 'kWh' }), {}, context()),
    ).rejects.toThrow(/Metering collection/);
    const start = context({ kind: 'start' });
    await expect(new MeteringReportExecutor().execute(node({ value: '1', unit: 'kWh' }), {}, start)).rejects.toThrow(
      /Metering collection/,
    );
    expect(start.complete).not.toHaveBeenCalled();
  });

  it('ready acknowledges a resettable source without a baseline', async () => {
    const ctx = context({ kind: 'start' });
    await new MeteringReadyExecutor().execute(node({}), {}, ctx);
    expect(ctx.complete).toHaveBeenCalledWith({ kind: 'ready', baseline: undefined, source: undefined });
  });

  it('ready records the baseline of a lifetime counter', async () => {
    const ctx = context({ kind: 'start' });
    await new MeteringReadyExecutor().execute(
      node({ baselineValue: '{{meter.total}}', baselineUnit: 'kWh', source: 'grid' }),
      { meter: { total: 1000.25 } },
      ctx,
    );
    expect(ctx.complete).toHaveBeenCalledWith({
      kind: 'ready',
      baseline: { value: '1000.25', unit: 'kWh' },
      source: 'grid',
    });
  });

  it('ready refuses to run outside a start branch', async () => {
    await expect(new MeteringReadyExecutor().execute(node({}), {}, context({ kind: 'final' }))).rejects.toThrow(
      /Metering start/,
    );
  });
});
