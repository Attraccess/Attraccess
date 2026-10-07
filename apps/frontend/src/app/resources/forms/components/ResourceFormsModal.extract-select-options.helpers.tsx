import { FormFieldType } from '@attraccess/react-query-client';
import type { FieldValue } from './ResourceFormsModal.contracts';
import { LabeledSwitch } from '../../../../components/labeledSwitch';
import { TextField } from '@heroui/react';
import { FieldError } from '@heroui/react';
import { Input } from '@heroui/react';
import { FormResponseDto } from '@attraccess/react-query-client';
import { FieldOptions } from '../../details/forms/types';
import { TextFieldOptions } from '../../details/forms/types';
import { NumberFieldOptions } from '../../details/forms/types';
import { renderTextInput } from './ResourceFormsModal.render-select-input.helpers';
import { renderSelectInput } from './ResourceFormsModal.render-select-input.helpers';
export function extractSelectOptions(raw: unknown): string[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  const unique = new Set<string>();
  const result: string[] = [];
  raw.forEach((option) => {
    if (typeof option !== 'string') {
      return;
    }
    const trimmed = option.trim();
    if (!trimmed || unique.has(trimmed)) {
      return;
    }
    unique.add(trimmed);
    result.push(trimmed);
  });
  return result;
}

export function fieldHasValue(type: FormFieldType, value: FieldValue | undefined) {
  if (type === FormFieldType.BOOLEAN) {
    return typeof value === 'boolean';
  }
  if (type === FormFieldType.SELECT) {
    return typeof value === 'string' && value.trim().length > 0;
  }
  return Boolean(value && String(value).trim().length > 0);
}

export function normalizeValue(
  type: FormFieldType,
  rawValue: FieldValue | undefined,
  t: (key: string) => string,
  errors: Record<number, string | null>,
  fieldId: number,
  selectOptions?: string[],
) {
  switch (type) {
    case FormFieldType.TEXT:
      return String(rawValue);
    case FormFieldType.NUMBER: {
      const numericValue = Number(rawValue);
      if (Number.isNaN(numericValue)) {
        errors[fieldId] = t('modal.numberInvalid');
        return undefined;
      }
      return numericValue;
    }
    case FormFieldType.BOOLEAN:
      return Boolean(rawValue);
    case FormFieldType.SELECT: {
      const value = typeof rawValue === 'string' ? rawValue : '';
      if (!selectOptions?.length) {
        errors[fieldId] = t('modal.selectUnavailable');
        return undefined;
      }
      if (!selectOptions.includes(value)) {
        errors[fieldId] = t('modal.selectInvalid');
        return undefined;
      }
      return value;
    }
    default:
      return rawValue ?? '';
  }
}

export function renderBooleanInput(
  value: FieldValue | undefined,
  onChange: (value: FieldValue) => void,
  error: string | null | undefined,
  t: (key: string) => string,
) {
  const isChecked = value === true;

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-3">
        <span className="text-xs text-default-500">{t('modal.booleanNo')}</span>
        <LabeledSwitch
          isSelected={isChecked}
          onChange={(checked) => onChange(checked)}
          aria-label={t('modal.booleanLabel')}
          className={error ? 'text-danger' : undefined}
        />
        <span className="text-xs text-default-500">{t('modal.booleanYes')}</span>
      </div>
      {error && (
        <p className="flex items-start gap-1 text-sm font-medium text-danger">
          <span aria-hidden="true">⚠</span>
          <span>{error}</span>
        </p>
      )}
    </div>
  );
}

export function renderNumberInput(
  options: NumberFieldOptions,
  value: FieldValue | undefined,
  onChange: (value: FieldValue) => void,
  error?: string | null,
) {
  const min = typeof options.min === 'number' ? options.min : undefined;
  const max = typeof options.max === 'number' ? options.max : undefined;
  const step = typeof options.step === 'number' ? options.step : undefined;

  return (
    <TextField value={(value as string) ?? ''} onChange={onChange as (v: string) => void} isInvalid={Boolean(error)}>
      <Input type="number" min={min} max={max} step={step} />
      {error && <FieldError>{error}</FieldError>}
    </TextField>
  );
}

export function renderFieldInput(
  field: FormResponseDto['fields'][number],
  options: FieldOptions,
  selectOptions: string[] | undefined,
  value: FieldValue | undefined,
  onChange: (value: FieldValue) => void,
  error: string | null | undefined,
  t: (key: string) => string,
) {
  switch (field.type) {
    case FormFieldType.TEXT:
      return renderTextInput(options as TextFieldOptions, value, onChange, error);
    case FormFieldType.NUMBER:
      return renderNumberInput(options as NumberFieldOptions, value, onChange, error);
    case FormFieldType.BOOLEAN:
      return renderBooleanInput(value, onChange, error, t);
    case FormFieldType.SELECT:
      return renderSelectInput(selectOptions ?? [], value, onChange, error, t, field.name);
    default:
      return (
        <TextField
          value={(value as string) ?? ''}
          onChange={onChange as (v: string) => void}
          isInvalid={Boolean(error)}
        >
          <Input />
          {error && <FieldError>{error}</FieldError>}
        </TextField>
      );
  }
}
