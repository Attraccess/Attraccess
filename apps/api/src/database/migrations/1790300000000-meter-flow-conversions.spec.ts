import { DataSource } from 'typeorm';
import { MeterFlowConversions1790300000000 } from './1790300000000-meter-flow-conversions';
import { compileFlowTemplate } from '../../resources/flows/flow-template';
import { toMeterValue } from '../../resources/metering/quantity';

describe('meter flow conversion migration', () => {
  let source: DataSource;
  beforeEach(async () => {
    source = await new DataSource({ type: 'sqlite', database: ':memory:' }).initialize();
    await source.query('CREATE TABLE resource_flow_node(id varchar PRIMARY KEY, type varchar, data text)');
  });
  afterEach(() => source.destroy());

  async function migrate(data: object, kind = 'report') {
    await source.query('INSERT INTO resource_flow_node VALUES (?, ?, ?)', [
      'node',
      `output.resource.metering.${kind}`,
      JSON.stringify({ meterId: 42, ...data }),
    ]);
    const runner = source.createQueryRunner();
    try {
      await new MeterFlowConversions1790300000000().up(runner);
    } finally {
      await runner.release();
    }
    return JSON.parse((await source.query('SELECT data FROM resource_flow_node'))[0].data);
  }

  it.each([
    ['1.5', 'kWh', '1500000000'],
    ['1500', 'Wh', '1500000000'],
    ['1500000', 'mWh', '1500000000'],
    ['0.0015', 'MWh', '1500000000'],
    ['5400000', 'J', '1500000000'],
    ['5400', 'kJ', '1500000000'],
    ['5.4', 'MJ', '1500000000'],
    ['5400000', 'j', '1500000000'],
    ['5400', 'kj', '1500000000'],
    ['5.4', 'mj', '1500000000'],
    ['5400000', 'Js', '1500000000'],
    ['5400', 'kjs', '1500000000'],
    ['5.4', 'MJs', '1500000000'],
    ['1500000', 'milliwatt-hour', '1500000000'],
    ['1.5e-3', 'MWh', '1500000000'],
    ['0', 'Wh', '0'],
    ['0.0000004', 'Wh', '0'],
    ['0.0000005', 'Wh', '1'],
    ['9007199254.740991', 'Wh', '9007199254740991'],
  ])('preserves exact future readings for %s %s, with fixed and dynamic units', async (value, unit, expected) => {
    // The report and start baseline must use the same conversion to avoid charging the whole counter.
    await source.query('INSERT INTO resource_flow_node VALUES (?, ?, ?), (?, ?, ?)', [
      'fixed',
      'output.resource.metering.report',
      JSON.stringify({ meterId: 42, value: '{{reading}}', legacyEnergyUnit: unit }),
      'dynamic',
      'output.resource.metering.ready',
      JSON.stringify({ meterId: 42, baselineValue: '{{reading}}', legacyEnergyUnit: '{{unit}}' }),
    ]);
    const runner = source.createQueryRunner();
    try {
      await new MeterFlowConversions1790300000000().up(runner);
    } finally {
      await runner.release();
    }
    const nodes = (await source.query('SELECT data FROM resource_flow_node')).map(({ data }) => JSON.parse(data));
    expect(nodes.every((data) => data.legacyEnergyUnit === undefined && data.meterId === 42)).toBe(true);
    expect(toMeterValue(compileFlowTemplate(nodes[0].value, { reading: value })).toString()).toBe(expected);
    expect(toMeterValue(compileFlowTemplate(nodes[1].baselineValue, { reading: value, unit })).toString()).toBe(
      expected,
    );
  });

  it('keeps arbitrary templates, aliases, timestamps and sources intact and runs only once', async () => {
    const data = await migrate({
      value: '{{#if ready}}{{reading}}{{else}}0{{/if}}',
      legacyEnergyUnit: ' {{unit}} ',
      observedAt: '{{at}}',
      source: 'grid',
    });
    expect(compileFlowTemplate(data.value, { ready: true, reading: '1500', unit: ' WATT-HOURS ' })).toBe('1.5');
    expect(compileFlowTemplate(data.value, { ready: false, unit: 'Wh' })).toBe('0');
    expect(data).toMatchObject({ observedAt: '{{at}}', source: 'grid', meterId: 42 });
    const before = await source.query('SELECT * FROM resource_flow_node');
    const runner = source.createQueryRunner();
    try {
      await new MeterFlowConversions1790300000000().up(runner);
      expect(await source.query('SELECT * FROM resource_flow_node')).toEqual(before);
      await expect(new MeterFlowConversions1790300000000().down(runner)).rejects.toThrow('pre-migration backup');
    } finally {
      await runner.release();
    }
  });

  it.each(['', '   ', 'kW', 'W', 'watt', 'bananas', undefined])('rejects an invalid future unit (%s)', async (unit) => {
    const data = await migrate({ value: '{{reading}}', legacyEnergyUnit: '{{unit}}' });
    expect(() => compileFlowTemplate(data.value, { reading: '1000', unit })).toThrow('no mapping');
  });

  it('preserves a resettable start without a baseline and leaves generic nodes unchanged', async () => {
    const ready = await migrate({ legacyEnergyUnit: 'Wh' }, 'ready');
    expect(ready).toEqual({ meterId: 42 });
    await source.query('UPDATE resource_flow_node SET data = ?', [JSON.stringify({ meterId: 42, value: '123' })]);
    const runner = source.createQueryRunner();
    try {
      await new MeterFlowConversions1790300000000().up(runner);
      expect(JSON.parse((await source.query('SELECT data FROM resource_flow_node'))[0].data)).toEqual({
        meterId: 42,
        value: '123',
      });
      await new MeterFlowConversions1790300000000().down(runner);
    } finally {
      await runner.release();
    }
  });

  it('rejects a negative reading even when scaling would round it to zero', async () => {
    const data = await migrate({ value: '{{reading}}', legacyEnergyUnit: 'Wh' });
    expect(() => compileFlowTemplate(data.value, { reading: '-0.0000001' })).toThrow('below its minimum');
  });
});
