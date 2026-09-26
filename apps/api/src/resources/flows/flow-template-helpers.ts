import Handlebars from 'handlebars';

function integer(value: unknown): bigint {
  const parsed = typeof value === 'string' && /^-?(0|[1-9][0-9]*)$/.test(value) ? Number(value) : value;
  if (typeof parsed !== 'number' || !Number.isSafeInteger(parsed))
    throw new Error('Flow arithmetic requires safe integers; missing or fractional values are not zero');
  return BigInt(parsed);
}

function safeNumber(value: bigint): number {
  const number = Number(value);
  if (!Number.isSafeInteger(number)) throw new Error('Flow arithmetic result exceeds the safe integer range');
  return number;
}

/** Integer arithmetic for metered quantities; roundRatio avoids floating-point currency rounding. */
export function registerFlowTemplateHelpers(handlebars: typeof Handlebars): void {
  handlebars.registerHelper('json', (value: unknown) => {
    try {
      return new handlebars.SafeString(JSON.stringify(value));
    } catch {
      return 'null';
    }
  });
  handlebars.registerHelper('subtract', (left: unknown, right: unknown) => safeNumber(integer(left) - integer(right)));
  handlebars.registerHelper('divide', (value: unknown, divisor: unknown) => {
    const denominator = integer(divisor);
    if (denominator === BigInt(0)) throw new Error('Flow arithmetic cannot divide by zero');
    return Number(integer(value)) / Number(denominator);
  });
  handlebars.registerHelper('roundRatio', (value: unknown, multiplier: unknown, divisor: unknown) => {
    const denominator = integer(divisor);
    if (denominator <= BigInt(0)) throw new Error('Flow rounding requires a positive divisor');
    const product = integer(value) * integer(multiplier);
    const sign = product < BigInt(0) ? BigInt(-1) : BigInt(1);
    // Round half away from zero, with exact integer intermediates even for large counters.
    return safeNumber(sign * ((product * sign + denominator / BigInt(2)) / denominator));
  });
  handlebars.registerHelper('timestamp', (value: unknown) => {
    const timestamp =
      value instanceof Date
        ? value.getTime()
        : typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(value)
          ? Date.parse(value)
          : NaN;
    if (!Number.isSafeInteger(timestamp)) throw new Error('Flow timestamp must be a valid ISO date or Date');
    return timestamp;
  });
  handlebars.registerHelper('now', () => Date.now());
}
