interface NumericSchema {
  type: string;
  exclusiveMinimum?: number;
  minimum?: number;
  multipleOf?: number;
}

interface Decimal {
  coefficient: bigint;
  scale: number;
}

const ZERO = BigInt(0);
const ONE = BigInt(1);
const TWO = BigInt(2);
const TEN = BigInt(10);

function asDecimal(value: number): Decimal {
  const [mantissa, exponentText] = value.toString().toLowerCase().split('e');
  const exponent = Number(exponentText ?? 0);
  const [integer, fraction = ''] = mantissa.split('.');
  let coefficient = BigInt(`${integer}${fraction}`);
  let scale = fraction.length - exponent;

  if (scale < 0) {
    coefficient *= powerOfTen(-scale);
    scale = 0;
  }

  return { coefficient, scale };
}

function powerOfTen(exponent: number): bigint {
  let result = ONE;
  for (let index = 0; index < exponent; index += 1) result *= TEN;
  return result;
}

function floorDivide(dividend: bigint, divisor: bigint): bigint {
  if (dividend >= ZERO) return dividend / divisor;
  return -((-dividend + divisor - ONE) / divisor);
}

function ceilDivide(dividend: bigint, divisor: bigint): bigint {
  return -floorDivide(-dividend, divisor);
}

function decimalToNumber(coefficient: bigint, scale: number): number {
  const sign = coefficient < ZERO ? '-' : '';
  const digits = (coefficient < ZERO ? -coefficient : coefficient).toString().padStart(scale + 1, '0');
  if (scale === 0) return Number(`${sign}${digits}`);

  return Number(`${sign}${digits.slice(0, -scale)}.${digits.slice(-scale)}`);
}

function nextMultipleStrictlyGreaterThan(bound: number, multipleOf: number): number {
  const decimalBound = asDecimal(bound);
  const decimalMultiple = asDecimal(multipleOf);
  const scale = Math.max(decimalBound.scale, decimalMultiple.scale);
  const boundCoefficient = decimalBound.coefficient * powerOfTen(scale - decimalBound.scale);
  const multipleCoefficient = decimalMultiple.coefficient * powerOfTen(scale - decimalMultiple.scale);
  const nextMultiplier = floorDivide(boundCoefficient, multipleCoefficient) + ONE;

  return firstRepresentableValueAbove(bound, nextMultiplier * multipleCoefficient, multipleCoefficient, scale);
}

function firstRepresentableValueAbove(
  bound: number,
  initialCoefficient: bigint,
  increment: bigint,
  scale: number,
): number {
  const toNumber = (coefficient: bigint) => decimalToNumber(coefficient, scale);
  if (toNumber(initialCoefficient) > bound) return toNumber(initialCoefficient);

  // Several exact decimal values can round to the exclusive bound. Find the
  // first valid value whose Number representation is strictly greater instead.
  let lower = initialCoefficient;
  let upper = initialCoefficient + increment;
  let step = ONE;
  while (toNumber(upper) <= bound) {
    lower = upper;
    step *= TWO;
    upper = initialCoefficient + increment * step;
  }

  while (upper - lower > increment) {
    const middle = lower + increment * ((upper - lower) / increment / TWO);
    if (toNumber(middle) > bound) {
      upper = middle;
    } else {
      lower = middle;
    }
  }

  return toNumber(upper);
}

function greatestCommonDivisor(left: bigint, right: bigint): bigint {
  let a = left < ZERO ? -left : left;
  let b = right < ZERO ? -right : right;
  while (b !== ZERO) {
    [a, b] = [b, a % b];
  }
  return a;
}

function nextValidIntegerStrictlyGreaterThan(bound: number, multipleOf: number): number {
  const decimalBound = asDecimal(bound);
  const decimalMultiple = asDecimal(multipleOf);
  const denominator = powerOfTen(decimalMultiple.scale);
  const increment = decimalMultiple.coefficient / greatestCommonDivisor(decimalMultiple.coefficient, denominator);
  const firstInteger = floorDivide(decimalBound.coefficient, powerOfTen(decimalBound.scale)) + ONE;
  const minimum = ceilDivide(firstInteger, increment) * increment;

  return firstRepresentableValueAbove(bound, minimum, increment, 0);
}

function nextRepresentableNumber(value: number): number {
  const buffer = new ArrayBuffer(8);
  const view = new DataView(buffer);

  if (!Number.isFinite(value) || value === 0) {
    return value === 0 ? Number.MIN_VALUE : value;
  }

  view.setFloat64(0, value);
  let high = view.getUint32(0);
  let low = view.getUint32(4);

  if (value > 0) {
    low = low === 0xffffffff ? 0 : low + 1;
    high = low === 0 ? high + 1 : high;
  } else {
    low = low === 0 ? 0xffffffff : low - 1;
    high = low === 0xffffffff ? high - 1 : high;
  }

  view.setUint32(0, high);
  view.setUint32(4, low);
  return view.getFloat64(0);
}

export function getNumberFieldMinimum(schema: NumericSchema): number | undefined {
  if (schema.exclusiveMinimum === undefined) {
    return schema.minimum;
  }

  if (schema.type === 'integer') {
    return schema.multipleOf === undefined
      ? Math.floor(schema.exclusiveMinimum) + 1
      : nextValidIntegerStrictlyGreaterThan(schema.exclusiveMinimum, schema.multipleOf);
  }

  if (schema.multipleOf !== undefined) {
    return nextMultipleStrictlyGreaterThan(schema.exclusiveMinimum, schema.multipleOf);
  }

  return nextRepresentableNumber(schema.exclusiveMinimum);
}
