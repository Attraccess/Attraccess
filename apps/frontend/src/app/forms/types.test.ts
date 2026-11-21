import { describe, expect, it } from 'vitest';
import { FormFieldType } from '@attraccess/react-query-client';
import { parseFieldOptions, serializeFieldOptions, parseFieldFromResponse } from './types';

describe('resource form field persistence', () => {
  it.each([
    [FormFieldType.TEXT, { placeholder: 'Type here', multiline: true }],
    [FormFieldType.NUMBER, { min: 0, max: 100, step: 0.5 }],
    [FormFieldType.SELECT, ['Red', 'Green', 'Blue']],
    [FormFieldType.BOOLEAN, { trueLabel: 'Yes', falseLabel: 'No' }],
  ] as const)('round trips %s field settings', (type, persisted) => {
    const raw = Array.isArray(persisted) ? [...persisted] : { ...persisted };
    expect(serializeFieldOptions(type, parseFieldOptions(type, raw))).toEqual(persisted);
  });
  it('accepts legacy numeric strings but rejects nonnumeric and blank constraints', () => {
    expect(parseFieldOptions(FormFieldType.NUMBER, { min: '-3', max: '42', step: '0.25' })).toEqual({
      min: -3,
      max: 42,
      step: 0.25,
    });
    expect(parseFieldOptions(FormFieldType.NUMBER, { min: ' ', max: NaN, step: 'invalid' })).toEqual({
      min: '',
      max: '',
      step: '',
    });
    expect(parseFieldOptions(FormFieldType.NUMBER, { min: Infinity, max: null, step: true })).toEqual({
      min: '',
      max: '',
      step: '',
    });
  });
  it('uses defaults for absent, mismatched, and malformed option shapes', () => {
    expect(parseFieldOptions(FormFieldType.TEXT, { placeholder: 5, multiline: 'true' })).toEqual({
      placeholder: '',
      multiline: false,
    });
    expect(parseFieldOptions(FormFieldType.TEXT, [])).toEqual({ placeholder: '', multiline: false });
    expect(parseFieldOptions(FormFieldType.NUMBER, [])).toEqual({ min: '', max: '', step: '' });
    expect(parseFieldOptions(FormFieldType.BOOLEAN, [])).toEqual({ trueLabel: '', falseLabel: '' });
    expect(parseFieldOptions(FormFieldType.SELECT, {})).toEqual({ options: [] });
    expect(parseFieldOptions(FormFieldType.SELECT, null)).toEqual({ options: [] });
  });
  it('omits empty options and trims display labels without discarding numeric zero', () => {
    expect(serializeFieldOptions(FormFieldType.TEXT, { placeholder: '  ', multiline: undefined })).toBeNull();
    expect(serializeFieldOptions(FormFieldType.NUMBER, { min: '', max: undefined, step: '' })).toBeNull();
    expect(serializeFieldOptions(FormFieldType.SELECT, { options: [] })).toBeNull();
    expect(serializeFieldOptions(FormFieldType.BOOLEAN, { trueLabel: ' ', falseLabel: '' })).toBeNull();
    expect(serializeFieldOptions(FormFieldType.TEXT, { placeholder: ' hi ', multiline: false })).toEqual({
      placeholder: 'hi',
      multiline: false,
    });
    expect(serializeFieldOptions(FormFieldType.BOOLEAN, { trueLabel: ' yes ', falseLabel: ' no ' })).toEqual({
      trueLabel: 'yes',
      falseLabel: 'no',
    });
    expect(serializeFieldOptions(FormFieldType.NUMBER, { min: 0 })).toEqual({ min: 0 });
  });
  it('preserves field identity and required status when opening an existing form', () => {
    expect(
      parseFieldFromResponse({
        id: 8,
        position: 0,
        name: 'Temperature',
        type: FormFieldType.NUMBER,
        isRequired: true,
        description: 'Degrees',
        options: { min: 0, max: 30 },
      }),
    ).toEqual({
      id: 8,
      name: 'Temperature',
      type: FormFieldType.NUMBER,
      isRequired: true,
      description: 'Degrees',
      options: { min: 0, max: 30, step: '' },
    });
  });
});
