import { toLegacyMeterValue } from './legacy-energy-conversion';
import { MeteringValueError } from './quantity';

describe('migrated energy flow conversion', () => {
  it.each([
    ['1.5', 'kWh', '1500000000'],
    [1.5, 'kWh', '1500000000'],
    ['1500', 'Wh', '1500000000'],
    ['1500000', 'mWh', '1500000000'],
    ['0.0015', 'MWh', '1500000000'],
    ['5400', 'kJ', '1500000000'],
    ['5.4', 'MJ', '1500000000'],
    ['1.5', 'kilowatt-hour', '1500000000'],
    ['1500000', 'milliwatt-hour', '1500000000'],
    ['1.5e-3', 'MWh', '1500000000'],
    ['0', 'kWh', '0'],
    ['0.0000004', 'Wh', '0'],
    ['0.0000005', 'Wh', '1'],
  ])('converts %s %s to µWh exactly', (value, unit, expected) => {
    expect(toLegacyMeterValue(value, unit).toString()).toBe(expected);
  });

  it.each([
    ['nope', 'kWh', 'invalid_value'],
    ['', 'kWh', 'invalid_value'],
    [null, 'kWh', 'invalid_value'],
    [NaN, 'kWh', 'invalid_value'],
    ['-1', 'kWh', 'invalid_value'],
    ['1e400', 'kWh', 'invalid_value'],
    ['1', 'furlong', 'unsupported_unit'],
    ['1', '', 'unsupported_unit'],
    ['1', 'kW', 'power_is_not_energy'],
    ['1', 'W', 'power_is_not_energy'],
    ['1', 'watt', 'power_is_not_energy'],
  ])('rejects %s %s (%s)', (value, unit, code) => {
    expect(() => toLegacyMeterValue(value, unit)).toThrow(expect.objectContaining({ code }));
    expect(() => toLegacyMeterValue(value, unit)).toThrow(MeteringValueError);
  });
});
