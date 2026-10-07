import { dataFields } from './audit-projection';
export function stringArray(value: unknown, max = 100): boolean {
  return (
    Array.isArray(value) &&
    value.length <= max &&
    value.every((entry) => typeof entry === 'string' && entry.length <= 255)
  );
}
export function roleMappings(value: unknown): boolean {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const summary = dataFields(value, ['mappedRoleCount', 'externalValueCount', 'truncated']);
    if (summary && Reflect.ownKeys(summary).length === 3) {
      return (
        Number.isInteger(summary.mappedRoleCount) &&
        (summary.mappedRoleCount as number) >= 0 &&
        Number.isInteger(summary.externalValueCount) &&
        (summary.externalValueCount as number) >= 0 &&
        summary.truncated === true
      );
    }
  }
  if (!value || typeof value !== 'object') return false;
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return false;
  const keys = Reflect.ownKeys(value);
  if (keys.length > 100 || keys.some((key) => typeof key !== 'string')) return false;
  return keys.every((key) => {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    return (
      typeof key === 'string' &&
      !!descriptor &&
      'value' in descriptor &&
      /^[a-z0-9][a-z0-9_-]{0,127}$/.test(key) &&
      stringArray(descriptor.value)
    );
  });
}
export function safeUrl(value: unknown): boolean {
  if (typeof value !== 'string' || value.length === 0 || value.length > 2048) return false;
  try {
    const url = new URL(value);
    return (
      (url.protocol === 'http:' || url.protocol === 'https:') &&
      !url.username &&
      !url.password &&
      !url.search &&
      !url.hash
    );
  } catch {
    return false;
  }
}
export function opaqueSamlEntityId(value: unknown): boolean {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.length > 96 ||
    Array.from(value).some((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127)
  )
    return false;
  try {
    const url = new URL(value);
    return !url.username && !url.password && !url.search && !url.hash;
  } catch {
    return true;
  }
}
export function omissionMetadata(value: unknown, allowed: readonly string[]): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const fields = value as Record<string, unknown>;
  return (
    Object.keys(fields).length <= 10 &&
    Object.keys(fields).every((key) => allowed.includes(key)) &&
    Object.values(fields).every((metadata) => {
      const entry = dataFields(metadata, ['byteLength', 'count']);
      if (!entry || Object.keys(entry).length === 0) return false;
      return (
        (entry.byteLength === undefined ||
          (Number.isSafeInteger(entry.byteLength) && (entry.byteLength as number) >= 0)) &&
        (entry.count === undefined || (Number.isInteger(entry.count) && (entry.count as number) >= 0))
      );
    })
  );
}
export function omittedField(value: unknown, field: string): boolean {
  return !!value && typeof value === 'object' && !Array.isArray(value) && Object.hasOwn(value, field);
}
