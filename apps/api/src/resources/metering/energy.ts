/** Exact energy arithmetic. Energy is held as integer micro-watt-hours (µWh); never floats. */

export class MeteringValueError extends Error {
  constructor(
    public readonly code:
      | 'invalid_value'
      | 'unsupported_unit'
      | 'power_is_not_energy'
      | 'counter_decreased'
      | 'stale_reading'
      | 'invalid_observation_time',
    message: string,
  ) {
    super(message);
    this.name = 'MeteringValueError';
  }
}

const B = (n: number | string) => BigInt(n);
const MICRO_WH_PER_KWH = B('1000000000');
const MAX_MICRO_WH = B(Number.MAX_SAFE_INTEGER);

/** µWh per unit as a fraction, so joule-based units stay exact until the final rounding. */
const UNIT_FACTORS: Record<string, [bigint, bigint]> = {
  mwh: [B(1_000), B(1)],
  wh: [B(1_000_000), B(1)],
  kwh: [MICRO_WH_PER_KWH, B(1)],
  mwh_mega: [B('1000000000000'), B(1)],
  j: [B(2500), B(9)],
  kj: [B(2_500_000), B(9)],
  mj: [B('2500000000'), B(9)],
};

// Case matters for the SI prefixes (mWh = milli, MWh = mega), so resolve those before lowercasing.
const CASE_SENSITIVE: Record<string, string> = {
  mWh: 'mwh',
  MWh: 'mwh_mega',
  Wh: 'wh',
  kWh: 'kwh',
  J: 'j',
  kJ: 'kj',
  MJ: 'mj',
};
const WORD_UNITS: Record<string, string> = {
  kwh: 'kwh',
  wh: 'wh',
  'milliwatt-hour': 'mwh',
  'watt-hour': 'wh',
  'kilowatt-hour': 'kwh',
  'megawatt-hour': 'mwh_mega',
  joule: 'j',
  kilojoule: 'kj',
  megajoule: 'mj',
};
const POWER_UNITS = /^(?:[mkMG]?W|(?:milli|kilo|mega)?watts?)$/i;

function resolveUnit(unit: string): [bigint, bigint] {
  const trimmed = unit.trim();
  const key = CASE_SENSITIVE[trimmed] ?? WORD_UNITS[trimmed.toLowerCase().replace(/s$/, '')];
  if (key) return UNIT_FACTORS[key];
  if (POWER_UNITS.test(trimmed)) {
    throw new MeteringValueError(
      'power_is_not_energy',
      `"${trimmed}" is a power unit; a power sample is not consumed energy. Report an energy total (e.g. kWh).`,
    );
  }
  throw new MeteringValueError('unsupported_unit', `Unsupported energy unit "${trimmed}"`);
}

// String construction: the test transpilation target lowers ** on bigint to Math.pow.
const pow10 = (n: number) => B('1' + '0'.repeat(n));

const DECIMAL = /^([+-]?)(\d+)(?:\.(\d+))?(?:[eE]([+-]?\d+))?$/;

/** Parses a non-negative decimal reading and converts it to µWh, rounding half up at the µWh boundary. */
export function toMicroWh(value: unknown, unit: unknown): bigint {
  if (typeof unit !== 'string' || unit.trim() === '') {
    throw new MeteringValueError('unsupported_unit', 'The energy unit is missing');
  }
  const [num, den] = resolveUnit(unit);
  const text =
    typeof value === 'number' && Number.isFinite(value) ? String(value) : typeof value === 'string' ? value.trim() : '';
  const match = DECIMAL.exec(text);
  if (!match || match[1] === '-') {
    throw new MeteringValueError('invalid_value', 'The reading is missing, not a number, or negative');
  }
  const fraction = match[3] ?? '';
  const exponent = Number(match[4] ?? 0) - fraction.length;
  if (Math.abs(exponent) > 40) throw new MeteringValueError('invalid_value', 'The reading is out of range');
  const numerator = B(match[2] + fraction) * num * pow10(Math.max(exponent, 0));
  const denominator = den * pow10(Math.max(-exponent, 0));
  const result = (numerator * B(2) + denominator) / (denominator * B(2));
  if (result > MAX_MICRO_WH) throw new MeteringValueError('invalid_value', 'The reading is out of range');
  return result;
}

/** Credits owed for the energy, rounded half up to a whole minor currency unit. */
export function energyCharge(microWh: bigint, creditsPerKwh: number): number {
  if (!Number.isSafeInteger(creditsPerKwh) || creditsPerKwh < 0) {
    throw new RangeError('creditsPerKwh must be a non-negative integer');
  }
  return Number((microWh * B(creditsPerKwh) + MICRO_WH_PER_KWH / B(2)) / MICRO_WH_PER_KWH);
}

export function formatKwh(microWh: bigint): string {
  const whole = microWh / MICRO_WH_PER_KWH;
  const fraction = (microWh % MICRO_WH_PER_KWH).toString().padStart(9, '0').replace(/0+$/, '');
  return fraction ? `${whole}.${fraction}` : `${whole}`;
}
