import { PLUGIN_AUDIT_LIMITS } from './plugin-audit-policy';

export const isPlainRecord = (value: unknown): value is Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
};

export function validateFieldChoices(path: string, policy: Record<string, unknown>, declared: string): void {
  if (policy.pattern !== undefined) {
    if (declared !== 'string') throw new Error(`${path}: pattern requires type 'string'`);
    if (typeof policy.pattern !== 'string' || policy.pattern.length > PLUGIN_AUDIT_LIMITS.patternLength)
      throw new Error(`${path}: pattern must be a string of at most ${PLUGIN_AUDIT_LIMITS.patternLength} characters`);
    try {
      new RegExp(policy.pattern);
    } catch {
      throw new Error(`${path}: pattern is not a valid regular expression`);
    }
  }
  if (policy.oneOf !== undefined) {
    const entries = policy.oneOf;
    if (
      !Array.isArray(entries) ||
      entries.length === 0 ||
      entries.length > PLUGIN_AUDIT_LIMITS.oneOfEntries ||
      entries.some((entry) => typeof entry !== declared)
    )
      throw new Error(`${path}: oneOf must be 1-${PLUGIN_AUDIT_LIMITS.oneOfEntries} values of type '${declared}'`);
  }
}

export function validateFieldPolicy(path: string, policy: unknown): void {
  if (!isPlainRecord(policy)) throw new Error(`${path}: field policy must be a plain object`);
  const declared = policy.type;
  if (declared !== 'string' && declared !== 'number' && declared !== 'boolean')
    throw new Error(`${path}: field type must be 'string', 'number' or 'boolean'`);
  const keys = Object.keys(policy);
  for (const key of keys)
    if (!['type', 'pattern', 'oneOf', 'min', 'max', 'integer', 'maxLength'].includes(key))
      throw new Error(`${path}: unknown field policy property "${key}"`);
  validateFieldChoices(path, policy, declared);
  for (const bound of ['min', 'max'] as const)
    if (policy[bound] !== undefined) {
      if (declared !== 'number' || typeof policy[bound] !== 'number' || !Number.isFinite(policy[bound] as number))
        throw new Error(`${path}: ${bound} requires a finite number and type 'number'`);
    }
  if (policy.integer !== undefined) {
    if (declared !== 'number' || typeof policy.integer !== 'boolean')
      throw new Error(`${path}: integer requires a boolean and type 'number'`);
  }
  if (policy.maxLength !== undefined) {
    if (
      declared !== 'string' ||
      typeof policy.maxLength !== 'number' ||
      !Number.isSafeInteger(policy.maxLength) ||
      policy.maxLength < 1 ||
      policy.maxLength > PLUGIN_AUDIT_LIMITS.maxLengthCeiling
    )
      throw new Error(
        `${path}: maxLength requires an integer 1-${PLUGIN_AUDIT_LIMITS.maxLengthCeiling} and type 'string'`,
      );
  }
}
