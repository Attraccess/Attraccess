import { FlowExecutionError } from '../errors/flow-execution.error';

function fraction(value: unknown): [bigint, bigint] {
  const text = typeof value === 'number' || typeof value === 'string' ? String(value).trim() : '';
  const match = /^([+-]?)(\d+)(?:\.(\d+))?(?:[eE]([+-]?\d+))?$/.exec(text);
  if (!match || text.length > 100) throw new FlowExecutionError('scaleDecimal expects decimal numbers');
  const digits = match[3] ?? '';
  const exponent = Number(match[4] ?? 0) - digits.length;
  if (Math.abs(exponent) > 100) throw new FlowExecutionError('scaleDecimal operand is out of range');
  const power = (n: number) => BigInt('1' + '0'.repeat(n));
  return [
    BigInt(match[2] + digits) * (match[1] === '-' ? BigInt(-1) : BigInt(1)) * power(Math.max(exponent, 0)),
    power(Math.max(-exponent, 0)),
  ];
}

/** Scale decimal strings by a decimal or rational factor without floating-point intermediates. */
export function scaleDecimal(value: unknown, factor: unknown, precision = 9, minimum?: unknown): string {
  if (!Number.isInteger(precision) || precision < 0 || precision > 18)
    throw new FlowExecutionError('scaleDecimal precision must be an integer between 0 and 18');
  const parts = String(factor).split('/');
  if (parts.length > 2) throw new FlowExecutionError('scaleDecimal expects a decimal or rational factor');
  const [valueN, valueD] = fraction(value);
  if (minimum !== undefined) {
    const [minimumN, minimumD] = fraction(minimum);
    if (valueN * minimumD < minimumN * valueD) throw new FlowExecutionError('scaleDecimal value is below its minimum');
  }
  const [factorN, factorD] = fraction(parts[0]);
  const [divisorN, divisorD] = fraction(parts[1] ?? '1');
  if (divisorN === BigInt(0)) throw new FlowExecutionError('scaleDecimal cannot divide by zero');
  const numerator = valueN * factorN * divisorD;
  const denominator = valueD * factorD * divisorN;
  const negative = numerator < BigInt(0) !== denominator < BigInt(0);
  const absolute = (n: bigint) => (n < BigInt(0) ? -n : n);
  const scale = BigInt('1' + '0'.repeat(precision));
  const rounded =
    (absolute(numerator) * scale * BigInt(2) + absolute(denominator)) / (absolute(denominator) * BigInt(2));
  const decimals = precision ? (rounded % scale).toString().padStart(precision, '0').replace(/0+$/, '') : '';
  return `${negative && rounded !== BigInt(0) ? '-' : ''}${rounded / scale}${decimals ? '.' + decimals : ''}`;
}
