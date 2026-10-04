export function dbCurrencyToUserCurrency(amount: number, minorUnit: number) {
  const factor = Math.pow(10, minorUnit);
  return amount / factor;
}

export function userCurrencyToDbCurrency(amount: number, minorUnit: number) {
  const factor = Math.pow(10, minorUnit);
  return Math.round(amount * factor);
}

/** Convert integer minor currency units before adding or multiplying charges. */
export function toExactCredits(credits: number): bigint {
  if (!Number.isSafeInteger(credits)) throw new RangeError('Charge exceeds the supported billing range');
  return BigInt(credits);
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
