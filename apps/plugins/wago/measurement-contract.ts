/** Configuration transforms remain in their original physical units, including persisted v1 snapshots. */
const UNITS = {
  ampere: 'milliampere',
  volt: 'millivolt',
  watt: 'milliwatt',
  'watt-hour': 'milliwatt-hour',
  percent: 'millipercent',
} as const;

export type MeasurementUnit = keyof typeof UNITS | (typeof UNITS)[keyof typeof UNITS];
export type MeasurementKind = 'live' | 'cumulative';
export type Measurement = { channelId: string; unit: MeasurementUnit; value: number; kind: MeasurementKind };

export class MeasurementContractError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export function encodeMeasurement(
  channelId: string,
  raw: unknown,
  transform: { unit: string; scale: number; offset: number; kind?: MeasurementKind },
): Measurement {
  if (!Object.prototype.hasOwnProperty.call(UNITS, transform.unit))
    throw new MeasurementContractError('unknown_measurement_unit', 'measurement unit is not supported');
  if (
    !Number.isFinite(transform.scale) ||
    !Number.isFinite(transform.offset) ||
    (transform.kind !== undefined && !['live', 'cumulative'].includes(transform.kind))
  )
    throw new MeasurementContractError('invalid_measurement_transform', 'measurement transform or kind is invalid');
  if (typeof raw !== 'number' || !Number.isFinite(raw))
    throw new MeasurementContractError('invalid_measurement_value', 'measurement reading must be a finite number');
  // Do not rewrite accepted snapshots: their hash/revision and transform semantics stay intact.
  // Evaluate the numbers' canonical decimal representations exactly. A relative
  // floating-point tolerance would also accept real fractional milli-units at large magnitudes.
  const reading = decimal(raw);
  const scale = decimal(transform.scale);
  const offset = decimal(transform.offset);
  const productExponent = reading.exponent + scale.exponent;
  const exponent = Math.min(productExponent, offset.exponent);
  const coefficient =
    reading.coefficient * scale.coefficient * powerOfTen(productExponent - exponent) +
    offset.coefficient * powerOfTen(offset.exponent - exponent);
  const milliValue = integerAtExponent(coefficient, exponent + 3);
  const wholeValue = integerAtExponent(coefficient, exponent);
  const unit = transform.unit as keyof typeof UNITS;
  // Fallback only on milli-range overflow, and only for exact whole physical units.
  // Never truncate or round a fraction to make an overflowing measurement fit.
  const useWholeUnits =
    milliValue !== undefined && !isSafeInteger(milliValue) && wholeValue !== undefined && isSafeInteger(wholeValue);
  if (!useWholeUnits && (milliValue === undefined || !isSafeInteger(milliValue)))
    throw new MeasurementContractError(
      'invalid_measurement_transform',
      'measurement must fit integer milli-units or exact safe whole units on milli overflow',
    );
  return {
    channelId,
    unit: useWholeUnits ? unit : UNITS[unit],
    value: Number(useWholeUnits ? wholeValue : milliValue),
    kind: transform.kind ?? 'live',
  };
}

function powerOfTen(exponent: number): bigint {
  // String construction also works with the repository's ES2015 test transpilation.
  return BigInt('1' + '0'.repeat(exponent));
}

function decimal(value: number): { coefficient: bigint; exponent: number } {
  const [mantissa, exponent = '0'] = value.toString().split('e');
  const [whole, fraction = ''] = mantissa.split('.');
  return { coefficient: BigInt(whole + fraction), exponent: Number(exponent) - fraction.length };
}

function integerAtExponent(coefficient: bigint, exponent: number): bigint | undefined {
  if (exponent >= 0) return coefficient * powerOfTen(exponent);
  const divisor = powerOfTen(-exponent);
  return coefficient % divisor === BigInt(0) ? coefficient / divisor : undefined;
}

function isSafeInteger(value: bigint): boolean {
  const maximum = BigInt(Number.MAX_SAFE_INTEGER);
  return value >= -maximum && value <= maximum;
}

export function parseMeasurement(value: Record<string, unknown>): Measurement {
  if (
    typeof value.channelId !== 'string' ||
    !value.channelId.trim() ||
    !(Object.values(UNITS) as string[]).concat(Object.keys(UNITS)).includes(value.unit as string) ||
    !Number.isSafeInteger(value.value) ||
    !['live', 'cumulative'].includes(value.kind as string)
  )
    throw new MeasurementContractError('invalid_measurement_message', 'invalid integer measurement message');
  return {
    channelId: value.channelId,
    unit: value.unit as MeasurementUnit,
    value: value.value as number,
    kind: value.kind as MeasurementKind,
  };
}
