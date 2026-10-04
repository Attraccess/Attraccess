import { applyBillingFactor, toExactCredits } from '@attraccess/shared';

export class MeteringValueError extends Error {
  constructor(
    public readonly code: 'invalid_value' | 'counter_decreased' | 'stale_reading' | 'invalid_observation_time',
    message: string,
  ) {
    super(message);
    this.name = 'MeteringValueError';
  }
}

const SCALE = BigInt(1_000_000_000);
const MAX = BigInt('999999999999999999999999999999999999');

/** Exact, non-negative decimal values, rounded half-up to nine decimal places. */
export function toMeterValue(value: unknown): bigint {
  const text =
    typeof value === 'number' && Number.isFinite(value) ? String(value) : typeof value === 'string' ? value.trim() : '';
  const match = /^\+?(\d+)(?:\.(\d+))?(?:[eE]([+-]?\d+))?$/.exec(text);
  if (!match || text.length > 100)
    throw new MeteringValueError('invalid_value', 'The reading is missing, not a number, or negative');
  const fraction = match[2] ?? '';
  const exponent = Number(match[3] ?? 0) - fraction.length + 9;
  if (Math.abs(exponent) > 100) throw new MeteringValueError('invalid_value', 'The reading is out of range');
  const numerator = BigInt(match[1] + fraction) * BigInt('1' + '0'.repeat(Math.max(exponent, 0)));
  const denominator = BigInt('1' + '0'.repeat(Math.max(-exponent, 0)));
  const result = (numerator * BigInt(2) + denominator) / (denominator * BigInt(2));
  if (result > MAX) throw new MeteringValueError('invalid_value', 'The reading is out of range');
  return result;
}

export function meterCharge(value: bigint, creditsPerUnit: number): number {
  if (!Number.isSafeInteger(creditsPerUnit) || creditsPerUnit < 0) throw new RangeError('Invalid meter rate');
  const result = (value * BigInt(creditsPerUnit) + SCALE / BigInt(2)) / SCALE;
  if (result > BigInt(Number.MAX_SAFE_INTEGER))
    throw new RangeError('Meter charge exceeds the supported billing range');
  return Number(result);
}

/** Match Math.round's half-towards-positive-infinity policy without floating-point intermediates. */
export function meterDiscount(charge: number, factor: number): number {
  if (charge < 0) throw new RangeError('Invalid meter billing factor');
  return applyBillingFactor(toExactCredits(charge), factor).discount;
}

export function formatMeterValue(value: bigint): string {
  const fraction = (value % SCALE).toString().padStart(9, '0').replace(/0+$/, '');
  return fraction ? `${value / SCALE}.${fraction}` : `${value / SCALE}`;
}
