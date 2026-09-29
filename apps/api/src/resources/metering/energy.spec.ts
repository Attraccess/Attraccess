import { energyCharge, formatKwh, MeteringValueError, toMicroWh } from './energy';

describe('energy arithmetic', () => {
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
    expect(toMicroWh(value, unit).toString()).toBe(expected);
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
    expect(() => toMicroWh(value, unit)).toThrow(expect.objectContaining({ code }));
    expect(() => toMicroWh(value, unit)).toThrow(MeteringValueError);
  });

  it('charges 1.5 kWh at 0.30/kWh exactly 0.45', () => {
    expect(energyCharge(toMicroWh('1.5', 'kWh'), 30)).toBe(45);
  });

  it('rounds half up to a whole minor unit without float drift', () => {
    expect(energyCharge(toMicroWh('0.1', 'kWh'), 30)).toBe(3);
    expect(energyCharge(toMicroWh('0.05', 'kWh'), 30)).toBe(2); // 1.5 -> 2
    expect(energyCharge(toMicroWh('0.0499999', 'kWh'), 30)).toBe(1);
    expect(energyCharge(BigInt(0), 30)).toBe(0);
    expect(energyCharge(toMicroWh('9007199', 'kWh'), 30)).toBe(270215970);
  });

  it('formats kWh without trailing zeros', () => {
    expect(formatKwh(BigInt('1500000000'))).toBe('1.5');
    expect(formatKwh(BigInt(0))).toBe('0');
    expect(formatKwh(BigInt(1))).toBe('0.000000001');
  });
});
