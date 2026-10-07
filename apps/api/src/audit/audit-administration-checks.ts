import { valid } from 'semver';
import { safeAuditOrigin, safeRequestedSpec } from './audit-administration-safe-values';
import { Check } from './audit-administration-types';

export const text: Check = (v) =>
  typeof v === 'string' && v.length <= 256 && Array.from(v).every((character) => character.charCodeAt(0) >= 32);
export const flag: Check = (v) => v === 0 || v === 1;
export const enumeration =
  (...values: string[]): Check =>
  (v) =>
    typeof v === 'string' && values.includes(v);
export const identifier: Check = (v) => typeof v === 'string' && /^[a-zA-Z0-9_.@/-]{1,214}$/.test(v);
export const exactVersion: Check = (v) => typeof v === 'string' && v.length <= 100 && !!valid(v);
export const spec: Check = (v) => typeof v === 'string' && v === safeRequestedSpec(v);
export const origin: Check = (v) => typeof v === 'string' && v === safeAuditOrigin(v);
export const count: Check = (v) => Number.isSafeInteger(v) && (v as number) >= 0;
export const positive: Check = (v) => count(v) && (v as number) > 0;
export const permissions: Check = (v) => {
  if (typeof v !== 'string' || v.length > 4096) return false;
  try {
    const values = JSON.parse(v);
    return (
      Array.isArray(values) &&
      values.length <= 100 &&
      values.every((value) => typeof value === 'string' && /^[a-zA-Z0-9_.*:-]{1,120}$/.test(value))
    );
  } catch {
    return false;
  }
};
export const locale: Check = (v) => typeof v === 'string' && /^[a-z]{2,3}(-[A-Z]{2,3})?$/.test(v);
