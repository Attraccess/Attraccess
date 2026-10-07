import { TextField, FieldError, Input } from '@heroui/react';
import { FormFieldType, FormResponseDto } from '@attraccess/react-query-client';
import { FieldOptions, TextFieldOptions, NumberFieldOptions } from '../../details/forms/types';
import { FieldValue } from './ResourceFormsModal.field-value';
import { renderTextInput } from './ResourceFormsModal.render-text-input';
import { renderNumberInput } from './ResourceFormsModal.render-number-input';
import { renderBooleanInput } from './ResourceFormsModal.render-boolean-input';
import { renderSelectInput } from './ResourceFormsModal.render-select-input';

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
