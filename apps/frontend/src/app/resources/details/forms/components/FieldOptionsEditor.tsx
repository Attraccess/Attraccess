import { DatePicker, Input, Switch } from '@heroui/react';
import type { ComponentType } from 'react';
import { DateValue, getLocalTimeZone, parseAbsoluteToLocal } from '@internationalized/date';
import { FormFieldType } from '@attraccess/react-query-client';
import {
  EditableFormField,
  TextFieldOptions,
  NumberFieldOptions,
  DatetimeFieldOptions,
  BooleanFieldOptions,
} from '../types';

// HeroUI bundles its own @internationalized/date types, so we cast to loosen props.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const AnyDatePicker = DatePicker as unknown as ComponentType<any>;

interface FieldOptionsEditorProps {
  field: EditableFormField;
  onChange: (field: EditableFormField) => void;
  t: (key: string) => string;
}

export function FieldOptionsEditor({ field, onChange, t }: FieldOptionsEditorProps) {
  const updateOptions = (nextOptions: typeof field.options) => {
    onChange({ ...field, options: { ...field.options, ...nextOptions } });
  };

  return (
    <div className="rounded-lg border border-default-200 dark:border-default-100 p-4 space-y-3">
      <p className="text-sm font-semibold text-default-600">{t('fields.optionsTitle')}</p>
      {renderOptionsByType(field.type, field.options, updateOptions, t)}
    </div>
  );
}

function renderOptionsByType(
  type: FormFieldType,
  options: EditableFormField['options'],
  updateOptions: (options: EditableFormField['options']) => void,
  t: (key: string) => string,
) {
  switch (type) {
    case FormFieldType.TEXT: {
      const textOptions = options as TextFieldOptions;
      return (
        <div className="space-y-3">
          <Input
            label={t('fields.options.text.placeholder')}
            value={textOptions.placeholder ?? ''}
            onChange={(event) => updateOptions({ placeholder: event.target.value })}
          />
          <Switch
            isSelected={Boolean(textOptions.multiline)}
            onValueChange={(value) => updateOptions({ multiline: value })}
          >
            {t('fields.options.text.multiline')}
          </Switch>
        </div>
      );
    }
    case FormFieldType.NUMBER: {
      const numberOptions = options as NumberFieldOptions;
      return (
        <div className="grid gap-3 md:grid-cols-3">
          <Input
            label={t('fields.options.number.min')}
            type="number"
            value={numberOptions.min === '' || numberOptions.min === undefined ? '' : String(numberOptions.min)}
            onChange={(event) => updateOptions({ min: event.target.value === '' ? '' : Number(event.target.value) })}
          />
          <Input
            label={t('fields.options.number.max')}
            type="number"
            value={numberOptions.max === '' || numberOptions.max === undefined ? '' : String(numberOptions.max)}
            onChange={(event) => updateOptions({ max: event.target.value === '' ? '' : Number(event.target.value) })}
          />
          <Input
            label={t('fields.options.number.step')}
            type="number"
            value={numberOptions.step === '' || numberOptions.step === undefined ? '' : String(numberOptions.step)}
            onChange={(event) => updateOptions({ step: event.target.value === '' ? '' : Number(event.target.value) })}
          />
        </div>
      );
    }
    case FormFieldType.DATETIME: {
      const datetimeOptions = options as DatetimeFieldOptions;
      return (
        <div className="grid gap-3 md:grid-cols-2">
          <AnyDatePicker
            label={t('fields.options.datetime.earliest')}
            labelPlacement="outside"
            granularity="minute"
            value={isoToZonedDateTime(datetimeOptions.earliest)}
            onChange={(value: DateValue | null) => updateOptions({ earliest: dateValueToIso(value) ?? '' })}
          />
          <AnyDatePicker
            label={t('fields.options.datetime.latest')}
            labelPlacement="outside"
            granularity="minute"
            value={isoToZonedDateTime(datetimeOptions.latest)}
            onChange={(value: DateValue | null) => updateOptions({ latest: dateValueToIso(value) ?? '' })}
          />
        </div>
      );
    }
    case FormFieldType.BOOLEAN: {
      const booleanOptions = options as BooleanFieldOptions;
      return (
        <div className="grid gap-3 md:grid-cols-2">
          <Input
            label={t('fields.options.boolean.trueLabel')}
            value={booleanOptions.trueLabel ?? ''}
            onChange={(event) => updateOptions({ trueLabel: event.target.value })}
          />
          <Input
            label={t('fields.options.boolean.falseLabel')}
            value={booleanOptions.falseLabel ?? ''}
            onChange={(event) => updateOptions({ falseLabel: event.target.value })}
          />
        </div>
      );
    }
    default:
      return null;
  }
}

const isoToZonedDateTime = (value?: string): DateValue | null => {
  if (!value) {
    return null;
  }

  try {
    return parseAbsoluteToLocal(value) as DateValue;
  } catch {
    return null;
  }
};

const dateValueToIso = (value?: DateValue | null) => {
  if (!value) {
    return undefined;
  }

  return value.toDate(getLocalTimeZone()).toISOString();
};
