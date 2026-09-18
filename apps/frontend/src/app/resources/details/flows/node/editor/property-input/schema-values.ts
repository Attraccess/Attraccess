import type { Property } from './index';

export function initializeValue(schema: Property<unknown>, value: unknown, required = false): unknown {
  if (schema.default !== undefined && (value === undefined || schema.readOnly)) {
    value = structuredClone(schema.default);
  }
  if (schema.type === 'object' && schema.properties) {
    const source = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
    const result: Record<string, unknown> = { ...source };
    for (const [name, property] of Object.entries(schema.properties)) {
      const next = initializeValue(property, source[name], schema.required?.includes(name));
      if (next !== undefined) result[name] = next;
    }
    return value !== undefined || required || Object.keys(result).length ? result : undefined;
  }
  if (schema.type === 'array' && Array.isArray(value) && schema.items) {
    return value.map((item) => initializeValue(schema.items as Property<unknown>, item, true));
  }
  if (value === undefined && required) {
    if (schema.type === 'boolean') return false;
    if (schema.type === 'string' && !schema.enum && !schema.oneOf) return '';
    if (schema.type === 'array') return [];
    if (schema.type === 'object') return {};
  }
  return value;
}

export function isValueValid(schema: Property<unknown>, value: unknown, required = false): boolean {
  if (value === undefined || value === null || value === '') return !required;
  const choices = schema.oneOf?.map((item) => item.const) ?? schema.enum;
  if (choices && !choices.some((choice) => String(choice) === String(value))) return false;
  if (schema.type === 'boolean' && typeof value !== 'boolean') return false;
  if (schema.type === 'string' && typeof value !== 'string') return false;
  if (schema.type === 'number' || schema.type === 'integer') {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return false;
    if (schema.type === 'integer' && !Number.isInteger(numeric)) return false;
    if (schema.minimum !== undefined && numeric < schema.minimum) return false;
    if (schema.maximum !== undefined && numeric > schema.maximum) return false;
    if (schema.exclusiveMinimum !== undefined && numeric <= schema.exclusiveMinimum) return false;
  }
  if (schema.type === 'object' && schema.properties) {
    if (typeof value !== 'object' || Array.isArray(value)) return false;
    const object = value as Record<string, unknown>;
    if (schema.required?.some((name) => object[name] === undefined || object[name] === null || object[name] === '')) return false;
    return Object.entries(schema.properties).every(([name, property]) =>
      isValueValid(property, object[name], schema.required?.includes(name)),
    );
  }
  if (schema.type === 'array' && !Array.isArray(value)) return false;
  if (schema.type === 'array' && schema.items && Array.isArray(value)) {
    return value.every((item) => isValueValid(schema.items as Property<unknown>, item, true));
  }
  return true;
}
