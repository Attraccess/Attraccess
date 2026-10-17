/** Shared low-level projection primitives for audit policies. Never serialize caller objects directly. */

export const positive = (v: unknown): v is number => Number.isSafeInteger(v) && (v as number) > 0;

export const uuid = (v: unknown): v is string =>
  typeof v === 'string' && /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(v);

export const oneOf =
  (...values: string[]) =>
  (v: unknown) =>
    values.includes(v as string);

/**
 * Copies an unknown value into a null-prototype object when it is a plain
 * record whose own enumerable string keys are exactly a subset of `allowed`.
 * Rejects class instances, arrays and accessor properties so caller objects are
 * never serialized or their accessors invoked.
 */
export function dataFields(value: unknown, allowed: readonly string[]): Record<string, unknown> | null {
  if (!value || typeof value !== 'object') return null;
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return null;
  const keys = Reflect.ownKeys(value);
  if (keys.length > allowed.length) return null;
  const copy: Record<string, unknown> = Object.create(null);
  for (const key of keys) {
    if (typeof key !== 'string' || !allowed.includes(key)) return null;
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !('value' in descriptor)) return null;
    copy[key] = descriptor.value;
  }
  return copy;
}

/** Every audit details payload is bounded to this many UTF-8 bytes once serialized. */
export const AUDIT_DETAILS_BYTE_LIMIT = 4096;

export const withinDetailsLimit = (details: Record<string, unknown>): boolean =>
  Buffer.byteLength(JSON.stringify(details), 'utf8') <= AUDIT_DETAILS_BYTE_LIMIT;
