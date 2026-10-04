import { formatMeterValue, meterCharge, toMeterValue } from './quantity';

it('uses exact decimals for arbitrary large counters and fractional readings', () => {
  expect(formatMeterValue(toMeterValue('12345678901234567890.123456789'))).toBe('12345678901234567890.123456789');
  expect(formatMeterValue(toMeterValue('1e-3'))).toBe('0.001');
  expect(formatMeterValue(toMeterValue('0.0000000005'))).toBe('0.000000001');
  expect(meterCharge(toMeterValue('1.5'), 30)).toBe(45);
  expect(meterCharge(toMeterValue('0.05'), 30)).toBe(2);
});
it.each(['', 'NaN', '-1', 'Infinity', '1e999999', '9'.repeat(101)])('rejects invalid readings: %s', (reading) => {
  expect(() => toMeterValue(reading)).toThrow();
});
it('rejects a bill that would lose integer precision', () => {
  expect(() => meterCharge(toMeterValue('99999999999999'), 999999)).toThrow('billing range');
});
