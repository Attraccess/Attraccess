import { MEASUREMENT_UNITS } from '../../../../measurement-contract';
import { registerCount, type ModbusMeasurement } from '../../../../modbus/model';

/** Decode the published engineering unit before formatting meter metadata or quantities. */
export function formatMeterMeasurement(
  register: ModbusMeasurement,
  sample: { value: number; unit: string } | undefined,
  language: string,
  translate: (label: string) => string = (label) => label,
): string {
  if (!sample) return '—';
  const milli = Object.entries(MEASUREMENT_UNITS).find(([, wire]) => wire === sample.unit);
  const unit = milli?.[0] ?? sample.unit;
  const value = sample.value / (milli ? 1000 : 1);
  const label = register.valueLabels?.[String(value)];
  if (label) return translate(label);
  if (register.display === 'hex')
    return `0x${Math.trunc(value)
      .toString(16)
      .toUpperCase()
      .padStart(registerCount(register) * 4, '0')}`;
  if (register.display === 'ascii' && Number.isInteger(value) && value >= 32 && value <= 126)
    return String.fromCharCode(value);
  const symbols: Record<string, string> = {
    watt: 'W',
    'watt-hour': 'Wh',
    volt: 'V',
    ampere: 'A',
    percent: '%',
    hertz: 'Hz',
    var: 'var',
    'var-hour': 'varh',
    'volt-ampere': 'VA',
    ratio: '',
    number: '',
    second: 's',
    'pulse-per-kilowatt-hour': 'imp/kWh',
  };
  const kilo = ['watt', 'watt-hour', 'var', 'var-hour', 'volt-ampere'].includes(unit) && Math.abs(value) >= 1000;
  if (unit === 'second' && value > 0 && value < 1)
    return `${new Intl.NumberFormat(language, { maximumFractionDigits: 3 }).format(value * 1000)} ms`;
  return `${new Intl.NumberFormat(language, { maximumFractionDigits: 3 }).format(value / (kilo ? 1000 : 1))} ${kilo ? 'k' : ''}${symbols[unit] ?? unit}`.trim();
}
