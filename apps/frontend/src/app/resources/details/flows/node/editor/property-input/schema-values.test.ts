import { describe, expect, it } from 'vitest';
import { initializeValue, isValueValid } from './schema-values';
import type { Property } from './index';

describe('schema values', () => {
  it('rejects unresolved required fields even when they are not yet exposed as controls', () => {
    expect(isValueValid({ type: 'object', properties: { controllerId: { type: 'number' } }, required: ['controllerId', 'channelId'] }, { controllerId: 1 }, true)).toBe(false);
  });

  it('rejects invalid read-only numeric values and wrong primitive types', () => {
    expect(isValueValid({ type: 'integer', minimum: 1, readOnly: true }, 0, true)).toBe(false);
    expect(isValueValid({ type: 'integer' }, 1.5, true)).toBe(false);
    expect(isValueValid({ type: 'boolean' }, 'false', true)).toBe(false);
    expect(isValueValid({ type: 'array' }, {}, true)).toBe(false);
  });

  it('initializes nested objects and array rows without mutating defaults or existing values', () => {
    const schema: Property<unknown> = {
      type: 'object',
      properties: {
        rows: {
          type: 'array',
          items: {
            type: 'object',
            required: ['enabled'],
            properties: {
              enabled: { type: 'boolean' },
              text: { type: 'string', default: 'default' },
            },
          },
        },
        settings: {
          type: 'object',
          default: { name: 'example' },
          properties: {
            name: { type: 'string' },
            count: { type: 'number', default: 0 },
          },
        },
        fixed: { type: 'string', readOnly: true, default: 'fixed' },
      },
    };
    const current = { rows: [{ text: 'existing' }, {}], fixed: 'old' };
    expect(initializeValue(schema, current)).toEqual({
      rows: [
        { text: 'existing', enabled: false },
        { text: 'default', enabled: false },
      ],
      settings: { name: 'example', count: 0 },
      fixed: 'fixed',
    });
    expect(current.rows).toEqual([{ text: 'existing' }, {}]);
    expect(schema.properties?.settings.default).toEqual({ name: 'example' });
  });

  it('accepts compatible numeric enum keys, including zero, and rejects removed selections', () => {
    const schema: Property<unknown> = { type: 'integer', oneOf: [{ const: 0 }, { const: 2 }] };
    expect(isValueValid(schema, '0', true)).toBe(true);
    expect(isValueValid(schema, 0, true)).toBe(true);
    expect(isValueValid(schema, 1, true)).toBe(false);
    expect(isValueValid(schema, undefined, true)).toBe(false);
    expect(isValueValid(schema, undefined)).toBe(true);
    expect(isValueValid({ type: 'number' }, NaN, true)).toBe(false);
  });

  it('validates required fields within objects and array rows', () => {
    const schema: Property<unknown> = {
      type: 'array',
      items: {
        type: 'object',
        required: ['choice'],
        properties: {
          choice: { type: 'string', enum: ['yes'] },
        },
      },
    };
    expect(isValueValid(schema, [{}])).toBe(false);
    expect(isValueValid(schema, [{ choice: 'removed' }])).toBe(false);
    expect(isValueValid(schema, [{ choice: 'yes' }])).toBe(true);
  });
});
