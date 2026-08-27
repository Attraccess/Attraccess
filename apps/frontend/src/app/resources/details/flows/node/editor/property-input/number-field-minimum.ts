interface NumericSchema {
  type: string;
  exclusiveMinimum?: number;
  minimum?: number;
  multipleOf?: number;
}

interface Decimal {
  coefficient: number;
  scale: number;
}

function asDecimal(value: number): Decimal {
  const [mantissa, exponentText] = value.toString().toLowerCase().split('e');
  const exponent = Number(exponentText ?? 0);
  const [integer, fraction = ''] = mantissa.split('.');
  let coefficient = Number(`${integer}${fraction}`);
  let scale = fraction.length - exponent;

  if (scale < 0) {
    coefficient *= 10 ** -scale;
    scale = 0;
  }

  return { coefficient, scale };
}

function nextMultipleStrictlyGreaterThan(bound: number, multipleOf: number): number {
  const decimalBound = asDecimal(bound);
  const decimalMultiple = asDecimal(multipleOf);
  const scale = Math.max(decimalBound.scale, decimalMultiple.scale);
  const boundCoefficient = decimalBound.coefficient * 10 ** (scale - decimalBound.scale);
  const multipleCoefficient = decimalMultiple.coefficient * 10 ** (scale - decimalMultiple.scale);
  const nextMultiplier = Math.floor(boundCoefficient / multipleCoefficient) + 1;

  return Number(nextMultiplier * multipleCoefficient) / 10 ** scale;
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

  if (schema.multipleOf !== undefined) {
    return nextMultipleStrictlyGreaterThan(schema.exclusiveMinimum, schema.multipleOf);
  }

  return schema.type === 'integer' ? schema.exclusiveMinimum + 1 : nextRepresentableNumber(schema.exclusiveMinimum);
}
