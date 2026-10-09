import { describe, expect, it } from 'vitest';
import { BUILTIN_MODBUS_PROFILES } from '../../../../modbus/model';
import { formatMeterMeasurement } from './measurement-display';

describe('complete meter values', () => {
  const register = (id: string) => {
    const value = BUILTIN_MODBUS_PROFILES[0].measurements.find((m) => m.id === id);
    if (!value) throw new Error(`Missing meter field ${id}`);
    return value;
  };
  it.each([
    ['frequency', 50010, 'millihertz', '50.01 Hz'],
    ['apparent-power-l2', 1234567, 'milli-volt-ampere', '1.235 kVA'],
    ['import-reactive-energy', 500123, 'millivar-hour', '500.123 varh'],
    ['power-factor-l3', -975, 'milli-ratio', '-0.975'],
    ['s0-pulse-rate', 1000000, 'milli-pulse-per-kilowatt-hour', '1,000 imp/kWh'],
    ['s0-pulse-width', 30, 'millisecond', '30 ms'],
    ['meter-code', 4370000, 'milli-number', '0x1112'],
    ['checksum', 4294967295000, 'milli-number', '0xFFFFFFFF'],
    ['parity-code', 2000, 'milli-number', 'None'],
    ['current-direction-l1', 70000, 'milli-number', 'Import (F)'],
    ['day-energy', -1200, 'milliwatt-hour', '-1.2 Wh'],
  ])('formats %s without losing its engineering unit or code', (id, value, unit, expected) => {
    expect(formatMeterMeasurement(register(id), { value, unit }, 'en')).toBe(expected);
  });
  it('localizes quantities and enum labels, and keeps unavailable samples empty', () => {
    expect(formatMeterMeasurement(register('voltage-l2'), { value: 237123, unit: 'millivolt' }, 'de')).toBe(
      '237,123 V',
    );
    expect(
      formatMeterMeasurement(register('parity-code'), { value: 2000, unit: 'milli-number' }, 'de', (label) =>
        label === 'None' ? 'Keine' : label,
      ),
    ).toBe('Keine');
    expect(formatMeterMeasurement(register('voltage-l3'), undefined, 'de')).toBe('—');
  });
});
