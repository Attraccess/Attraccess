export function dbCurrencyToUserCurrency(amount: number, minorUnit: number) {
  const factor = Math.pow(10, minorUnit);
  return amount / factor;
}

export function userCurrencyToDbCurrency(amount: number, minorUnit: number) {
  const factor = Math.pow(10, minorUnit);
  return Math.round(amount * factor);
}

/** Parse a nonnegative decimal price without passing its major units through Number. */
export function parseCredits(value: string, minorUnit: number): number {
  if (!Number.isInteger(minorUnit) || minorUnit < 0 || minorUnit > 20)
    throw new RangeError('Invalid currency minor unit');
  const match = /^(\d+)(?:[.,](\d*))?$/.exec(value.trim());
  if (!match) throw new RangeError('Invalid decimal price');
  const fraction = (match[2] ?? '').replace(/0+$/, '');
  if (fraction.length > minorUnit) throw new RangeError('Price has too many decimal places');
  const credits = BigInt(match[1] + fraction.padEnd(minorUnit, '0'));
  if (credits > BigInt(Number.MAX_SAFE_INTEGER)) throw new RangeError('Price exceeds the supported billing range');
  return Number(credits);
}

/** Convert integer minor currency units before adding or multiplying charges. */
export function toExactCredits(credits: number): bigint {
  if (!Number.isSafeInteger(credits)) throw new RangeError('Charge exceeds the supported billing range');
  return BigInt(credits);
}

/** Format integer credits without rounding cents through a major-unit Number. */
export function formatCredits(
  amount: number,
  minorUnit: number,
  options: { locale?: string; useGrouping?: boolean; minimumFractionDigits?: number } = {},
): string {
  if (!Number.isInteger(minorUnit) || minorUnit < 0 || minorUnit > 20)
    throw new RangeError('Invalid currency minor unit');
  const { locale = 'en', useGrouping = true, minimumFractionDigits = 0 } = options;
  const credits = toExactCredits(amount);
  const scale = BigInt('1' + '0'.repeat(minorUnit));
  const whole = credits / scale;
  const remainder = credits < BigInt(0) ? -(credits % scale) : credits % scale;
  const fraction = minorUnit
    ? remainder.toString().padStart(minorUnit, '0').replace(/0+$/, '').padEnd(minimumFractionDigits, '0')
    : '';
  const formatter = new Intl.NumberFormat(locale, { useGrouping, maximumFractionDigits: 0 });
  // Negative amounts smaller than one major unit still need their minus sign.
  const parts = formatter.formatToParts(credits < BigInt(0) && whole === BigInt(0) ? -0 : whole);
  if (fraction) {
    const decimal = new Intl.NumberFormat(locale).formatToParts(1.1).find((part) => part.type === 'decimal');
    const position = parts.map((part) => part.type).lastIndexOf('integer') + 1;
    parts.splice(position, 0, { type: 'decimal', value: decimal?.value ?? '.' }, { type: 'fraction', value: fraction });
  }
  return parts.map((part) => part.value).join('');
}

/** Round the discount half towards positive infinity, matching resource settlement. */
export function applyBillingFactor(gross: bigint, factor: number): { amount: number; discount: number } {
  if (!Number.isFinite(factor) || factor < 0) throw new RangeError('Invalid billing factor');
  const match = /^(\d+)(?:\.(\d+))?(?:e([+-]?\d+))?$/.exec(String(factor));
  if (!match) throw new RangeError('Invalid billing factor');
  const fraction = match[2] ?? '';
  const exponent = Number(match[3] ?? 0) - fraction.length;
  const factorNumerator = BigInt(match[1] + fraction) * BigInt('1' + '0'.repeat(Math.max(exponent, 0)));
  const factorDenominator = BigInt('1' + '0'.repeat(Math.max(-exponent, 0)));
  const denominator = BigInt(100) * factorDenominator;
  const numerator = gross * (denominator - factorNumerator);
  const rounded = numerator * BigInt(2) + denominator;
  const divisor = denominator * BigInt(2);
  const discount = rounded >= BigInt(0) ? rounded / divisor : (rounded - divisor + BigInt(1)) / divisor;
  const amount = gross - discount;
  const limit = BigInt(Number.MAX_SAFE_INTEGER);
  if ([gross, discount, amount].some((value) => value > limit || value < -limit))
    throw new RangeError('Charge exceeds the supported billing range');
  return { amount: Number(amount), discount: Number(discount) };
}
